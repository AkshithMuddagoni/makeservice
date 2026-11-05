import assert from "node:assert/strict";
import test from "node:test";
import {
  createJobRequestInputSchema,
  discoverProvidersInputSchema,
  setProviderPresenceInputSchema,
  submitProviderQuoteInputSchema,
  acceptProviderQuoteInputSchema,
  setProviderServiceAvailabilityInputSchema,
  setProviderAssetAvailabilityInputSchema,
  getBookingDetailInputSchema,
  updateProviderBookingStatusInputSchema,
  issueBookingStartCodeInputSchema,
  verifyBookingStartCodeInputSchema,
  updateBookingParticipantInputSchema,
  updateProviderBookingLocationInputSchema,
  stopProviderBookingLocationInputSchema,
  sendBookingMessageInputSchema,
  submitProviderReviewInputSchema,
} from "./marketplace-validation.ts";

const site = {
  label: "Construction site",
  area: "Kompally",
  city: "Hyderabad",
  district: "Medchal-Malkajgiri",
  state: "Telangana",
  pincode: "500014",
  address: "Plot 12, service road",
  landmark: "Near water tank",
  lat: 17.538,
  lng: 78.481,
};

const request = {
  serviceId: "borewell",
  businessId: "b5d6f81f-62b3-43c0-9735-5a82f02ed9bb",
  site,
  requirements: { expected_depth: "500 ft", site_access: "Easy access" },
  whenLabel: "Tomorrow",
  scheduledFor: null,
  notes: "Please call before arriving.",
  detailsConsent: true,
};

test("provider discovery accepts a well-formed India work site", () => {
  assert.equal(discoverProvidersInputSchema.parse({ serviceId: "borewell", site }).serviceId, "borewell");
});

test("customer request accepts valid details and explicit consent", () => {
  const parsed = createJobRequestInputSchema.parse(request);
  assert.equal(parsed.businessId, request.businessId);
  assert.deepEqual(parsed.requirements, request.requirements);
});

test("customer request rejects invalid PIN codes and coordinates", () => {
  assert.throws(() => createJobRequestInputSchema.parse({ ...request, site: { ...site, pincode: "50A014" } }));
  assert.throws(() => discoverProvidersInputSchema.parse({ serviceId: "borewell", site: { ...site, lat: 91 } }));
  assert.throws(() => discoverProvidersInputSchema.parse({ serviceId: "borewell", site: { ...site, lng: -181 } }));
});

test("customer request requires explicit consent and safe service identifiers", () => {
  assert.throws(() => createJobRequestInputSchema.parse({ ...request, detailsConsent: false }));
  assert.throws(() => discoverProvidersInputSchema.parse({ serviceId: "../admin", site }));
});

test("customer request rejects excess fields and oversized data", () => {
  assert.throws(() => createJobRequestInputSchema.parse({ ...request, isAdmin: true }));
  assert.throws(() => createJobRequestInputSchema.parse({ ...request, notes: "x".repeat(2001) }));
  assert.throws(() => createJobRequestInputSchema.parse({
    ...request,
    requirements: Object.fromEntries(Array.from({ length: 31 }, (_, i) => ["field_" + i, "value"])),
  }));
});

test("customer request accepts an offset-aware scheduled timestamp", () => {
  const parsed = createJobRequestInputSchema.parse({
    ...request,
    scheduledFor: "2026-11-04T10:30:00+05:30",
  });
  assert.equal(parsed.scheduledFor, "2026-11-04T10:30:00+05:30");
});

 
const quoteInput = {
  requestId: "b5d6f81f-62b3-43c0-9735-5a82f02ed9bb",
  businessId: "c6e7a92f-73c4-44d1-9846-6b93f03e0acc",
  amountRupees: 18500,
  note: "Includes rig setup, drilling labour and the agreed depth range.",
  inclusions: ["Rig and operator", "Standard drilling labour"],
  exclusions: ["Electrical connection", "Site permission charges"],
  extraCharges: [{ label: "Additional casing pipe", amountRupees: 1500 }],
  cancellationTerms: "Reschedule with 24 hours notice. Dispatch charges apply after vehicle movement.",
  etaMinutes: 90,
};

