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
