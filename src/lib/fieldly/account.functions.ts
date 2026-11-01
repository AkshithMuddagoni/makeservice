import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "../auth/middleware";
import { isValidIndiaPincode } from "../india-validation";
import { acceptProviderQuoteInputSchema, createJobRequestInputSchema, discoverProvidersInputSchema, getBookingDetailInputSchema, issueBookingStartCodeInputSchema, setProviderAssetAvailabilityInputSchema, setProviderPresenceInputSchema, setProviderServiceAvailabilityInputSchema, submitProviderQuoteInputSchema, updateBookingParticipantInputSchema, updateProviderBookingStatusInputSchema, verifyBookingStartCodeInputSchema } from "./marketplace-validation";

/**
 * These functions are safe to call from React. Database access is dynamically
 * imported inside the server handler, and the user id is supplied only by the
 * session-verifying auth middleware (never by a browser argument).
 */
export const getCurrentFieldlyAccount = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getFieldlyAccountForUser } = await import("./repository.server");
    return getFieldlyAccountForUser(context.userId);
  });

export const ensureCurrentFieldlyAccount = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    displayName: z.string().trim().min(1).max(100).nullable(),
  }).strict())
  .handler(async ({ context, data }) => {
    const { ensureFieldlyAccountForUser } = await import("./repository.server");
    return ensureFieldlyAccountForUser(context.userId, data.displayName);
  });


const providerApplicationSchema = z.object({
  business: z.object({
    ownerFullName: z.string().trim().min(3).max(120),
    legalName: z.string().trim().min(3).max(160),
    tradeName: z.string().trim().min(2).max(120),
    businessType: z.enum(["INDIVIDUAL", "PROPRIETORSHIP", "PARTNERSHIP", "LLP", "PRIVATE_LIMITED", "PUBLIC_LIMITED", "OTHER"]),
    address: z.string().trim().min(6).max(300),
    district: z.string().trim().min(2).max(100),
    city: z.string().trim().min(2).max(100),
    area: z.string().trim().min(2).max(160),
    state: z.string().trim().min(2).max(100),
    pincode: z.string().refine(isValidIndiaPincode, "Enter a valid six-digit Indian PIN code."),
    gstStatus: z.enum(["REGISTERED", "NOT_REGISTERED", "NOT_SURE"]),
    aggregateTurnoverBand: z.enum(["UNDER_20_LAKH", "20_LAKH_OR_MORE", "NOT_SURE"]),
    udyamProvided: z.boolean(),
    authorisedRepresentative: z.boolean(),
  }).strict(),
  profile: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    yearsExperience: z.number().int().min(0).max(80),
    languages: z.array(z.string().trim().min(1).max(40)).max(12),
    bio: z.string().trim().max(1200),
  }).strict(),
  services: z.array(z.object({
    serviceId: z.string().regex(/^[a-z0-9_-]{1,60}$/),
    selectedTasks: z.array(z.string().trim().min(1).max(160)).min(1).max(40),
    specifications: z.record(z.string(), z.string().max(500)).default({}),
  }).strict()).min(1).max(12),
  assets: z.array(z.object({
    serviceIds: z.array(z.string().regex(/^[a-z0-9_-]{1,60}$/)).min(1).max(12),
    assetType: z.string().trim().min(2).max(100),
    make: z.string().trim().min(1).max(100),
    model: z.string().trim().min(1).max(100),
    yearOfManufacture: z.number().int().min(1950).max(2100).nullable(),
    ownership: z.enum(["OWNED", "LEASED", "THIRD_PARTY"]),
    roadUse: z.enum(["PUBLIC_ROAD", "COMMERCIAL_TRANSPORT", "TRAILER_MOVED", "OFF_ROAD", "NOT_APPLICABLE", "NEEDS_REVIEW"]),
    vehicleClass: z.string().trim().max(80),
    registrationLast4: z.string().regex(/^[A-Z0-9]{4}$/).nullable(),
    serialLast4: z.string().regex(/^[A-Z0-9]{4}$/).nullable(),
    specifications: z.record(z.string(), z.string().max(500)).default({}),
  }).strict()).min(1).max(30),
  declarationAccepted: z.literal(true),
}).strict();

export const submitCurrentProviderApplication = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(providerApplicationSchema)
  .handler(async ({ context, data }) => {
    const { submitProviderApplicationForUser } = await import("./repository.server");
    return submitProviderApplicationForUser(context.userId, data);
  });

export const getCurrentProviderApplications = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getProviderApplicationsForUser } = await import("./repository.server");
    return getProviderApplicationsForUser(context.userId);
  });


/** Read the full provider dashboard for the authenticated account only. */
export const getCurrentProviderDashboard = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getProviderDashboardForUser } = await import("./repository.server");
    return getProviderDashboardForUser(context.userId);
  });


/** Admin-only functions. Repository handlers independently check the admin role. */
export const getAdminProviderReviewQueue = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getAdminProviderReviewQueue: getQueue } = await import("./repository.server");
    return getQueue(context.userId);
  });

export const getAdminProviderApplicationDetail = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ businessId: z.string().uuid() }).strict())
  .handler(async ({ context, data }) => {
    const { getAdminProviderApplicationDetail: getDetail } = await import("./repository.server");
    return getDetail(context.userId, data.businessId);
  });