test("provider presence accepts only business UUID and explicit boolean state", () => {
  assert.deepEqual(
    setProviderPresenceInputSchema.parse({
      businessId: quoteInput.businessId,
      isOnline: true,
    }),
    { businessId: quoteInput.businessId, isOnline: true },
  );
  assert.throws(() => setProviderPresenceInputSchema.parse({
    businessId: quoteInput.businessId,
    isOnline: "true",
  }));
  assert.throws(() => setProviderPresenceInputSchema.parse({
    businessId: quoteInput.businessId,
    isOnline: true,
    ownerUserId: "customer-1",
  }));
});

test("provider quote accepts a complete INR quote and contract fields", () => {
  const parsed = submitProviderQuoteInputSchema.parse(quoteInput);
  assert.equal(parsed.amountRupees, 18500);
  assert.equal(parsed.extraCharges[0]?.amountRupees, 1500);
});

test("provider quote rejects invalid price, missing terms and out-of-range ETA", () => {
  assert.throws(() => submitProviderQuoteInputSchema.parse({ ...quoteInput, amountRupees: 0 }));
  assert.throws(() => submitProviderQuoteInputSchema.parse({ ...quoteInput, amountRupees: 100.5 }));
  assert.throws(() => submitProviderQuoteInputSchema.parse({ ...quoteInput, cancellationTerms: "no" }));
  assert.throws(() => submitProviderQuoteInputSchema.parse({ ...quoteInput, etaMinutes: 10081 }));
  assert.throws(() => submitProviderQuoteInputSchema.parse({ ...quoteInput, isAdmin: true }));
  assert.throws(() => submitProviderQuoteInputSchema.parse({
    ...quoteInput,
    extraCharges: [{ label: "X", amountRupees: -1 }],
  }));
});

 
test("customer quote acceptance requires a UUID and explicit terms consent", () => {
  const quoteId = "a7d8e90f-84d2-4b3a-9c4a-b3d0c3d1e0f2";
  assert.deepEqual(
    acceptProviderQuoteInputSchema.parse({ quoteId, termsAccepted: true }),
    { quoteId, termsAccepted: true },
  );
  assert.throws(() => acceptProviderQuoteInputSchema.parse({ quoteId, termsAccepted: false }));
  assert.throws(() => acceptProviderQuoteInputSchema.parse({ quoteId: "not-a-uuid", termsAccepted: true }));
  assert.throws(() => acceptProviderQuoteInputSchema.parse({ quoteId, termsAccepted: true, customerUserId: "spoofed" }));
});


test("provider service and machine availability require their own UUIDs and boolean state", () => {
  const businessId = "c6e7a92f-73c4-44d1-9846-6b93f03e0acc";
  const providerServiceId = "d7f8a30f-84d2-4b3a-9c4a-c4e1d4e2f103";
  const assetId = "e8a9b41f-95e3-4c4b-8d5b-d5f2e5f30414";
  assert.deepEqual(
    setProviderServiceAvailabilityInputSchema.parse({ businessId, providerServiceId, isAvailable: true }),
    { businessId, providerServiceId, isAvailable: true },
  );
  assert.deepEqual(
    setProviderAssetAvailabilityInputSchema.parse({ businessId, assetId, isAvailable: false }),
    { businessId, assetId, isAvailable: false },
  );
  assert.throws(() => setProviderServiceAvailabilityInputSchema.parse({
    businessId, providerServiceId, isAvailable: "true",
  }));
  assert.throws(() => setProviderAssetAvailabilityInputSchema.parse({
    businessId, assetId, isAvailable: true, ownerUserId: "spoofed",
  }));
});


test("booking lifecycle inputs are scoped to UUIDs and permitted provider transitions", () => {
  const bookingId = "f9b0c52f-a6f4-4d5e-8f6c-e6d8f6a5f516";
  assert.deepEqual(getBookingDetailInputSchema.parse({ bookingId }), { bookingId });
  assert.deepEqual(
    updateProviderBookingStatusInputSchema.parse({ bookingId, status: "on_the_way", note: "Vehicle dispatched" }),
    { bookingId, status: "on_the_way", note: "Vehicle dispatched" },
  );
  assert.throws(() => updateProviderBookingStatusInputSchema.parse({ bookingId, status: "service_started" }));
  assert.throws(() => updateProviderBookingStatusInputSchema.parse({ bookingId, status: "paid" }));
  assert.throws(() => getBookingDetailInputSchema.parse({ bookingId, customerUserId: "spoofed" }));
});

