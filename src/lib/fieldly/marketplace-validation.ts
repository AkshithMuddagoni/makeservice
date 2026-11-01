import { z } from "zod";
import { isValidIndiaPincode } from "../india-validation.ts";

const serviceIdSchema = z.string().regex(/^[a-z0-9_-]{1,60}$/);
const siteSchema = z.object({
  label: z.string().trim().min(2).max(160),
  area: z.string().trim().min(2).max(160),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  district: z.string().trim().max(100).optional(),
  pincode: z.string().trim().optional().refine(
    (value) => value === undefined || value === "" || isValidIndiaPincode(value),
    "Enter a valid six-digit Indian PIN code.",
  ),
  address: z.string().trim().max(300).optional(),
  landmark: z.string().trim().max(160).optional(),
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
}).strict();

const requirementsSchema = z.record(
  z.string().trim().min(1).max(80),
  z.string().max(500),
).refine((value) => Object.keys(value).length <= 30, "Too many service requirement fields.");

export const discoverProvidersInputSchema = z.object({
  serviceId: serviceIdSchema,
  site: siteSchema,
}).strict();

export const createJobRequestInputSchema = z.object({
  serviceId: serviceIdSchema,
  businessId: z.string().uuid(),
  site: siteSchema,
  requirements: requirementsSchema,
  whenLabel: z.string().trim().min(1).max(120),
  scheduledFor: z.string().datetime({ offset: true }).nullable().optional(),
  notes: z.string().trim().max(2000),
  detailsConsent: z.literal(true),
}).strict();

export type DiscoverProvidersInput = z.infer<typeof discoverProvidersInputSchema>;
export type CreateJobRequestInput = z.infer<typeof createJobRequestInputSchema>;


export const setProviderPresenceInputSchema = z.object({
  businessId: z.string().uuid(),
  isOnline: z.boolean(),
}).strict();

const quoteLineSchema = z.object({
  label: z.string().trim().min(2).max(160),
  amountRupees: z.number().int().min(0).max(100000000),
}).strict();

export const submitProviderQuoteInputSchema = z.object({
  requestId: z.string().uuid(),
  businessId: z.string().uuid(),
  amountRupees: z.number().int().min(1).max(100000000),
  note: z.string().trim().min(8).max(2000),
  inclusions: z.array(z.string().trim().min(1).max(240)).max(25),
  exclusions: z.array(z.string().trim().min(1).max(240)).max(25),
  extraCharges: z.array(quoteLineSchema).max(20),
  cancellationTerms: z.string().trim().min(8).max(1200),
  etaMinutes: z.number().int().min(0).max(10080).nullable(),
}).strict();

export type SetProviderPresenceInput = z.infer<typeof setProviderPresenceInputSchema>;
export type SubmitProviderQuoteInput = z.infer<typeof submitProviderQuoteInputSchema>;


export const acceptProviderQuoteInputSchema = z.object({
  quoteId: z.string().uuid(),
  termsAccepted: z.literal(true),
}).strict();

export type AcceptProviderQuoteInput = z.infer<typeof acceptProviderQuoteInputSchema>;


export const setProviderServiceAvailabilityInputSchema = z.object({
  businessId: z.string().uuid(),
  providerServiceId: z.string().uuid(),
  isAvailable: z.boolean(),
}).strict();

export const setProviderAssetAvailabilityInputSchema = z.object({
  businessId: z.string().uuid(),
  assetId: z.string().uuid(),
  isAvailable: z.boolean(),
}).strict();

export type SetProviderServiceAvailabilityInput = z.infer<typeof setProviderServiceAvailabilityInputSchema>;
export type SetProviderAssetAvailabilityInput = z.infer<typeof setProviderAssetAvailabilityInputSchema>;


const bookingIdSchema = z.string().uuid();

export const getBookingDetailInputSchema = z.object({
  bookingId: bookingIdSchema,
}).strict();

export const updateProviderBookingStatusInputSchema = z.object({
  bookingId: bookingIdSchema,
  status: z.enum(["on_the_way", "arrived", "service_completed"]),
  note: z.string().trim().max(500).optional(),
}).strict();

