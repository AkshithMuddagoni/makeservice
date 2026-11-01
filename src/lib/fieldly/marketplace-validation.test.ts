import assert from "node:assert/strict";
import test from "node:test";
import {
  createJobRequestInputSchema,
  discoverProvidersInputSchema,
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