test("start-code issuance and verification validate booking UUID and four-digit code", () => {
  const bookingId = "f9b0c52f-a6f4-4d5e-8f6c-e6d8f6a5f516";
  assert.deepEqual(issueBookingStartCodeInputSchema.parse({ bookingId }), { bookingId });
  assert.deepEqual(
    verifyBookingStartCodeInputSchema.parse({ bookingId, code: "0427" }),
    { bookingId, code: "0427" },
  );
  assert.throws(() => verifyBookingStartCodeInputSchema.parse({ bookingId, code: "427" }));
  assert.throws(() => verifyBookingStartCodeInputSchema.parse({ bookingId, code: "abcd" }));
  assert.throws(() => issueBookingStartCodeInputSchema.parse({ bookingId, customerUserId: "spoofed" }));
});

test("booking cancellation/dispute actions require a reason and reject extra identity fields", () => {
  const bookingId = "f9b0c52f-a6f4-4d5e-8f6c-e6d8f6a5f516";
  assert.equal(updateBookingParticipantInputSchema.parse({ bookingId, reason: "Provider could not access site." }).reason, "Provider could not access site.");
  assert.throws(() => updateBookingParticipantInputSchema.parse({ bookingId, reason: "bad" }));
  assert.throws(() => updateBookingParticipantInputSchema.parse({ bookingId, reason: "valid reason", userId: "spoofed" }));
});


test("provider GPS input validates coordinates, accuracy, heading and speed", () => {
  const bookingId = "f9b0c52f-a6f4-4d5e-8f6c-e6d8f6a5f516";
  const payload = {
    bookingId,
    latitude: 17.385,
    longitude: 78.4867,
    accuracyMeters: 12.5,
    headingDegrees: 180,
    speedMps: 8.2,
  };
  assert.deepEqual(updateProviderBookingLocationInputSchema.parse(payload), payload);
  assert.deepEqual(stopProviderBookingLocationInputSchema.parse({ bookingId }), { bookingId });
  assert.throws(() => updateProviderBookingLocationInputSchema.parse({ ...payload, latitude: 91 }));
  assert.throws(() => updateProviderBookingLocationInputSchema.parse({ ...payload, longitude: -181 }));
  assert.throws(() => updateProviderBookingLocationInputSchema.parse({ ...payload, accuracyMeters: 201 }));
  assert.throws(() => updateProviderBookingLocationInputSchema.parse({ ...payload, headingDegrees: 361 }));
  assert.throws(() => updateProviderBookingLocationInputSchema.parse({ ...payload, speedMps: -1 }));
  assert.throws(() => updateProviderBookingLocationInputSchema.parse({ ...payload, userId: "spoofed" }));
});


test("booking chat accepts plain text only and caps message size", () => {
  const bookingId = "f9b0c52f-a6f4-4d5e-8f6c-e6d8f6a5f516";
  assert.deepEqual(
    sendBookingMessageInputSchema.parse({ bookingId, messageText: "I will reach the site in 30 minutes." }),
    { bookingId, messageText: "I will reach the site in 30 minutes." },
  );
  assert.throws(() => sendBookingMessageInputSchema.parse({ bookingId, messageText: "   " }));
  assert.throws(() => sendBookingMessageInputSchema.parse({ bookingId, messageText: "x".repeat(2001) }));
  assert.throws(() => sendBookingMessageInputSchema.parse({ bookingId, messageText: "Hello", senderUserId: "spoofed" }));
});


test("provider reviews require a valid booking, one-to-five rating and bounded text", () => {
  const bookingId = "f9b0c52f-a6f4-4d5e-8f6c-e6d8f6a5f516";
  assert.deepEqual(
    submitProviderReviewInputSchema.parse({ bookingId, rating: 5, reviewText: "Excellent service." }),
    { bookingId, rating: 5, reviewText: "Excellent service." },
  );
  assert.deepEqual(
    submitProviderReviewInputSchema.parse({ bookingId, rating: 4 }),
    { bookingId, rating: 4, reviewText: "" },
  );
  assert.throws(() => submitProviderReviewInputSchema.parse({ bookingId, rating: 0 }));
  assert.throws(() => submitProviderReviewInputSchema.parse({ bookingId, rating: 6 }));
  assert.throws(() => submitProviderReviewInputSchema.parse({ bookingId, rating: 4.5 }));
  assert.throws(() => submitProviderReviewInputSchema.parse({ bookingId, rating: 5, reviewText: "x".repeat(1001) }));
  assert.throws(() => submitProviderReviewInputSchema.parse({ bookingId, rating: 5, customerUserId: "spoofed" }));
});