export const issueBookingStartCodeInputSchema = z.object({
  bookingId: bookingIdSchema,
}).strict();

export const verifyBookingStartCodeInputSchema = z.object({
  bookingId: bookingIdSchema,
  code: z.string().regex(/^\d{4}$/, "Enter the four-digit customer start code."),
}).strict();

export const updateBookingParticipantInputSchema = z.object({
  bookingId: bookingIdSchema,
  reason: z.string().trim().min(5).max(1000),
}).strict();

export type GetBookingDetailInput = z.infer<typeof getBookingDetailInputSchema>;
export type UpdateProviderBookingStatusInput = z.infer<typeof updateProviderBookingStatusInputSchema>;
export type IssueBookingStartCodeInput = z.infer<typeof issueBookingStartCodeInputSchema>;
export type VerifyBookingStartCodeInput = z.infer<typeof verifyBookingStartCodeInputSchema>;
export type UpdateBookingParticipantInput = z.infer<typeof updateBookingParticipantInputSchema>;


export const updateProviderBookingLocationInputSchema = z.object({
  bookingId: z.string().uuid(),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracyMeters: z.number().finite().min(0).max(200),
  headingDegrees: z.number().finite().min(0).max(360).nullable(),
  speedMps: z.number().finite().min(0).max(120).nullable(),
}).strict();

export const stopProviderBookingLocationInputSchema = z.object({
  bookingId: z.string().uuid(),
}).strict();

export type UpdateProviderBookingLocationInput = z.infer<typeof updateProviderBookingLocationInputSchema>;


export const getBookingMessagesInputSchema = z.object({
  bookingId: z.string().uuid(),
}).strict();

export const sendBookingMessageInputSchema = z.object({
  bookingId: z.string().uuid(),
  messageText: z.string().trim().min(1).max(2000),
}).strict();

export type SendBookingMessageInput = z.infer<typeof sendBookingMessageInputSchema>;


const providerDocumentMimeSchema = z.enum([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function isCalendarDate(value: string): boolean {
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const isoDateSchema = z.string().refine(isCalendarDate, "Enter a valid YYYY-MM-DD date.").nullable().optional();

const providerDocumentScopeSchema = {
  providerServiceId: z.string().uuid().optional(),
  assetId: z.string().uuid().optional(),
  operatorId: z.string().uuid().optional(),
};

export const createProviderDocumentUploadInputSchema = z.object({
  businessId: z.string().uuid(),
  documentType: z.string().regex(/^[A-Z0-9_]{2,80}$/),
  fileName: z.string().trim().min(1).max(240),
  mimeType: providerDocumentMimeSchema,
  sizeBytes: z.number().int().min(1).max(10 * 1024 * 1024),
  ...providerDocumentScopeSchema,
}).strict().refine(
  (value) => [value.providerServiceId, value.assetId, value.operatorId].filter(Boolean).length <= 1,
  "Attach a document to only one service, machine or operator at a time.",
);

export const confirmProviderDocumentUploadInputSchema = z.object({
  uploadId: z.string().uuid(),
  issuedOn: isoDateSchema,
  expiresOn: isoDateSchema,
}).strict().refine(
  (value) => !value.issuedOn || !value.expiresOn || value.expiresOn >= value.issuedOn,
  "Expiry date cannot be earlier than issue date.",
);

export const getAdminProviderDocumentInputSchema = z.object({
  documentId: z.string().uuid(),
}).strict();

export const reviewAdminProviderDocumentInputSchema = z.object({
  documentId: z.string().uuid(),
  decision: z.enum(["verified", "rejected"]),
  note: z.string().trim().max(2000).default(""),
}).strict();

export type CreateProviderDocumentUploadInput = z.infer<typeof createProviderDocumentUploadInputSchema>;
export type ConfirmProviderDocumentUploadInput = z.infer<typeof confirmProviderDocumentUploadInputSchema>;
export type ReviewAdminProviderDocumentInput = z.infer<typeof reviewAdminProviderDocumentInputSchema>;