export const applyAdminProviderReviewDecision = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    businessId: z.string().uuid(),
    decision: z.enum(["under_review", "needs_information", "rejected", "approved"]),
    note: z.string().max(2000).default(""),
  }).strict())
  .handler(async ({ context, data }) => {
    const { applyAdminProviderReviewDecision: applyDecision } = await import("./repository.server");
    return applyDecision({
      adminUserId: context.userId,
      businessId: data.businessId,
      decision: data.decision,
      note: data.note,
    });
  });

 
/** Discover currently verified, online providers within the service radius. */
export const discoverCurrentProviders = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(discoverProvidersInputSchema)
  .handler(async ({ context, data }) => {
    const { discoverProvidersForCustomer } = await import("./repository.server");
    return discoverProvidersForCustomer(context.userId, data);
  });

/** Create a customer-owned request and target one eligible provider atomically. */
export const createCurrentJobRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(createJobRequestInputSchema)
  .handler(async ({ context, data }) => {
    const { createJobRequestForCustomer } = await import("./repository.server");
    return createJobRequestForCustomer(context.userId, data);
  });


/** Get a saved customer request using only the authenticated account identity. */
export const getCurrentJobRequestDetail = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ requestId: z.string().uuid() }).strict())
  .handler(async ({ context, data }) => {
    const { getCustomerJobRequestForUser } = await import("./repository.server");
    return getCustomerJobRequestForUser(context.userId, data.requestId);
  });


/** Toggle availability for a business owned by the verified provider session. */
export const setCurrentProviderPresence = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(setProviderPresenceInputSchema)
  .handler(async ({ context, data }) => {
    const { setProviderPresenceForUser } = await import("./repository.server");
    return setProviderPresenceForUser(context.userId, data);
  });

/** List only open requests targeted to the authenticated provider's businesses. */
export const getCurrentProviderOpenRequests = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getProviderOpenRequestsForUser } = await import("./repository.server");
    return getProviderOpenRequestsForUser(context.userId);
  });

/** Submit or update a pending quote for a request assigned to the provider's own business. */
export const submitCurrentProviderQuote = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(submitProviderQuoteInputSchema)
  .handler(async ({ context, data }) => {
    const { submitProviderQuoteForUser } = await import("./repository.server");
    return submitProviderQuoteForUser(context.userId, data);
  });


/** Accept a pending provider quote and confirm the booking atomically. */
export const acceptCurrentProviderQuote = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(acceptProviderQuoteInputSchema)
  .handler(async ({ context, data }) => {
    const { acceptProviderQuoteForCustomer } = await import("./repository.server");
    return acceptProviderQuoteForCustomer(context.userId, data);
  });


/** Activate/pause an approved service for an owned approved provider business. */
export const setCurrentProviderServiceAvailability = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(setProviderServiceAvailabilityInputSchema)
  .handler(async ({ context, data }) => {
    const { setProviderServiceAvailabilityForUser } = await import("./repository.server");
    return setProviderServiceAvailabilityForUser(context.userId, data);
  });

/** Make an approved machine available/unavailable for customer assignments. */
export const setCurrentProviderAssetAvailability = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(setProviderAssetAvailabilityInputSchema)
  .handler(async ({ context, data }) => {
    const { setProviderAssetAvailabilityForUser } = await import("./repository.server");
    return setProviderAssetAvailabilityForUser(context.userId, data);
  });


/** Fetch a participant-only booking detail and audit timeline. */
export const getCurrentBookingDetail = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(getBookingDetailInputSchema)
  .handler(async ({ context, data }) => {
    const { getBookingDetailForUser } = await import("./repository.server");
    return getBookingDetailForUser(context.userId, data.bookingId);
  });

/** Provider transitions: confirmed -> on the way -> arrived -> completed. */
export const updateCurrentProviderBookingStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(updateProviderBookingStatusInputSchema)
  .handler(async ({ context, data }) => {
    const { updateProviderBookingStatusForUser } = await import("./repository.server");
    return updateProviderBookingStatusForUser(context.userId, data);
  });

/** Customer issues a one-time, five-minute service-start code after provider arrival. */
export const issueCurrentBookingStartCode = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(issueBookingStartCodeInputSchema)
  .handler(async ({ context, data }) => {
    const { issueBookingStartCodeForCustomer } = await import("./repository.server");
    return issueBookingStartCodeForCustomer(context.userId, data.bookingId);
  });

/** Assigned provider verifies the customer code; only a match starts service. */
export const verifyCurrentBookingStartCode = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(verifyBookingStartCodeInputSchema)
  .handler(async ({ context, data }) => {
    const { verifyBookingStartCodeForProvider } = await import("./repository.server");
    return verifyBookingStartCodeForProvider(context.userId, data);
  });

/** Customer or assigned provider can cancel before arrival or dispute after arrival. */
export const updateCurrentBookingParticipantAction = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(updateBookingParticipantInputSchema.extend({
    action: z.enum(["cancelled", "disputed"]),
  }).strict())
  .handler(async ({ context, data }) => {
    const { updateBookingByParticipant } = await import("./repository.server");
    return updateBookingByParticipant(context.userId, data);
  });


/** List confirmed and historical bookings belonging to this provider owner. */
export const getCurrentProviderBookings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getProviderBookingsForUser } = await import("./repository.server");
    return getProviderBookingsForUser(context.userId);
  });
