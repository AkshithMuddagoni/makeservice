import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "../auth/middleware";

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
    pincode: z.string().regex(/^\\d{6}$/),
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
  documentRequirements: z.array(z.object({
    key: z.string().regex(/^[A-Z0-9_-]{2,100}$/),
    label: z.string().trim().min(2).max(160),
    description: z.string().trim().max(1000),
    requiredForApproval: z.boolean(),
    secureOnly: z.boolean(),
    jobSpecific: z.boolean(),
    selectedInPreview: z.boolean(),
  }).strict()).max(100),
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
