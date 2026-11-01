import { randomUUID } from "node:crypto";
import { generateBookingStartCode, hashBookingStartCode, verifyBookingStartCodeHash } from "./booking-security.server";
import { DEV_USER_ID } from "../auth/verify.server";
import { getSql } from "../db";
import { getProviderDocumentRequirements, SERVICE_ONBOARDING } from "./provider-onboarding";
import { getService } from "./catalog";
import { PROVIDER_DISCOVERY_SQL } from "./marketplace-queries";
import type { Sql } from "../db";
import type { CreateJobRequestInput, DiscoverProvidersInput, SetProviderAssetAvailabilityInput, SetProviderServiceAvailabilityInput, SubmitProviderQuoteInput } from "./marketplace-validation";

export type FieldlyProfile = {
  user_id: string;
  display_name: string;
  locale: string;
  created_at: string;
  updated_at: string;
};

export type FieldlyRole = "customer" | "provider" | "admin";

export type FieldlyAccount = {
  profile: FieldlyProfile;
  roles: FieldlyRole[];
};

/**
 * User ids passed here must come from authMiddleware's verified request
 * context. Never call these repository methods with a browser-supplied id.
 * The shared preview/dev fallback is rejected even when authentication is
 * disabled, so demo identities cannot create production marketplace records.
 */
function assertProductionIdentity(userId: string): void {
  if (!userId || userId === DEV_USER_ID) {
    throw new Error("A real signed-in account is required for marketplace data.");
  }
}

/**
 * Create the Fieldly profile and default customer role for a verified user.
 * Better Auth remains the identity source; this stores only app-specific data.
 */
export async function ensureFieldlyAccountForUser(
  userId: string,
  displayName: string | null = null,
): Promise<FieldlyAccount> {
  assertProductionIdentity(userId);
  const sql = await getSql();

  const identities = await sql.query<{ name: string }>(
    'select "name" from "user" where "id" = $1 limit 1',
    [userId],
  );
  const identity = identities[0];
  if (!identity) {
    throw new Error("The authenticated identity was not found in the account database.");
  }

  const chosenName = displayName?.trim() || identity.name || "Customer";
  if (displayName?.trim()) {
    await sql.query(
      'update "user" set "name" = $1, "updatedAt" = now() where "id" = $2',
      [chosenName, userId],
    );
  }

  const profiles = await sql.query<FieldlyProfile>(
    `insert into fieldly_profiles (user_id, display_name)
     values ($1, $2)
     on conflict (user_id) do update
       set display_name = coalesce($3, fieldly_profiles.display_name),
       updated_at = now()
     returning user_id, display_name, locale, created_at, updated_at`,
    [userId, chosenName, displayName?.trim() || null],
  );
  const profile = profiles[0];
  if (!profile) throw new Error("Could not create the Fieldly profile.");

  await sql.query(
    `insert into fieldly_user_roles (user_id, role)
     values ($1, 'customer')
     on conflict (user_id, role) do nothing`,
    [userId],
  );

  const roleRows = await sql.query<{ role: FieldlyRole }>(
    "select role::text as role from fieldly_user_roles where user_id = $1 order by role",
    [userId],
  );

  return { profile, roles: roleRows.map((row) => row.role) };
}

/** Read only the supplied verified user's profile and roles. */
export async function getFieldlyAccountForUser(userId: string): Promise<FieldlyAccount | null> {
  assertProductionIdentity(userId);
  const sql = await getSql();

  const profiles = await sql.query<FieldlyProfile>(
    `select user_id, display_name, locale, created_at, updated_at
     from fieldly_profiles where user_id = $1 limit 1`,
    [userId],
  );
  const profile = profiles[0];
  if (!profile) return null;

  const roleRows = await sql.query<{ role: FieldlyRole }>(
    "select role::text as role from fieldly_user_roles where user_id = $1 order by role",
    [userId],
  );

  return { profile, roles: roleRows.map((row) => row.role) };
}


export type ProviderApplicationInput = {
  business: {
    ownerFullName: string;
    legalName: string;
    tradeName: string;
    businessType: "INDIVIDUAL" | "PROPRIETORSHIP" | "PARTNERSHIP" | "LLP" | "PRIVATE_LIMITED" | "PUBLIC_LIMITED" | "OTHER";
    address: string;
    district: string;
    city: string;
    area: string;
    state: string;
    pincode: string;
    gstStatus: "REGISTERED" | "NOT_REGISTERED" | "NOT_SURE";
    aggregateTurnoverBand: "UNDER_20_LAKH" | "20_LAKH_OR_MORE" | "NOT_SURE";
    udyamProvided: boolean;
    authorisedRepresentative: boolean;
  };
  profile: {
    latitude: number;
    longitude: number;
    yearsExperience: number;
    languages: string[];
    bio: string;
  };
  services: Array<{
    serviceId: string;
    selectedTasks: string[];
    specifications: Record<string, string>;
  }>;
  assets: Array<{
    serviceIds: string[];
    assetType: string;
    make: string;
    model: string;
    yearOfManufacture: number | null;
    ownership: "OWNED" | "LEASED" | "THIRD_PARTY";
    roadUse: "PUBLIC_ROAD" | "COMMERCIAL_TRANSPORT" | "TRAILER_MOVED" | "OFF_ROAD" | "NOT_APPLICABLE" | "NEEDS_REVIEW";
    vehicleClass: string;
    registrationLast4: string | null;
    serialLast4: string | null;
    specifications: Record<string, string>;
  }>;
  declarationAccepted: true;
};

export type ProviderApplicationResult = {
  businessId: string;
  businessStatus: string;
  serviceCount: number;
  assetCount: number;
  documentRequirementCount: number;
  alreadyExists: boolean;
};

const ownershipToDb = {
  OWNED: "owned",
  LEASED: "leased",
  THIRD_PARTY: "third_party",
} as const;

const roadUseToDb = {
  PUBLIC_ROAD: "public_road",
  COMMERCIAL_TRANSPORT: "commercial_transport",
  TRAILER_MOVED: "trailer_moved",
  OFF_ROAD: "off_road",
  NOT_APPLICABLE: "stationary",
  NEEDS_REVIEW: "needs_review",
} as const;

function validateProviderApplication(input: ProviderApplicationInput): void {
  if (input.services.length < 1 || input.services.length > 12) {
    throw new Error("Select between 1 and 12 services.");
  }
  if (input.assets.length < 1 || input.assets.length > 30) {
    throw new Error("Add between 1 and 30 machines or equipment assets.");
  }
  const serviceIds = new Set(input.services.map((service) => service.serviceId));
  if (serviceIds.size !== input.services.length) {
    throw new Error("A service can only be registered once per business.");
  }
  for (const service of input.services) {
    const definition = SERVICE_ONBOARDING[service.serviceId];
    if (!definition) throw new Error("One of the selected services is not supported for provider registration.");
    if (service.selectedTasks.some((task) => !definition.tasks.includes(task))) {
      throw new Error("A selected task does not belong to its service.");
    }
    const allowedSpecificationKeys = new Set(definition.fields.map((field) => field.key));
    if (Object.keys(service.specifications).some((key) => !allowedSpecificationKeys.has(key))) {
      throw new Error("A service contains an unsupported specification field.");
    }
  }
  for (const asset of input.assets) {
    if (asset.serviceIds.length < 1 || asset.serviceIds.some((serviceId) => !serviceIds.has(serviceId))) {
      throw new Error("Every machine must be linked to one or more services in this application.");
    }
    const allowedAssetTypes = new Set(
      asset.serviceIds.flatMap((serviceId) => SERVICE_ONBOARDING[serviceId]?.assetTypes ?? []),
    );
    if (!allowedAssetTypes.has(asset.assetType)) {
      throw new Error("A machine type does not match any service it is linked to.");
    }
  }
  if (input.profile.yearsExperience < 0 || input.profile.yearsExperience > 80) {
    throw new Error("Enter experience between 0 and 80 years.");
  }
  if (!input.declarationAccepted) {
    throw new Error("Accept the provider declaration before submitting.");
  }
}

/**
 * Persist one complete provider application in a single transaction.
 *
 * The caller's user id must come from authMiddleware. Contact phone is read
 * from the Better Auth row, and a verified +91 phone is required. The UI does
 * not get to choose the business owner, verification state, or phone number.
 * Documents are checklist metadata only; file uploads are a separate secure
 * Storage milestone and no selected File objects are stored here.
 */
export async function submitProviderApplicationForUser(
  userId: string,
  input: ProviderApplicationInput,
): Promise<ProviderApplicationResult> {
  assertProductionIdentity(userId);
  validateProviderApplication(input);
  const calculatedRequirements = getProviderDocumentRequirements({
    businessType: input.business.businessType,
    state: input.business.state,
    gstStatus: input.business.gstStatus,
    authorisedRepresentative: input.business.authorisedRepresentative,
    services: input.services.map(({ serviceId, selectedTasks }) => ({ serviceId, selectedTasks })),
    assets: input.assets.map(({ serviceIds, ownership, roadUse, vehicleClass, assetType }) => ({
      serviceIds,
      ownership,
      roadUse,
      vehicleClass,
      assetType,
    })),
  });
  const sql = await getSql();
  const now = new Date();

  try {
    return await sql.transaction(async (tx) => {
      const identities = await tx.query<{
        name: string;
        phoneNumber: string | null;
        phoneNumberVerified: boolean;
      }>(
        'select "name", "phoneNumber", "phoneNumberVerified" from public."user" where "id" = $1 limit 1',
        [userId],
      );
      const identity = identities[0];
      if (!identity) {
        throw new Error("Your signed-in account could not be found. Sign in again.");
      }
      if (!identity.phoneNumberVerified || !identity.phoneNumber ||
          !/^\+91[6-9]\d{9}$/.test(identity.phoneNumber)) {
        throw new Error("Verify an Indian mobile number before registering as a provider.");
      }

      const existing = await tx.query<{ id: string; verification_status: string }>(
        `select id, verification_status::text as verification_status
         from public.provider_businesses
         where owner_user_id = $1
           and lower(trim(legal_name)) = lower(trim($2))
           and is_suspended = false
         limit 1`,
        [userId, input.business.legalName],
      );
      if (existing[0]) {
        const [serviceRows, assetRows, requirementRows] = await Promise.all([
          tx.query<{ count: string }>(
            "select count(*)::text as count from public.provider_services where business_id = $1",
            [existing[0].id],
          ),
          tx.query<{ count: string }>(
            "select count(*)::text as count from public.provider_assets where business_id = $1",
            [existing[0].id],
          ),
          tx.query<{ count: string }>(
            "select count(*)::text as count from public.provider_document_requirements where business_id = $1",
            [existing[0].id],
          ),
        ]);
        return {
          businessId: existing[0].id,
          businessStatus: existing[0].verification_status,
          serviceCount: Number(serviceRows[0]?.count ?? 0),
          assetCount: Number(assetRows[0]?.count ?? 0),
          documentRequirementCount: Number(requirementRows[0]?.count ?? 0),
          alreadyExists: true,
        };
      }

      await tx.query(
        `insert into public.fieldly_profiles (user_id, display_name)
         values ($1, $2)
         on conflict (user_id) do nothing`,
        [userId, input.business.ownerFullName],
      );
      await tx.query(
        `insert into public.fieldly_user_roles (user_id, role)
         values ($1, 'customer')
         on conflict (user_id, role) do nothing`,
        [userId],
      );

      const businesses = await tx.query<{ id: string; verification_status: string }>(
        `insert into public.provider_businesses (
           owner_user_id, owner_full_name, legal_name, trading_name, business_type,
           address_line, area, district, city, state, pincode, latitude, longitude,
           gst_status, aggregate_turnover_band, udyam_provided,
           authorised_representative, declaration_accepted_at,
           years_experience, languages, bio, verification_status, is_suspended
         ) values (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
           $14, $15, $16, $17, $18, $19, $20, $21, 'submitted', false
         )
         returning id, verification_status::text as verification_status`,
        [
          userId,
          input.business.ownerFullName.trim(),
          input.business.legalName.trim(),
          input.business.tradeName.trim(),
          input.business.businessType.toLowerCase(),
          input.business.address.trim(),
          input.business.area.trim(),
          input.business.district.trim(),
          input.business.city.trim(),
          input.business.state.trim(),
          input.business.pincode,
          input.profile.latitude,
          input.profile.longitude,
          input.business.gstStatus.toLowerCase(),
          input.business.aggregateTurnoverBand,
          input.business.udyamProvided,
          input.business.authorisedRepresentative,
          now.toISOString(),
          input.profile.yearsExperience,
          input.profile.languages,
          input.profile.bio.trim(),
        ],
      );
      const businessId = businesses[0]?.id;
      if (!businessId) throw new Error("The provider application could not be created.");

      const serviceIdToRowId = new Map<string, string>();
      for (const service of input.services) {
        const rows = await tx.query<{ id: string }>(
          `insert into public.provider_services (
             business_id, service_id, selected_tasks, specifications,
             verification_status, is_listed, is_available
           ) values ($1, $2, $3, $4::jsonb, 'submitted', false, false)
           returning id`,
          [
            businessId,
            service.serviceId,
            service.selectedTasks,
            JSON.stringify(service.specifications),
          ],
        );
        if (!rows[0]?.id) throw new Error("A provider service could not be saved.");
        serviceIdToRowId.set(service.serviceId, rows[0].id);
      }

      for (const asset of input.assets) {
        const rows = await tx.query<{ id: string }>(
          `insert into public.provider_assets (
             business_id, asset_type, make, model, year_of_manufacture,
             ownership, road_use, vehicle_class, registration_last4,
             serial_last4, specifications, verification_status, is_available
           ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, 'submitted', false)
           returning id`,
          [
            businessId,
            asset.assetType.trim(),
            asset.make.trim(),
            asset.model.trim(),
            asset.yearOfManufacture,
            ownershipToDb[asset.ownership],
            roadUseToDb[asset.roadUse],
            asset.vehicleClass,
            asset.registrationLast4,
            asset.serialLast4,
            JSON.stringify(asset.specifications),
          ],
        );
        const assetId = rows[0]?.id;
        if (!assetId) throw new Error("A machine could not be saved.");

        for (const serviceId of asset.serviceIds) {
          const providerServiceId = serviceIdToRowId.get(serviceId);
          if (!providerServiceId) throw new Error("The machine references an unknown service.");
          await tx.query(
            `insert into public.provider_asset_services (asset_id, provider_service_id)
             values ($1, $2)`,
            [assetId, providerServiceId],
          );
        }
      }

      for (const requirement of calculatedRequirements) {
        await tx.query(
          `insert into public.provider_document_requirements (
             business_id, requirement_key, label, description, required_for_approval,
             secure_only, job_specific, selected_in_preview, status
           ) values ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
           on conflict (business_id, requirement_key) do nothing`,
          [
            businessId,
            requirement.key,
            requirement.label,
            requirement.description,
            requirement.requiredForApproval,
            requirement.secureOnly,
            requirement.jobSpecific,
            false,
          ],
        );
      }

      await tx.query(
        `insert into public.fieldly_user_roles (user_id, role)
         values ($1, 'provider')
         on conflict (user_id, role) do nothing`,
        [userId],
      );

      return {
        businessId,
        businessStatus: businesses[0].verification_status,
        serviceCount: input.services.length,
        assetCount: input.assets.length,
        documentRequirementCount: calculatedRequirements.length,
        alreadyExists: false,
      };
    });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "23505") {
      throw new Error("A provider application for this legal business already exists on your account.");
    }
    throw error;
  }
}

/** List provider applications owned by the authenticated account only. */
export async function getProviderApplicationsForUser(userId: string) {
  assertProductionIdentity(userId);
  const sql = await getSql();
  return sql.query<{
    id: string;
    legal_name: string;
    trading_name: string;
    city: string | null;
    district: string;
    state: string;
    verification_status: string;
    created_at: string;
  }>(
    `select id, legal_name, trading_name, city, district, state,
            verification_status::text as verification_status, created_at
     from public.provider_businesses
     where owner_user_id = $1 and is_suspended = false
     order by created_at desc`,
    [userId],
  );
}


export type ProviderDashboardApplication = {
  id: string;
  legalName: string;
  tradeName: string;
  businessType: string;
  ownerFullName: string;
  address: string;
  area: string;
  district: string;
  city: string | null;
  state: string;
  pincode: string;
  gstStatus: string;
  aggregateTurnoverBand: string;
  udyamProvided: boolean;
  authorisedRepresentative: boolean;
  yearsExperience: number;
  languages: string[];
  bio: string;
  verificationStatus: string;
  reviewerNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  payoutStatus: string;
  isOnline: boolean;
  presenceUpdatedAt: string | null;
  services: Array<{
    id: string;
    serviceId: string;
    selectedTasks: string[];
    specifications: Record<string, string>;
    verificationStatus: string;
    isListed: boolean;
    isAvailable: boolean;
    reviewerNote: string | null;
    reviewedAt: string | null;
  }>;
  assets: Array<{
    id: string;
    assetType: string;
    make: string;
    model: string;
    yearOfManufacture: number | null;
    ownership: string;
    roadUse: string;
    vehicleClass: string | null;
    registrationLast4: string | null;
    serialLast4: string | null;
    specifications: Record<string, string>;
    verificationStatus: string;
    isAvailable: boolean;
    reviewerNote: string | null;
    reviewedAt: string | null;
    serviceIds: string[];
  }>;
  documentRequirements: Array<{
    key: string;
    label: string;
    description: string;
    requiredForApproval: boolean;
    secureOnly: boolean;
    jobSpecific: boolean;
    status: string;
  }>;
};

/**
 * Return all provider applications belonging to the authenticated user.
 * Every child query is constrained by a business id selected from the
 * owner-scoped business query above; the browser never supplies an owner id.
 * No document paths, full identity values or bank data are returned.
 */
export async function getProviderDashboardForUser(
  userId: string,
): Promise<ProviderDashboardApplication[]> {
  assertProductionIdentity(userId);
  const sql = await getSql();

  const businesses = await sql.query<{
    id: string;
    legal_name: string;
    trading_name: string;
    business_type: string;
    owner_full_name: string;
    address_line: string;
    area: string;
    district: string;
    city: string | null;
    state: string;
    pincode: string;
    gst_status: string;
    aggregate_turnover_band: string;
    udyam_provided: boolean;
    authorised_representative: boolean;
    years_experience: number;
    languages: string[];
    bio: string;
    verification_status: string;
    reviewer_note: string | null;
    reviewed_at: string | null;
    created_at: string;
  }>(
    `select
       id, legal_name, trading_name, business_type, owner_full_name,
       address_line, area, district, city, state, pincode, gst_status,
       aggregate_turnover_band, udyam_provided, authorised_representative,
       years_experience, languages, bio,
       verification_status::text as verification_status,
       reviewer_note, reviewed_at::text as reviewed_at, created_at::text as created_at
     from public.provider_businesses
     where owner_user_id = $1 and is_suspended = false
     order by created_at desc
     limit 20`,
    [userId],
  );

  const applications: ProviderDashboardApplication[] = [];
  for (const business of businesses) {
    const [services, assets, requirements, payouts, presence] = await Promise.all([
      sql.query<{
        id: string;
        service_id: string;
        selected_tasks: string[];
        specifications: Record<string, string>;
        verification_status: string;
        is_listed: boolean;
        is_available: boolean;
        reviewer_note: string | null;
        reviewed_at: string | null;
      }>(
        `select id, service_id, selected_tasks, specifications,
                verification_status::text as verification_status,
                is_listed, is_available, reviewer_note,
                reviewed_at::text as reviewed_at
         from public.provider_services
         where business_id = $1
         order by created_at asc`,
        [business.id],
      ),
      sql.query<{
        id: string;
        asset_type: string;
        make: string;
        model: string;
        year_of_manufacture: number | null;
        ownership: string;
        road_use: string;
        vehicle_class: string | null;
        registration_last4: string | null;
        serial_last4: string | null;
        specifications: Record<string, string>;
        verification_status: string;
        is_available: boolean;
        reviewer_note: string | null;
        reviewed_at: string | null;
        service_ids: string[] | null;
      }>(
        `select
           pa.id, pa.asset_type, pa.make, pa.model, pa.year_of_manufacture,
           pa.ownership, pa.road_use, pa.vehicle_class,
           pa.registration_last4, pa.serial_last4, pa.specifications,
           pa.verification_status::text as verification_status,
           pa.is_available, pa.reviewer_note, pa.reviewed_at::text as reviewed_at,
           coalesce(array_agg(ps.service_id) filter (where ps.service_id is not null), '{}') as service_ids
         from public.provider_assets pa
         left join public.provider_asset_services pas on pas.asset_id = pa.id
         left join public.provider_services ps
           on ps.id = pas.provider_service_id and ps.business_id = pa.business_id
         where pa.business_id = $1
         group by pa.id
         order by pa.created_at asc`,
        [business.id],
      ),
      sql.query<{
        requirement_key: string;
        label: string;
        description: string;
        required_for_approval: boolean;
        secure_only: boolean;
        job_specific: boolean;
        status: string;
      }>(
        `select requirement_key, label, description, required_for_approval,
                secure_only, job_specific, status
         from public.provider_document_requirements
         where business_id = $1
         order by required_for_approval desc, label asc`,
        [business.id],
      ),
      sql.query<{ onboarding_status: string }>(
        `select onboarding_status
         from public.provider_payout_profiles
         where business_id = $1
         limit 1`,
        [business.id],
      ),
      sql.query<{ is_online: boolean; updated_at: string }>(
        `select is_online, updated_at::text as updated_at
         from public.provider_presence
         where business_id = $1
         limit 1`,
        [business.id],
      ),
    ]);

    applications.push({
      id: business.id,
      legalName: business.legal_name,
      tradeName: business.trading_name,
      businessType: business.business_type,
      ownerFullName: business.owner_full_name,
      address: business.address_line,
      area: business.area,
      district: business.district,
      city: business.city,
      state: business.state,
      pincode: business.pincode,
      gstStatus: business.gst_status,
      aggregateTurnoverBand: business.aggregate_turnover_band,
      udyamProvided: business.udyam_provided,
      authorisedRepresentative: business.authorised_representative,
      yearsExperience: Number(business.years_experience ?? 0),
      languages: business.languages ?? [],
      bio: business.bio,
      verificationStatus: business.verification_status,
      reviewerNote: business.reviewer_note,
      reviewedAt: business.reviewed_at,
      createdAt: business.created_at,
      payoutStatus: payouts[0]?.onboarding_status ?? "not_started",
      isOnline: presence[0]?.is_online ?? false,
      presenceUpdatedAt: presence[0]?.updated_at ?? null,
      services: services.map((service) => ({
        id: service.id,
        serviceId: service.service_id,
        selectedTasks: service.selected_tasks ?? [],
        specifications: service.specifications ?? {},
        verificationStatus: service.verification_status,
        isListed: service.is_listed,
        isAvailable: service.is_available,
        reviewerNote: service.reviewer_note,
        reviewedAt: service.reviewed_at,
      })),
      assets: assets.map((asset) => ({
        id: asset.id,
        assetType: asset.asset_type,
        make: asset.make,
        model: asset.model,
        yearOfManufacture: asset.year_of_manufacture,
        ownership: asset.ownership,
        roadUse: asset.road_use,
        vehicleClass: asset.vehicle_class,
        registrationLast4: asset.registration_last4,
        serialLast4: asset.serial_last4,
        specifications: asset.specifications ?? {},
        verificationStatus: asset.verification_status,
        isAvailable: asset.is_available,
        reviewerNote: asset.reviewer_note,
        reviewedAt: asset.reviewed_at,
        serviceIds: asset.service_ids ?? [],
      })),
      documentRequirements: requirements.map((requirement) => ({
        key: requirement.requirement_key,
        label: requirement.label,
        description: requirement.description,
        requiredForApproval: requirement.required_for_approval,
        secureOnly: requirement.secure_only,
        jobSpecific: requirement.job_specific,
        status: requirement.status,
      })),
    });
  }
  return applications;
}


import {
  assertAdminReviewDecisionAllowed,
  assertAdminReviewReason,
  type AdminReviewDecision,
  type ProviderReviewStatus,
} from "./admin-review-policy";

/** Admin is granted only through a controlled database operation; there is no
 * customer/provider API or UI that can add this role to their own account. */
async function requireFieldlyAdmin(sql: Awaited<ReturnType<typeof getSql>>, userId: string) {
  assertProductionIdentity(userId);
  const rows = await sql.query<{ role: string }>(
    "select role::text as role from public.fieldly_user_roles where user_id = $1 and role = 'admin' for share",
    [userId],
  );
  if (!rows[0]) {
    const error = new Error("Administrator access is required.");
    Object.assign(error, { status: 403 });
    throw error;
  }
}

export type AdminProviderQueueItem = {
  id: string;
  tradeName: string;
  legalName: string;
  ownerFullName: string;
  businessType: string;
  city: string | null;
  district: string;
  state: string;
  verificationStatus: ProviderReviewStatus;
  createdAt: string;
  serviceCount: number;
  assetCount: number;
  requiredDocumentCount: number;
  pendingRequiredDocumentCount: number;
};

export type AdminProviderApplicationDetail = {
  id: string;
  ownerFullName: string;
  tradeName: string;
  legalName: string;
  businessType: string;
  address: string;
  area: string;
  district: string;
  city: string | null;
  state: string;
  pincode: string;
  gstStatus: string;
  aggregateTurnoverBand: string;
  udyamProvided: boolean;
  authorisedRepresentative: boolean;
  yearsExperience: number;
  languages: string[];
  bio: string;
  verificationStatus: ProviderReviewStatus;
  reviewerNote: string | null;
  createdAt: string;
  services: Array<{
    id: string;
    serviceId: string;
    selectedTasks: string[];
    specifications: Record<string, string>;
    verificationStatus: string;
    isListed: boolean;
    isAvailable: boolean;
    reviewerNote: string | null;
  }>;
  assets: Array<{
    id: string;
    assetType: string;
    make: string;
    model: string;
    yearOfManufacture: number | null;
    ownership: string;
    roadUse: string;
    vehicleClass: string | null;
    registrationLast4: string | null;
    serialLast4: string | null;
    verificationStatus: string;
    isAvailable: boolean;
    reviewerNote: string | null;
    serviceIds: string[];
  }>;
  documentRequirements: Array<{
    key: string;
    label: string;
    description: string;
    requiredForApproval: boolean;
    secureOnly: boolean;
    jobSpecific: boolean;
    status: string;
  }>;
  uploadedDocuments: Array<{
    id: string;
    documentType: string;
    mimeType: string;
    sizeBytes: number;
    status: string;
    expiresOn: string | null;
    createdAt: string;
  }>;
  audit: Array<{
    id: string;
    action: string;
    reason: string | null;
    adminName: string;
    createdAt: string;
  }>;
};

export async function getAdminProviderReviewQueue(adminUserId: string): Promise<AdminProviderQueueItem[]> {
  const sql = await getSql();
  await requireFieldlyAdmin(sql, adminUserId);
  return sql.query<AdminProviderQueueItem>(
    `select
       b.id,
       b.trading_name as "tradeName",
       b.legal_name as "legalName",
       b.owner_full_name as "ownerFullName",
       b.business_type as "businessType",
       b.city,
       b.district,
       b.state,
       b.verification_status::text as "verificationStatus",
       b.created_at::text as "createdAt",
       (select count(*)::int from public.provider_services s where s.business_id = b.id) as "serviceCount",
       (select count(*)::int from public.provider_assets a where a.business_id = b.id) as "assetCount",
       (select count(*)::int from public.provider_document_requirements r
         where r.business_id = b.id and r.required_for_approval) as "requiredDocumentCount",
       (select count(*)::int
          from public.provider_document_requirements r
          left join public.provider_documents d
            on d.business_id = r.business_id
           and d.document_type = r.requirement_key
           and d.status = 'verified'
         where r.business_id = b.id
           and r.required_for_approval
           and r.status <> 'not_applicable'
           and (r.status <> 'verified' or d.id is null)
       ) as "pendingRequiredDocumentCount"
     from public.provider_businesses b
     where b.is_suspended = false
       and b.verification_status in ('submitted', 'under_review', 'needs_information')
     order by
       case b.verification_status
         when 'submitted' then 0
         when 'needs_information' then 1
         else 2
       end,
       b.created_at asc
     limit 100`,
  );
}

export async function getAdminProviderApplicationDetail(
  adminUserId: string,
  businessId: string,
): Promise<AdminProviderApplicationDetail | null> {
  const sql = await getSql();
  await requireFieldlyAdmin(sql, adminUserId);
  const businesses = await sql.query<{
    id: string;
    owner_full_name: string;
    trading_name: string;
    legal_name: string;
    business_type: string;
    address_line: string;
    area: string;
    district: string;
    city: string | null;
    state: string;
    pincode: string;
    gst_status: string;
    aggregate_turnover_band: string;
    udyam_provided: boolean;
    authorised_representative: boolean;
    years_experience: number;
    languages: string[];
    bio: string;
    verification_status: ProviderReviewStatus;
    reviewer_note: string | null;
    created_at: string;
  }>(
    `select id, owner_full_name, trading_name, legal_name, business_type,
            address_line, area, district, city, state, pincode, gst_status,
            aggregate_turnover_band, udyam_provided, authorised_representative,
            years_experience, languages, bio,
            verification_status::text as verification_status,
            reviewer_note, created_at::text as created_at
     from public.provider_businesses
     where id = $1 and is_suspended = false
     limit 1`,
    [businessId],
  );
  const business = businesses[0];
  if (!business) return null;

  const [services, assets, requirements, uploadedDocuments, audit] = await Promise.all([
    sql.query<{
      id: string; service_id: string; selected_tasks: string[];
      specifications: Record<string, string>; verification_status: string;
      is_listed: boolean; is_available: boolean; reviewer_note: string | null;
    }>(
      `select id, service_id, selected_tasks, specifications,
              verification_status::text as verification_status,
              is_listed, is_available, reviewer_note
       from public.provider_services
       where business_id = $1 order by created_at asc`,
      [businessId],
    ),
    sql.query<{
      id: string; asset_type: string; make: string; model: string;
      year_of_manufacture: number | null; ownership: string; road_use: string;
      vehicle_class: string | null; registration_last4: string | null;
      serial_last4: string | null; verification_status: string;
      is_available: boolean; reviewer_note: string | null; service_ids: string[] | null;
    }>(
      `select pa.id, pa.asset_type, pa.make, pa.model, pa.year_of_manufacture,
              pa.ownership, pa.road_use, pa.vehicle_class, pa.registration_last4,
              pa.serial_last4, pa.verification_status::text as verification_status,
              pa.is_available, pa.reviewer_note,
              coalesce(array_agg(ps.service_id) filter (where ps.service_id is not null), '{}') as service_ids
       from public.provider_assets pa
       left join public.provider_asset_services pas on pas.asset_id = pa.id
       left join public.provider_services ps
         on ps.id = pas.provider_service_id and ps.business_id = pa.business_id
       where pa.business_id = $1
       group by pa.id order by pa.created_at asc`,
      [businessId],
    ),
    sql.query<{
      requirement_key: string; label: string; description: string;
      required_for_approval: boolean; secure_only: boolean; job_specific: boolean; status: string;
    }>(
      `select requirement_key, label, description, required_for_approval,
              secure_only, job_specific, status
       from public.provider_document_requirements
       where business_id = $1
       order by required_for_approval desc, label asc`,
      [businessId],
    ),
    sql.query<{
      id: string; document_type: string; mime_type: string;
      size_bytes: string; status: string; expires_on: string | null; created_at: string;
    }>(
      `select id, document_type, mime_type, size_bytes::text as size_bytes,
              status::text as status, expires_on::text as expires_on, created_at::text as created_at
       from public.provider_documents
       where business_id = $1
       order by created_at desc`,
      [businessId],
    ),
    sql.query<{
      id: string; action: string; reason: string | null; admin_name: string; created_at: string;
    }>(
      `select a.id, a.action, a.reason, u.name as admin_name,
              a.created_at::text as created_at
       from public.fieldly_admin_audit a
       join public."user" u on u.id = a.admin_user_id
       where a.target_type = 'provider_business' and a.target_id = $1
       order by a.created_at desc
       limit 20`,
      [businessId],
    ),
  ]);

  return {
    id: business.id,
    ownerFullName: business.owner_full_name,
    tradeName: business.trading_name,
    legalName: business.legal_name,
    businessType: business.business_type,
    address: business.address_line,
    area: business.area,
    district: business.district,
    city: business.city,
    state: business.state,
    pincode: business.pincode,
    gstStatus: business.gst_status,
    aggregateTurnoverBand: business.aggregate_turnover_band,
    udyamProvided: business.udyam_provided,
    authorisedRepresentative: business.authorised_representative,
    yearsExperience: Number(business.years_experience ?? 0),
    languages: business.languages ?? [],
    bio: business.bio,
    verificationStatus: business.verification_status,
    reviewerNote: business.reviewer_note,
    createdAt: business.created_at,
    services: services.map((item) => ({
      id: item.id, serviceId: item.service_id, selectedTasks: item.selected_tasks ?? [],
      specifications: item.specifications ?? {}, verificationStatus: item.verification_status,
      isListed: item.is_listed, isAvailable: item.is_available, reviewerNote: item.reviewer_note,
    })),
    assets: assets.map((item) => ({
      id: item.id, assetType: item.asset_type, make: item.make, model: item.model,
      yearOfManufacture: item.year_of_manufacture, ownership: item.ownership,
      roadUse: item.road_use, vehicleClass: item.vehicle_class,
      registrationLast4: item.registration_last4, serialLast4: item.serial_last4,
      verificationStatus: item.verification_status, isAvailable: item.is_available,
      reviewerNote: item.reviewer_note, serviceIds: item.service_ids ?? [],
    })),
    documentRequirements: requirements.map((item) => ({
      key: item.requirement_key, label: item.label, description: item.description,
      requiredForApproval: item.required_for_approval, secureOnly: item.secure_only,
      jobSpecific: item.job_specific, status: item.status,
    })),
    uploadedDocuments: uploadedDocuments.map((item) => ({
      id: item.id, documentType: item.document_type,
      mimeType: item.mime_type, sizeBytes: Number(item.size_bytes), status: item.status,
      expiresOn: item.expires_on, createdAt: item.created_at,
    })),
    audit: audit.map((item) => ({
      id: item.id, action: item.action, reason: item.reason,
      adminName: item.admin_name, createdAt: item.created_at,
    })),
  };
}

export async function applyAdminProviderReviewDecision(input: {
  adminUserId: string;
  businessId: string;
  decision: AdminReviewDecision;
  note: string;
}): Promise<{ businessId: string; status: ProviderReviewStatus; pendingRequiredDocuments: number }> {
  const sql = await getSql();
  assertAdminReviewReason(input.decision, input.note);

  return sql.transaction(async (tx) => {
    // Lock the admin-role row for this transaction. A concurrent revocation
    // must wait until this review decision and its audit record commit.
    await requireFieldlyAdmin(tx, input.adminUserId);
    const businessRows = await tx.query<{
      id: string; verification_status: ProviderReviewStatus;
    }>(
      `select id, verification_status::text as verification_status
       from public.provider_businesses
       where id = $1 and is_suspended = false
       for update`,
      [input.businessId],
    );
    const business = businessRows[0];
    if (!business) throw new Error("Provider application not found.");

    const pendingRows = await tx.query<{ count: number }>(
      `select count(*)::int as count
       from public.provider_document_requirements r
       left join public.provider_documents d
         on d.business_id = r.business_id
        and d.document_type = r.requirement_key
        and d.status = 'verified'
       where r.business_id = $1
         and r.required_for_approval = true
         and r.status <> 'not_applicable'
         and (r.status <> 'verified' or d.id is null)`,
      [input.businessId],
    );
    const pendingRequiredDocuments = Number(pendingRows[0]?.count ?? 0);
    assertAdminReviewDecisionAllowed(
      business.verification_status,
      input.decision,
      pendingRequiredDocuments,
    );

    const updated = await tx.query<{ verification_status: ProviderReviewStatus }>(
      `update public.provider_businesses
       set verification_status = $2::fieldly_review_status,
           reviewer_note = nullif($3, ''),
           reviewed_by = $4,
           reviewed_at = now(),
           updated_at = now()
       where id = $1
       returning verification_status::text as verification_status`,
      [input.businessId, input.decision, input.note.trim(), input.adminUserId],
    );
    if (!updated[0]) throw new Error("Provider review decision could not be saved.");

    await tx.query(
      `insert into public.fieldly_admin_audit
         (admin_user_id, action, target_type, target_id, reason, metadata)
       values ($1, $2, 'provider_business', $3, nullif($4, ''), $5::jsonb)`,
      [
        input.adminUserId,
        `provider_application.${input.decision}`,
        input.businessId,
        input.note.trim(),
        JSON.stringify({
          previousStatus: business.verification_status,
          nextStatus: input.decision,
          pendingRequiredDocuments,
        }),
      ],
    );

    return {
      businessId: input.businessId,
      status: updated[0].verification_status,
      pendingRequiredDocuments,
    };
  });
}

 
export type MarketplaceProviderResult = {
  businessId: string;
  providerServiceId: string;
  serviceId: string;
  name: string;
  area: string;
  city: string;
  district: string;
  state: string;
  latitude: number;
  longitude: number;
  yearsExperience: number;
  languages: string[];
  bio: string;
  equipment: string;
  rating: number;
  reviewCount: number;
  distanceKm: number;
};

type MarketplaceProviderRow = {
  business_id: string;
  provider_service_id: string;
  name: string;
  area: string;
  city: string;
  district: string;
  state: string;
  latitude: number;
  longitude: number;
  years_experience: number;
  languages: string[] | null;
  bio: string | null;
  equipment: string;
  rating: number;
  review_count: number;
  distance_km: number;
};

async function requireCustomerRole(sql: Sql, userId: string): Promise<void> {
  assertProductionIdentity(userId);
  const roles = await sql.query<{ role: FieldlyRole }>(
    "select role::text as role from public.fieldly_user_roles where user_id = $1",
    [userId],
  );
  if (!roles.some((row) => row.role === "customer")) {
    throw new Error("A customer account is required to discover providers or create a service request.");
  }
}

async function discoverProviderRows(
  sql: Sql,
  input: DiscoverProvidersInput,
): Promise<MarketplaceProviderResult[]> {
  const service = getService(input.serviceId);
  if (!service) throw new Error("Unknown service. Refresh the page and choose a valid service.");
  const rows = await sql.query<MarketplaceProviderRow>(
    PROVIDER_DISCOVERY_SQL,
    [input.serviceId, input.site.lat, input.site.lng, service.radiusKm, 25],
  );
  return rows.map((row) => ({
    businessId: row.business_id,
    providerServiceId: row.provider_service_id,
    serviceId: input.serviceId,
    name: row.name,
    area: row.area,
    city: row.city,
    district: row.district,
    state: row.state,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    yearsExperience: Number(row.years_experience ?? 0),
    languages: row.languages ?? [],
    bio: row.bio ?? "",
    equipment: row.equipment,
    rating: Number(row.rating ?? 0),
    reviewCount: Number(row.review_count ?? 0),
    distanceKm: Number(row.distance_km),
  }));
}

/** Public fields only; all eligibility comes from the live database. */
export async function discoverProvidersForCustomer(
  userId: string,
  input: DiscoverProvidersInput,
): Promise<MarketplaceProviderResult[]> {
  const sql = await getSql();
  await requireCustomerRole(sql, userId);
  return discoverProviderRows(sql, input);
}

export type CreateJobRequestResult = {
  requestId: string;
  createdAt: string;
  providerName: string;
  distanceKm: number;
};

export async function createJobRequestForCustomer(
  userId: string,
  input: CreateJobRequestInput,
): Promise<CreateJobRequestResult> {
  const service = getService(input.serviceId);
  if (!service) throw new Error("Unknown service. Refresh the page and choose a valid service.");
  const scheduledAt = input.scheduledFor ? new Date(input.scheduledFor) : null;
  if (scheduledAt) {
    const now = Date.now();
    const scheduledTime = scheduledAt.getTime();
    if (!Number.isFinite(scheduledTime) || scheduledTime < now - 60_000) {
      throw new Error("Choose a service time in the future.");
    }
    if (scheduledTime > now + 180 * 24 * 60 * 60 * 1000) {
      throw new Error("Service requests can be scheduled up to 180 days ahead.");
    }
  }

  const sql = await getSql();
  return sql.transaction(async (tx) => {
    await requireCustomerRole(tx, userId);
    // Re-check approval, linked approved machinery, availability and the
    // provider heartbeat inside the same transaction as request creation.
    const eligibleProviders = await discoverProviderRows(tx, input);
    const selected = eligibleProviders.find((provider) => provider.businessId === input.businessId);
    if (!selected) {
      throw new Error("This provider is no longer verified, online, available or within range. Refresh the provider list.");
    }

    const inserted = await tx.query<{ id: string; created_at: string }>(
      "insert into public.job_requests (customer_user_id, service_id, status, site_label, site_address, area, city, district, state, pincode, landmark, latitude, longitude, scheduled_for, scheduling_note, requirements, customer_notes, details_consent_at) " +
      "values ($1, $2, 'open', $3, $4, $5, $6, $7, $8, nullif($9, ''), nullif($10, ''), $11, $12, $13, $14, $15::jsonb, $16, now()) " +
      "returning id::text as id, created_at::text as created_at",
      [
        userId,
        input.serviceId,
        input.site.label,
        input.site.address?.trim() || input.site.label,
        input.site.area,
        input.site.city,
        input.site.district?.trim() || null,
        input.site.state,
        input.site.pincode?.trim() || "",
        input.site.landmark?.trim() || "",
        input.site.lat,
        input.site.lng,
        scheduledAt ? scheduledAt.toISOString() : null,
        input.whenLabel,
        JSON.stringify(input.requirements),
        input.notes.trim(),
      ],
    );
    const request = inserted[0];
    if (!request) throw new Error("The service request could not be saved.");

    await tx.query(
      "insert into public.job_request_targets (request_id, business_id, provider_service_id, status) values ($1::uuid, $2::uuid, $3::uuid, 'sent')",
      [request.id, selected.businessId, selected.providerServiceId],
    );

    return {
      requestId: request.id,
      createdAt: request.created_at,
      providerName: selected.name,
      distanceKm: selected.distanceKm,
    };
  });
}

 
export type CustomerJobRequestDetail = {
  id: string;
  serviceId: string;
  status: "open" | "booked" | "cancelled" | "expired";
  createdAt: string;
  whenLabel: string;
  notes: string;
  requirements: Record<string, string>;
  site: {
    label: string; area: string; city: string; district?: string; state: string;
    pincode?: string; address?: string; landmark?: string; lat: number; lng: number;
  };
  provider: {
    businessId: string; name: string; area: string; city: string; state: string;
    latitude: number; longitude: number; yearsExperience: number;
  };
  distanceKm: number;
  quotes: Array<{
    id: string;
    businessId: string;
    providerName: string;
    amountPaise: number;
    currency: string;
    note: string;
    inclusions: string[];
    exclusions: string[];
    extraCharges: Array<{ label: string; amountPaise: number }>;
    cancellationTerms: string;
    etaMinutes: number | null;
    status: "pending" | "accepted" | "declined" | "withdrawn" | "expired";
    createdAt: string;
    expiresAt: string | null;
  }>;
  booking: {
    id: string;
    publicReference: string;
    amountPaise: number;
    status: string;
  } | null;
};

/** Read a request only for its verified customer owner. */
export async function getCustomerJobRequestForUser(
  userId: string,
  requestId: string,
): Promise<CustomerJobRequestDetail | null> {
  const sql = await getSql();
  await requireCustomerRole(sql, userId);
  const rows = await sql.query<{
    id: string; service_id: string; status: CustomerJobRequestDetail["status"];
    created_at: string; scheduling_note: string; customer_notes: string;
    requirements: Record<string, string>; site_label: string; site_address: string;
    area: string | null; city: string; district: string | null; state: string;
    pincode: string | null; landmark: string | null; latitude: number; longitude: number;
    business_id: string; provider_name: string; provider_area: string; provider_city: string;
    provider_state: string; provider_latitude: number; provider_longitude: number;
    years_experience: number; booking_id: string | null; public_reference: string | null;
    booking_amount_paise: string | number | null; booking_status: string | null;
  }>(
    "select jr.id::text as id, jr.service_id, jr.status::text as status, jr.created_at::text as created_at, " +
    "jr.scheduling_note, jr.customer_notes, jr.requirements, jr.site_label, jr.site_address, jr.area, " +
    "jr.city, jr.district, jr.state, jr.pincode, jr.landmark, jr.latitude, jr.longitude, " +
    "pb.id::text as business_id, pb.trading_name as provider_name, coalesce(pb.area,'') as provider_area, " +
    "coalesce(pb.city,pb.district,'') as provider_city, pb.state as provider_state, pb.latitude as provider_latitude, " +
    "pb.longitude as provider_longitude, pb.years_experience, " +
    "b.id::text as booking_id, b.public_reference, b.amount_paise::text as booking_amount_paise, " +
    "b.status::text as booking_status " +
    "from public.job_requests jr " +
    "join public.job_request_targets jrt on jrt.request_id = jr.id " +
    "join public.provider_businesses pb on pb.id = jrt.business_id " +
    "left join public.bookings b on b.request_id = jr.id " +
    "where jr.id = $1::uuid and jr.customer_user_id = $2 limit 1",
    [requestId, userId],
  );
  const row = rows[0];
  if (!row) return null;
  const quoteRows = await sql.query<{
    id: string;
    business_id: string;
    provider_name: string;
    amount_paise: string | number;
    currency: string;
    note: string;
    inclusions: string[];
    exclusions: string[];
    extra_charges: Array<{ label: string; amountPaise: number }>;
    cancellation_terms: string;
    eta_minutes: number | null;
    status: CustomerJobRequestDetail["quotes"][number]["status"];
    created_at: string;
    expires_at: string | null;
  }>(
    "select pq.id::text as id, pb.id::text as business_id, pb.trading_name as provider_name, " +
    "pq.amount_paise::text as amount_paise, pq.currency, pq.note, pq.inclusions, pq.exclusions, " +
    "pq.extra_charges, pq.cancellation_terms, pq.eta_minutes, pq.status::text as status, " +
    "pq.created_at::text as created_at, pq.expires_at::text as expires_at " +
    "from public.provider_quotes pq " +
    "join public.provider_businesses pb on pb.id = pq.business_id " +
    "where pq.request_id = $1::uuid and pq.status <> 'withdrawn' " +
    "order by pq.created_at asc",
    [requestId],
  );
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const lat1 = radians(Number(row.latitude));
  const lat2 = radians(Number(row.provider_latitude));
  const dLat = lat2 - lat1;
  const dLng = radians(Number(row.provider_longitude) - Number(row.longitude));
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const distanceKm = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  return {
    id: row.id,
    serviceId: row.service_id,
    status: row.status,
    createdAt: row.created_at,
    whenLabel: row.scheduling_note,
    notes: row.customer_notes,
    requirements: row.requirements ?? {},
    site: {
      label: row.site_label,
      area: row.area ?? "",
      city: row.city,
      district: row.district ?? undefined,
      state: row.state,
      pincode: row.pincode ?? undefined,
      address: row.site_address,
      landmark: row.landmark ?? undefined,
      lat: Number(row.latitude),
      lng: Number(row.longitude),
    },
    provider: {
      businessId: row.business_id,
      name: row.provider_name,
      area: row.provider_area,
      city: row.provider_city,
      state: row.provider_state,
      latitude: Number(row.provider_latitude),
      longitude: Number(row.provider_longitude),
      yearsExperience: Number(row.years_experience ?? 0),
    },
    distanceKm,
    quotes: quoteRows.map((quote) => ({
      id: quote.id,
      businessId: quote.business_id,
      providerName: quote.provider_name,
      amountPaise: Number(quote.amount_paise),
      currency: quote.currency,
      note: quote.note,
      inclusions: quote.inclusions ?? [],
      exclusions: quote.exclusions ?? [],
      extraCharges: quote.extra_charges ?? [],
      cancellationTerms: quote.cancellation_terms,
      etaMinutes: quote.eta_minutes,
      status: quote.status,
      createdAt: quote.created_at,
      expiresAt: quote.expires_at,
    })),
    booking: row.booking_id ? {
      id: row.booking_id,
      publicReference: row.public_reference ?? "",
      amountPaise: Number(row.booking_amount_paise ?? 0),
      status: row.booking_status ?? "confirmed",
    } : null,
  };
}


async function requireProviderRole(sql: Sql, userId: string): Promise<void> {
  assertProductionIdentity(userId);
  const roles = await sql.query<{ role: FieldlyRole }>(
    "select role::text as role from public.fieldly_user_roles where user_id = $1",
    [userId],
  );
  if (!roles.some((row) => row.role === "provider")) {
    throw new Error("A provider account is required for provider operations.");
  }
}

export type ProviderPresenceResult = {
  businessId: string;
  isOnline: boolean;
  updatedAt: string;
};

/** Provider may change availability only on an approved business they own. */
export async function setProviderPresenceForUser(
  userId: string,
  input: { businessId: string; isOnline: boolean },
): Promise<ProviderPresenceResult> {
  const sql = await getSql();
  return sql.transaction(async (tx) => {
    await requireProviderRole(tx, userId);
    const businesses = await tx.query<{ id: string }>(
      "select id::text as id from public.provider_businesses " +
      "where id = $1::uuid and owner_user_id = $2 and verification_status = 'approved' and is_suspended = false " +
      "and latitude is not null and longitude is not null " +
      "for update",
      [input.businessId, userId],
    );
    if (!businesses[0]) {
      throw new Error("Only an approved business owned by your signed-in account can change availability.");
    }

    if (input.isOnline) {
      const eligible = await tx.query<{ count: number }>(
        "select count(*)::int as count from public.provider_services ps " +
        "where ps.business_id = $1::uuid and ps.verification_status = 'approved' and ps.is_listed = true and ps.is_available = true " +
        "and exists (select 1 from public.provider_asset_services pas " +
        "join public.provider_assets pa on pa.id = pas.asset_id and pa.business_id = ps.business_id " +
        "where pas.provider_service_id = ps.id and pa.verification_status = 'approved' and pa.is_available = true)",
        [input.businessId],
      );
      if (Number(eligible[0]?.count ?? 0) < 1) {
        throw new Error("Your business has no approved, listed service with approved available equipment yet.");
      }
    }

    const rows = await tx.query<{ business_id: string; is_online: boolean; updated_at: string }>(
      "insert into public.provider_presence (business_id, is_online, last_seen_at, updated_at) " +
      "values ($1::uuid, $2, case when $2 then now() else null end, now()) " +
      "on conflict (business_id) do update set is_online = excluded.is_online, " +
      "last_seen_at = case when excluded.is_online then now() else null end, updated_at = now() " +
      "returning business_id::text as business_id, is_online, updated_at::text as updated_at",
      [input.businessId, input.isOnline],
    );
    const row = rows[0];
    if (!row) throw new Error("Provider availability could not be saved.");
    return { businessId: row.business_id, isOnline: row.is_online, updatedAt: row.updated_at };
  });
}

export type ProviderOpenRequest = {
  requestId: string;
  businessId: string;
  serviceId: string;
  site: {
    label: string; area: string; city: string; district: string | null; state: string;
    pincode: string | null; address: string; landmark: string | null;
    latitude: number; longitude: number;
  };
  requirements: Record<string, string>;
  whenLabel: string;
  notes: string;
  createdAt: string;
  distanceKm: number;
};

/** Requests are returned only for active, eligible businesses owned by this provider. */
export async function getProviderOpenRequestsForUser(userId: string): Promise<ProviderOpenRequest[]> {
  const sql = await getSql();
  await requireProviderRole(sql, userId);
  const rows = await sql.query<{
    request_id: string; business_id: string; service_id: string; site_label: string;
    area: string | null; city: string; district: string | null; state: string;
    pincode: string | null; site_address: string; landmark: string | null;
    latitude: number; longitude: number; requirements: Record<string, string>;
    scheduling_note: string; customer_notes: string; created_at: string;
    provider_latitude: number; provider_longitude: number;
  }>(
    "select jr.id::text as request_id, pb.id::text as business_id, jr.service_id, jr.site_label, " +
    "jr.area, jr.city, jr.district, jr.state, jr.pincode, jr.site_address, jr.landmark, " +
    "jr.latitude, jr.longitude, jr.requirements, jr.scheduling_note, jr.customer_notes, " +
    "jr.created_at::text as created_at, pb.latitude as provider_latitude, pb.longitude as provider_longitude " +
    "from public.provider_businesses pb " +
    "join public.provider_presence presence on presence.business_id = pb.id and presence.is_online = true " +
    "and coalesce(presence.last_seen_at,presence.updated_at) >= now() - interval '10 minutes' " +
    "join public.job_request_targets jrt on jrt.business_id = pb.id and jrt.status in ('sent','viewed') " +
    "join public.job_requests jr on jr.id = jrt.request_id and jr.status = 'open' " +
    "join public.provider_services ps on ps.id = jrt.provider_service_id and ps.business_id = pb.id " +
    "where pb.owner_user_id = $1 and pb.verification_status = 'approved' and pb.is_suspended = false " +
    "and ps.verification_status = 'approved' and ps.is_listed = true and ps.is_available = true " +
    "and exists (select 1 from public.provider_asset_services pas " +
    "join public.provider_assets pa on pa.id = pas.asset_id and pa.business_id = pb.id " +
    "where pas.provider_service_id = ps.id and pa.verification_status = 'approved' and pa.is_available = true) " +
    "order by jr.created_at asc limit 50",
    [userId],
  );
  return rows.map((row) => {
    const radians = (degrees: number) => (degrees * Math.PI) / 180;
    const lat1 = radians(Number(row.latitude));
    const lat2 = radians(Number(row.provider_latitude));
    const dLat = lat2 - lat1;
    const dLng = radians(Number(row.longitude) - Number(row.provider_longitude));
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return {
      requestId: row.request_id,
      businessId: row.business_id,
      serviceId: row.service_id,
      site: {
        label: row.site_label,
        area: row.area ?? "",
        city: row.city,
        district: row.district,
        state: row.state,
        pincode: row.pincode,
        address: row.site_address,
        landmark: row.landmark,
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
      },
      requirements: row.requirements ?? {},
      whenLabel: row.scheduling_note,
      notes: row.customer_notes,
      createdAt: row.created_at,
      distanceKm: 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a))),
    };
  });
}

export type ProviderQuoteResult = {
  quoteId: string;
  requestId: string;
  businessId: string;
  amountPaise: number;
  status: "pending";
};

/** Submit or revise a pending quote only for a request assigned to an owned, eligible business. */
export async function submitProviderQuoteForUser(
  userId: string,
  input: SubmitProviderQuoteInput,
): Promise<ProviderQuoteResult> {
  assertProductionIdentity(userId);
  const amountPaise = input.amountRupees * 100;
  if (!Number.isSafeInteger(amountPaise)) throw new Error("Enter a valid quote amount.");

  const extraCharges = input.extraCharges.map((item) => {
    const amount = item.amountRupees * 100;
    if (!Number.isSafeInteger(amount)) throw new Error("An extra charge is too large.");
    return { label: item.label, amountPaise: amount };
  });

  const sql = await getSql();
  return sql.transaction(async (tx) => {
    await requireProviderRole(tx, userId);
    const targets = await tx.query<{
      request_id: string; business_id: string; service_id: string; provider_service_id: string;
      target_status: string; existing_quote_id: string | null; existing_quote_status: string | null;
    }>(
      "select jr.id::text as request_id, pb.id::text as business_id, jr.service_id, ps.id::text as provider_service_id, " +
      "jrt.status as target_status, pq.id::text as existing_quote_id, pq.status::text as existing_quote_status " +
      "from public.job_requests jr " +
      "join public.job_request_targets jrt on jrt.request_id = jr.id and jrt.business_id = $2::uuid " +
      "join public.provider_businesses pb on pb.id = jrt.business_id and pb.owner_user_id = $1 " +
      "join public.provider_services ps on ps.id = jrt.provider_service_id and ps.business_id = pb.id " +
      "left join public.provider_quotes pq on pq.request_id = jr.id and pq.business_id = pb.id " +
      "where jr.id = $3::uuid and jr.status = 'open' and jrt.status in ('sent','viewed','quoted') " +
      "and pb.verification_status = 'approved' and pb.is_suspended = false " +
      "and ps.verification_status = 'approved' and ps.is_listed = true and ps.is_available = true " +
      "and exists (select 1 from public.provider_asset_services pas " +
      "join public.provider_assets pa on pa.id = pas.asset_id and pa.business_id = pb.id " +
      "where pas.provider_service_id = ps.id and pa.verification_status = 'approved' and pa.is_available = true) " +
      "and exists (select 1 from public.provider_presence presence where presence.business_id = pb.id " +
      "and presence.is_online = true and coalesce(presence.last_seen_at,presence.updated_at) >= now() - interval '10 minutes') " +
      "for update of jr, jrt",
      [userId, input.businessId, input.requestId],
    );
    const target = targets[0];
    if (!target) {
      throw new Error("This request is not assigned to your approved, online business or its service/equipment is no longer eligible.");
    }
    if (target.existing_quote_id && target.existing_quote_status !== "pending") {
      throw new Error("You have already responded to this request and that quote is no longer editable.");
    }

    const quoteRows = target.existing_quote_id
      ? await tx.query<{ id: string }>(
          "update public.provider_quotes set amount_paise = $2, note = $3, inclusions = $4::jsonb, " +
          "exclusions = $5::jsonb, extra_charges = $6::jsonb, cancellation_terms = $7, eta_minutes = $8, updated_at = now() " +
          "where id = $1::uuid and status = 'pending' returning id::text as id",
          [
            target.existing_quote_id, amountPaise, input.note.trim(),
            JSON.stringify(input.inclusions), JSON.stringify(input.exclusions),
            JSON.stringify(extraCharges), input.cancellationTerms.trim(), input.etaMinutes,
          ],
        )
      : await tx.query<{ id: string }>(
          "insert into public.provider_quotes (request_id, business_id, amount_paise, note, inclusions, exclusions, extra_charges, cancellation_terms, eta_minutes, status) " +
          "values ($1::uuid, $2::uuid, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, 'pending') " +
          "returning id::text as id",
          [
            input.requestId, input.businessId, amountPaise, input.note.trim(),
            JSON.stringify(input.inclusions), JSON.stringify(input.exclusions),
            JSON.stringify(extraCharges), input.cancellationTerms.trim(), input.etaMinutes,
          ],
        );
    const quote = quoteRows[0];
    if (!quote) throw new Error("The provider quote could not be saved.");
    await tx.query(
      "update public.job_request_targets set status = 'quoted' where request_id = $1::uuid and business_id = $2::uuid",
      [input.requestId, input.businessId],
    );
    return {
      quoteId: quote.id,
      requestId: input.requestId,
      businessId: input.businessId,
      amountPaise,
      status: "pending",
    };
  });
}


export type AcceptProviderQuoteResult = {
  bookingId: string;
  publicReference: string;
  amountPaise: number;
  status: "confirmed";
};

/** Accept one pending provider quote and create exactly one booking atomically. */
export async function acceptProviderQuoteForCustomer(
  userId: string,
  input: { quoteId: string; termsAccepted: true },
): Promise<AcceptProviderQuoteResult> {
  assertProductionIdentity(userId);
  if (input.termsAccepted !== true) throw new Error("Review and accept the provider terms before confirming this booking.");
  const sql = await getSql();
  return sql.transaction(async (tx) => {
    await requireCustomerRole(tx, userId);
    const rows = await tx.query<{
      request_id: string;
      service_id: string;
      scheduled_for: string | null;
      site_label: string;
      site_address: string;
      area: string | null;
      city: string;
      district: string | null;
      state: string;
      pincode: string | null;
      landmark: string | null;
      latitude: number;
      longitude: number;
      requirements: Record<string, string>;
      customer_notes: string;
      business_id: string;
      provider_service_id: string;
      provider_name: string;
      amount_paise: string | number;
      currency: string;
      note: string;
      inclusions: string[];
      exclusions: string[];
      extra_charges: Array<{ label: string; amountPaise: number }>;
      cancellation_terms: string;
      eta_minutes: number | null;
      quote_created_at: string;
    }>(
      "select jr.id::text as request_id, jr.service_id, jr.scheduled_for::text as scheduled_for, " +
      "jr.site_label, jr.site_address, jr.area, jr.city, jr.district, jr.state, jr.pincode, jr.landmark, " +
      "jr.latitude, jr.longitude, jr.requirements, jr.customer_notes, pb.id::text as business_id, " +
      "ps.id::text as provider_service_id, pb.trading_name as provider_name, pq.amount_paise::text as amount_paise, " +
      "pq.currency, pq.note, pq.inclusions, pq.exclusions, pq.extra_charges, pq.cancellation_terms, " +
      "pq.eta_minutes, pq.created_at::text as quote_created_at " +
      "from public.provider_quotes pq " +
      "join public.job_requests jr on jr.id = pq.request_id " +
      "join public.job_request_targets jrt on jrt.request_id = jr.id and jrt.business_id = pq.business_id " +
      "join public.provider_businesses pb on pb.id = pq.business_id " +
      "join public.provider_services ps on ps.id = jrt.provider_service_id and ps.business_id = pb.id " +
      "where pq.id = $1::uuid and jr.customer_user_id = $2 " +
      "and jr.status = 'open' and pq.status = 'pending' " +
      "and (pq.expires_at is null or pq.expires_at > now()) " +
      "and pb.verification_status = 'approved' and pb.is_suspended = false " +
      "and ps.verification_status = 'approved' and ps.is_listed = true and ps.is_available = true " +
      "and exists (select 1 from public.provider_asset_services pas " +
      "join public.provider_assets pa on pa.id = pas.asset_id and pa.business_id = pb.id " +
      "where pas.provider_service_id = ps.id and pa.verification_status = 'approved' and pa.is_available = true) " +
      "for update of jr, pq, jrt",
      [input.quoteId, userId],
    );
    const quote = rows[0];
    if (!quote) {
      throw new Error("This quote is no longer available, or it does not belong to your account.");
    }
    const amountPaise = Number(quote.amount_paise);
    if (!Number.isSafeInteger(amountPaise) || amountPaise < 1) {
      throw new Error("The provider quote contains an invalid amount.");
    }

    const publicReference = "MS-" + new Date().toISOString().slice(0, 10).replaceAll("-", "") +
      "-" + randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
    const siteSnapshot = {
      label: quote.site_label,
      address: quote.site_address,
      area: quote.area,
      city: quote.city,
      district: quote.district,
      state: quote.state,
      pincode: quote.pincode,
      landmark: quote.landmark,
      latitude: Number(quote.latitude),
      longitude: Number(quote.longitude),
    };
    const termsSnapshot = {
      currency: quote.currency,
      amountPaise,
      note: quote.note,
      inclusions: quote.inclusions ?? [],
      exclusions: quote.exclusions ?? [],
      extraCharges: quote.extra_charges ?? [],
      cancellationTerms: quote.cancellation_terms,
      etaMinutes: quote.eta_minutes,
      acceptedAt: new Date().toISOString(),
    };

    const bookings = await tx.query<{ id: string }>(
      "insert into public.bookings (" +
      "public_reference, request_id, quote_id, customer_user_id, business_id, provider_service_id, " +
      "service_id, status, amount_paise, currency, scheduled_for, site_snapshot, requirements_snapshot, terms_snapshot" +
      ") values ($1, $2::uuid, $3::uuid, $4, $5::uuid, $6::uuid, $7, 'confirmed', $8, $9, $10, $11::jsonb, $12::jsonb, $13::jsonb) " +
      "returning id::text as id",
      [
        publicReference,
        quote.request_id,
        input.quoteId,
        userId,
        quote.business_id,
        quote.provider_service_id,
        quote.service_id,
        amountPaise,
        quote.currency,
        quote.scheduled_for,
        JSON.stringify(siteSnapshot),
        JSON.stringify(quote.requirements ?? {}),
        JSON.stringify(termsSnapshot),
      ],
    );
    const booking = bookings[0];
    if (!booking) throw new Error("The booking could not be confirmed.");

    await tx.query(
      "insert into public.booking_events (booking_id, actor_user_id, from_status, to_status, event_type, note, metadata) " +
      "values ($1::uuid, $2, null, 'confirmed', 'quote_accepted', 'Customer accepted provider quote', $3::jsonb)",
      [booking.id, userId, JSON.stringify({ quoteId: input.quoteId, publicReference })],
    );
    await tx.query(
      "update public.job_requests set status = 'booked', updated_at = now() where id = $1::uuid and status = 'open'",
      [quote.request_id],
    );
    await tx.query(
      "update public.provider_quotes set status = case when id = $1::uuid then 'accepted'::fieldly_quote_status else 'declined'::fieldly_quote_status end, updated_at = now() " +
      "where request_id = $2::uuid and status = 'pending'",
      [input.quoteId, quote.request_id],
    );
    await tx.query(
      "update public.job_request_targets set status = case when business_id = $1::uuid then 'accepted' else 'closed' end " +
      "where request_id = $2::uuid",
      [quote.business_id, quote.request_id],
    );
    return {
      bookingId: booking.id,
      publicReference,
      amountPaise,
      status: "confirmed",
    };
  });
}


/** Automatically stop new requests when a business has no remaining eligible service/machine pair. */
async function pausePresenceIfNoEligibleService(sql: Sql, businessId: string): Promise<void> {
  const rows = await sql.query<{ count: number }>(
    "select count(*)::int as count from public.provider_services ps " +
    "where ps.business_id=$1::uuid and ps.verification_status='approved' and ps.is_listed=true and ps.is_available=true " +
    "and exists (select 1 from public.provider_asset_services pas " +
    "join public.provider_assets pa on pa.id=pas.asset_id and pa.business_id=ps.business_id " +
    "where pas.provider_service_id=ps.id and pa.verification_status='approved' and pa.is_available=true)",
    [businessId],
  );
  if (Number(rows[0]?.count ?? 0) === 0) {
    await sql.query(
      "update public.provider_presence set is_online=false,last_seen_at=null,updated_at=now() where business_id=$1::uuid",
      [businessId],
    );
  }
}

/** Enable/pause one approved service for an owned approved business. */
export async function setProviderServiceAvailabilityForUser(
  userId: string,
  input: SetProviderServiceAvailabilityInput,
): Promise<{ providerServiceId: string; isAvailable: boolean; isListed: boolean }> {
  const sql = await getSql();
  return sql.transaction(async (tx) => {
    await requireProviderRole(tx, userId);
    const businesses = await tx.query<{ id: string }>(
      "select id::text as id from public.provider_businesses where id=$1::uuid and owner_user_id=$2 " +
      "and verification_status='approved' and is_suspended=false for update",
      [input.businessId, userId],
    );
    if (!businesses[0]) throw new Error("This approved business is not owned by your signed-in provider account.");

    const services = await tx.query<{ id: string; verification_status: string }>(
      "select id::text as id, verification_status::text as verification_status from public.provider_services " +
      "where id=$1::uuid and business_id=$2::uuid for update",
      [input.providerServiceId, input.businessId],
    );
    const service = services[0];
    if (!service) throw new Error("The selected service does not belong to this business.");
    if (input.isAvailable && service.verification_status !== "approved") {
      throw new Error("This service must pass MakeService admin verification before it can accept requests.");
    }
    if (input.isAvailable) {
      const machines = await tx.query<{ count: number }>(
        "select count(*)::int as count from public.provider_asset_services pas " +
        "join public.provider_assets pa on pa.id=pas.asset_id and pa.business_id=$1::uuid " +
        "where pas.provider_service_id=$2::uuid and pa.verification_status='approved'",
        [input.businessId, input.providerServiceId],
      );
      if (Number(machines[0]?.count ?? 0) < 1) {
        throw new Error("Link at least one admin-approved machine to this service before activating it.");
      }
    }
    const updated = await tx.query<{ id: string; is_available: boolean; is_listed: boolean }>(
      "update public.provider_services set is_listed=case when $2 then true else is_listed end, " +
      "is_available=$2, updated_at=now() where id=$1::uuid and business_id=$3::uuid " +
      "returning id::text as id,is_available,is_listed",
      [input.providerServiceId, input.isAvailable, input.businessId],
    );
    const row = updated[0];
    if (!row) throw new Error("Service availability could not be saved.");
    if (!input.isAvailable) await pausePresenceIfNoEligibleService(tx, input.businessId);
    return { providerServiceId: row.id, isAvailable: row.is_available, isListed: row.is_listed };
  });
}

/** Enable/pause one approved machine; it must be linked to an active approved service. */
export async function setProviderAssetAvailabilityForUser(
  userId: string,
  input: SetProviderAssetAvailabilityInput,
): Promise<{ assetId: string; isAvailable: boolean }> {
  const sql = await getSql();
  return sql.transaction(async (tx) => {
    await requireProviderRole(tx, userId);
    const businesses = await tx.query<{ id: string }>(
      "select id::text as id from public.provider_businesses where id=$1::uuid and owner_user_id=$2 " +
      "and verification_status='approved' and is_suspended=false for update",
      [input.businessId, userId],
    );
    if (!businesses[0]) throw new Error("This approved business is not owned by your signed-in provider account.");

    const assets = await tx.query<{ id: string; verification_status: string }>(
      "select id::text as id,verification_status::text as verification_status from public.provider_assets " +
      "where id=$1::uuid and business_id=$2::uuid for update",
      [input.assetId, input.businessId],
    );
    const asset = assets[0];
    if (!asset) throw new Error("The selected machine does not belong to this business.");
    if (input.isAvailable && asset.verification_status !== "approved") {
      throw new Error("This machine must pass MakeService admin verification before it can be assigned to customer work.");
    }
    if (input.isAvailable) {
      const services = await tx.query<{ count: number }>(
        "select count(*)::int as count from public.provider_asset_services pas " +
        "join public.provider_services ps on ps.id=pas.provider_service_id and ps.business_id=$1::uuid " +
        "where pas.asset_id=$2::uuid and ps.verification_status='approved' and ps.is_listed=true and ps.is_available=true",
        [input.businessId, input.assetId],
      );
      if (Number(services[0]?.count ?? 0) < 1) {
        throw new Error("Activate an admin-approved service linked to this machine first.");
      }
    }
    const updated = await tx.query<{ id: string; is_available: boolean }>(
      "update public.provider_assets set is_available=$2,updated_at=now() " +
      "where id=$1::uuid and business_id=$3::uuid returning id::text as id,is_available",
      [input.assetId, input.isAvailable, input.businessId],
    );
    const row = updated[0];
    if (!row) throw new Error("Machine availability could not be saved.");
    if (!input.isAvailable) await pausePresenceIfNoEligibleService(tx, input.businessId);
    return { assetId: row.id, isAvailable: row.is_available };
  });
}


export type LiveBookingStatus =
  | "confirmed"
  | "on_the_way"
  | "arrived"
  | "service_started"
  | "service_completed"
  | "paid"
  | "disputed"
  | "cancelled";

export type LiveBookingDetail = {
  id: string;
  publicReference: string;
  status: LiveBookingStatus;
  amountPaise: number;
  currency: string;
  serviceId: string;
  scheduledFor: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  cancellationReason: string | null;
  disputeReason: string | null;
  site: {
    label: string;
    address: string;
    area: string;
    city: string;
    district: string | null;
    state: string;
    pincode: string | null;
    landmark: string | null;
    latitude: number;
    longitude: number;
  };
  requirements: Record<string, string>;
  terms: {
    note?: string;
    inclusions: string[];
    exclusions: string[];
    extraCharges: Array<{ label: string; amountPaise: number }>;
    cancellationTerms?: string;
    etaMinutes?: number | null;
  };
  provider: {
    businessId: string;
    name: string;
    baseLatitude: number | null;
    baseLongitude: number | null;
  };
  permissions: {
    isCustomer: boolean;
    isProvider: boolean;
  };
  startCode: {
    hasActiveCode: boolean;
    expiresAt: string | null;
    attempts: number;
    issueCount: number;
    maxIssues: number;
    maxAttempts: number;
  };
  liveLocation: {
    latitude: number;
    longitude: number;
    accuracyMeters: number | null;
    headingDegrees: number | null;
    speedMps: number | null;
    recordedAt: string;
    expiresAt: string;
  } | null;
  events: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    eventType: string;
    note: string | null;
    createdAt: string;
  }>;
};

type BookingRow = {
  id: string;
  public_reference: string;
  status: LiveBookingStatus;
  amount_paise: string | number;
  currency: string;
  service_id: string;
  scheduled_for: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  cancellation_reason: string | null;
  dispute_reason: string | null;
  customer_user_id: string;
  site_snapshot: Record<string, unknown>;
  requirements_snapshot: Record<string, string>;
  terms_snapshot: Record<string, unknown>;
  start_code_hash: string | null;
  start_code_expires_at: string | null;
  start_code_attempts: number;
  start_code_issue_count: number;
  business_id: string;
  provider_name: string;
  provider_latitude: number | null;
  provider_longitude: number | null;
};

function participantSiteSnapshot(value: Record<string, unknown>): LiveBookingDetail["site"] {
  return {
    label: String(value.label ?? "Work site"),
    address: String(value.address ?? value.label ?? ""),
    area: String(value.area ?? ""),
    city: String(value.city ?? ""),
    district: value.district ? String(value.district) : null,
    state: String(value.state ?? ""),
    pincode: value.pincode ? String(value.pincode) : null,
    landmark: value.landmark ? String(value.landmark) : null,
    latitude: Number(value.latitude),
    longitude: Number(value.longitude),
  };
}

/** Read a booking only for its customer or its assigned provider business owner. */
export async function getBookingDetailForUser(
  userId: string,
  bookingId: string,
): Promise<LiveBookingDetail | null> {
  assertProductionIdentity(userId);
  const sql = await getSql();
  const rows = await sql.query<BookingRow>(
    "select b.id::text as id,b.public_reference,b.status::text as status,b.amount_paise::text as amount_paise, " +
    "b.currency,b.service_id,b.scheduled_for::text as scheduled_for,b.created_at::text as created_at, " +
    "b.updated_at::text as updated_at,b.completed_at::text as completed_at,b.cancellation_reason,b.dispute_reason, " +
    "b.customer_user_id,b.site_snapshot,b.requirements_snapshot,b.terms_snapshot,b.start_code_hash, " +
    "b.start_code_expires_at::text as start_code_expires_at,b.start_code_attempts,b.start_code_issue_count, " +
    "pb.id::text as business_id,pb.trading_name as provider_name,pb.latitude as provider_latitude,pb.longitude as provider_longitude " +
    "from public.bookings b join public.provider_businesses pb on pb.id=b.business_id " +
    "where b.id=$1::uuid and (b.customer_user_id=$2 or pb.owner_user_id=$2) limit 1",
    [bookingId, userId],
  );
  const row = rows[0];
  if (!row) return null;

  const isCustomer = row.customer_user_id === userId;
  const isProvider = !isCustomer && await (async () => {
    await requireProviderRole(sql, userId);
    return true;
  })();
  if (isCustomer) await requireCustomerRole(sql, userId);
  const [events, locations] = await Promise.all([
    sql.query<{
      id: string; from_status: string | null; to_status: string;
      event_type: string; note: string | null; created_at: string;
    }>(
      "select id::text as id,from_status::text as from_status,to_status::text as to_status, " +
      "event_type,note,created_at::text as created_at from public.booking_events " +
      "where booking_id=$1::uuid order by created_at asc limit 100",
      [bookingId],
    ),
    sql.query<{
      latitude: number; longitude: number; accuracy_meters: string | number | null;
      heading_degrees: string | number | null; speed_mps: string | number | null;
      recorded_at: string; expires_at: string;
    }>(
      "select latitude,longitude,accuracy_meters::text as accuracy_meters,heading_degrees::text as heading_degrees, " +
      "speed_mps::text as speed_mps,recorded_at::text as recorded_at,expires_at::text as expires_at " +
      "from public.booking_live_locations where booking_id=$1::uuid and expires_at>now() " +
      "and recorded_at>now()-interval '2 minutes' limit 1",
      [bookingId],
    ),
  ]);
  const terms = row.terms_snapshot ?? {};
  const expiresAt = row.start_code_expires_at;
  const activeCode = Boolean(
    isCustomer && row.status === "arrived" && row.start_code_hash && expiresAt &&
    new Date(expiresAt).getTime() > Date.now(),
  );
  const location = locations[0];
  return {
    id: row.id,
    publicReference: row.public_reference,
    status: row.status,
    amountPaise: Number(row.amount_paise),
    currency: row.currency,
    serviceId: row.service_id,
    scheduledFor: row.scheduled_for,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    cancellationReason: row.cancellation_reason,
    disputeReason: row.dispute_reason,
    site: participantSiteSnapshot(row.site_snapshot ?? {}),
    requirements: row.requirements_snapshot ?? {},
    terms: {
      note: typeof terms.note === "string" ? terms.note : undefined,
      inclusions: Array.isArray(terms.inclusions) ? terms.inclusions as string[] : [],
      exclusions: Array.isArray(terms.exclusions) ? terms.exclusions as string[] : [],
      extraCharges: Array.isArray(terms.extraCharges)
        ? terms.extraCharges as Array<{ label: string; amountPaise: number }>
        : [],
      cancellationTerms: typeof terms.cancellationTerms === "string" ? terms.cancellationTerms : undefined,
      etaMinutes: typeof terms.etaMinutes === "number" ? terms.etaMinutes : null,
    },
    provider: {
      businessId: row.business_id,
      name: row.provider_name,
      baseLatitude: row.provider_latitude === null ? null : Number(row.provider_latitude),
      baseLongitude: row.provider_longitude === null ? null : Number(row.provider_longitude),
    },
    permissions: { isCustomer, isProvider },
    startCode: {
      hasActiveCode: activeCode,
      expiresAt: activeCode ? expiresAt : null,
      attempts: isProvider ? Number(row.start_code_attempts) : 0,
      issueCount: isCustomer ? Number(row.start_code_issue_count) : 0,
      maxIssues: 5,
      maxAttempts: 10,
    },
    liveLocation: location ? {
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      accuracyMeters: location.accuracy_meters === null ? null : Number(location.accuracy_meters),
      headingDegrees: location.heading_degrees === null ? null : Number(location.heading_degrees),
      speedMps: location.speed_mps === null ? null : Number(location.speed_mps),
      recordedAt: location.recorded_at,
      expiresAt: location.expires_at,
    } : null,
    events: events.map((event) => ({
      id: event.id,
      fromStatus: event.from_status,
      toStatus: event.to_status,
      eventType: event.event_type,
      note: event.note,
      createdAt: event.created_at,
    })),
  };
}

export async function updateProviderBookingStatusForUser(
  userId: string,
  input: { bookingId: string; status: "on_the_way" | "arrived" | "service_completed"; note?: string },
): Promise<{ bookingId: string; status: LiveBookingStatus }> {
  const sql = await getSql();
  return sql.transaction(async (tx) => {
    await requireProviderRole(tx, userId);
    const rows = await tx.query<{ status: LiveBookingStatus }>(
      "select b.status::text as status from public.bookings b " +
      "join public.provider_businesses pb on pb.id=b.business_id " +
      "where b.id=$1::uuid and pb.owner_user_id=$2 for update of b",
      [input.bookingId, userId],
    );
    const booking = rows[0];
    if (!booking) throw new Error("This booking is not assigned to a business owned by your account.");
    const allowed: Record<string, string[]> = {
      confirmed: ["on_the_way"],
      on_the_way: ["arrived"],
      service_started: ["service_completed"],
    };
    if (!allowed[booking.status]?.includes(input.status)) {
      throw new Error("This booking cannot move from " + booking.status + " to " + input.status + ".");
    }
    const note = input.note?.trim() || null;
    const updated = await tx.query<{ status: LiveBookingStatus }>(
      "update public.bookings set status=$2::fieldly_booking_status, " +
      "completed_at=case when $2='service_completed' then now() else completed_at end,updated_at=now() " +
      "where id=$1::uuid returning status::text as status",
      [input.bookingId, input.status],
    );
    await tx.query(
      "insert into public.booking_events (booking_id,actor_user_id,from_status,to_status,event_type,note) " +
      "values ($1::uuid,$2,$3::fieldly_booking_status,$4::fieldly_booking_status,$5,$6)",
      [input.bookingId, userId, booking.status, input.status, "provider_" + input.status, note],
    );
    return { bookingId: input.bookingId, status: updated[0].status };
  });
}

export type IssuedBookingStartCode = { bookingId: string; code: string; expiresAt: string };

export async function issueBookingStartCodeForCustomer(
  userId: string,
  bookingId: string,
): Promise<IssuedBookingStartCode> {
  const sql = await getSql();
  return sql.transaction(async (tx) => {
    await requireCustomerRole(tx, userId);
    const rows = await tx.query<{
      status: LiveBookingStatus;
      start_code_issued_at: string | null;
      start_code_issue_count: number;
      start_code_consumed_at: string | null;
    }>(
      "select status::text as status,start_code_issued_at::text as start_code_issued_at, " +
      "start_code_issue_count,start_code_consumed_at::text as start_code_consumed_at " +
      "from public.bookings where id=$1::uuid and customer_user_id=$2 for update",
      [bookingId, userId],
    );
    const booking = rows[0];
    if (!booking) throw new Error("This booking does not belong to your customer account.");
    if (booking.status !== "arrived" || booking.start_code_consumed_at) {
      throw new Error("The service-start code is available only after the provider marks arrival.");
    }
    if (Number(booking.start_code_issue_count) >= 5) {
      throw new Error("You have used all five code issue attempts. Contact support before work starts.");
    }
    if (booking.start_code_issued_at && Date.now() - new Date(booking.start_code_issued_at).getTime() < 60_000) {
      throw new Error("Please wait 60 seconds before requesting a new start code.");
    }
    const code = generateBookingStartCode();
    const hash = hashBookingStartCode(bookingId, code);
    const rowsUpdated = await tx.query<{ expires_at: string }>(
      "update public.bookings set start_code_hash=$2,start_code_expires_at=now()+interval '5 minutes', " +
      "start_code_issued_at=now(),start_code_issue_count=start_code_issue_count+1,start_code_attempts=0,updated_at=now() " +
      "where id=$1::uuid returning start_code_expires_at::text as expires_at",
      [bookingId, hash],
    );
    if (!rowsUpdated[0]) throw new Error("The service-start code could not be issued.");
    await tx.query(
      "insert into public.booking_events (booking_id,actor_user_id,from_status,to_status,event_type,note,metadata) " +
      "values ($1::uuid,$2,'arrived','arrived','start_code_issued','Customer generated a one-time service-start code',$3::jsonb)",
      [bookingId, userId, JSON.stringify({ issueNumber: Number(booking.start_code_issue_count) + 1 })],
    );
    return { bookingId, code, expiresAt: rowsUpdated[0].expires_at };
  });
}

export type VerifyBookingStartCodeResult = {
  bookingId: string;
  started: boolean;
  attemptsRemaining: number;
};

export async function verifyBookingStartCodeForProvider(
  userId: string,
  input: { bookingId: string; code: string },
): Promise<VerifyBookingStartCodeResult> {
  const sql = await getSql();
  return sql.transaction(async (tx) => {
    await requireProviderRole(tx, userId);
    const rows = await tx.query<{
      status: LiveBookingStatus;
      start_code_hash: string | null;
      start_code_expires_at: string | null;
      start_code_attempts: number;
    }>(
      "select b.status::text as status,b.start_code_hash,b.start_code_expires_at::text as start_code_expires_at,b.start_code_attempts " +
      "from public.bookings b join public.provider_businesses pb on pb.id=b.business_id " +
      "where b.id=$1::uuid and pb.owner_user_id=$2 for update of b",
      [input.bookingId, userId],
    );
    const booking = rows[0];
    if (!booking) throw new Error("This booking is not assigned to a business owned by your account.");
    if (booking.status !== "arrived") throw new Error("The customer code can be checked only after arrival.");
    if (!booking.start_code_hash || !booking.start_code_expires_at) {
      throw new Error("Ask the customer to issue a fresh service-start code.");
    }
    if (Date.now() > new Date(booking.start_code_expires_at).getTime()) {
      throw new Error("The service-start code has expired. Ask the customer to issue a new one.");
    }
    const attempts = Number(booking.start_code_attempts);
    if (attempts >= 10) throw new Error("Ten attempts have been used. Ask the customer to issue a new code.");
    const correct = verifyBookingStartCodeHash(input.bookingId, input.code, booking.start_code_hash);
    if (!correct) {
      const nextAttempts = attempts + 1;
      await tx.query(
        "update public.bookings set start_code_attempts=$2,updated_at=now() where id=$1::uuid",
        [input.bookingId, nextAttempts],
      );
      await tx.query(
        "insert into public.booking_events (booking_id,actor_user_id,from_status,to_status,event_type,note,metadata) " +
        "values ($1::uuid,$2,'arrived','arrived','start_code_failed','Provider submitted an incorrect service-start code',$3::jsonb)",
        [input.bookingId, userId, JSON.stringify({ attempts: nextAttempts })],
      );
      return { bookingId: input.bookingId, started: false, attemptsRemaining: Math.max(0, 10 - nextAttempts) };
    }

    await tx.query(
      "update public.bookings set status='service_started',start_code_hash=null,start_code_expires_at=null, " +
      "start_code_attempts=0,start_code_consumed_at=now(),updated_at=now() where id=$1::uuid",
      [input.bookingId],
    );
    await tx.query(
      "insert into public.booking_events (booking_id,actor_user_id,from_status,to_status,event_type,note) " +
      "values ($1::uuid,$2,'arrived','service_started','start_code_verified','Customer service-start code verified')",
      [input.bookingId, userId],
    );
    return { bookingId: input.bookingId, started: true, attemptsRemaining: 10 };
  });
}

export async function updateBookingByParticipant(
  userId: string,
  input: { bookingId: string; action: "cancelled" | "disputed"; reason: string },
): Promise<{ bookingId: string; status: "cancelled" | "disputed" }> {
  const sql = await getSql();
  return sql.transaction(async (tx) => {
    assertProductionIdentity(userId);
    const rows = await tx.query<{
      status: LiveBookingStatus;
      customer_user_id: string;
      business_owner_user_id: string;
    }>(
      "select b.status::text as status,b.customer_user_id,pb.owner_user_id as business_owner_user_id " +
      "from public.bookings b join public.provider_businesses pb on pb.id=b.business_id " +
      "where b.id=$1::uuid and (b.customer_user_id=$2 or pb.owner_user_id=$2) for update of b",
      [input.bookingId, userId],
    );
    const booking = rows[0];
    if (!booking) throw new Error("This booking is not available to your account.");
    const isCustomer = booking.customer_user_id === userId;
    const isProvider = booking.business_owner_user_id === userId;
    if (isCustomer) await requireCustomerRole(tx, userId);
    if (isProvider) await requireProviderRole(tx, userId);

    const reason = input.reason.trim();
    if (reason.length < 5) throw new Error("Enter a reason with at least five characters.");
    if (input.action === "cancelled" && !["confirmed", "on_the_way"].includes(booking.status)) {
      throw new Error("A booking can be cancelled only before provider arrival. Raise a dispute if there is an issue after arrival.");
    }
    if (input.action === "disputed" && !["arrived", "service_started", "service_completed"].includes(booking.status)) {
      throw new Error("A dispute can be raised after provider arrival or service commencement.");
    }
    const updated = await tx.query<{ status: "cancelled" | "disputed" }>(
      "update public.bookings set status=$2::fieldly_booking_status, " +
      "cancellation_reason=case when $2='cancelled' then $3 else cancellation_reason end, " +
      "dispute_reason=case when $2='disputed' then $3 else dispute_reason end,updated_at=now() " +
      "where id=$1::uuid returning status::text as status",
      [input.bookingId, input.action, reason],
    );
    await tx.query(
      "insert into public.booking_events (booking_id,actor_user_id,from_status,to_status,event_type,note) " +
      "values ($1::uuid,$2,$3::fieldly_booking_status,$4::fieldly_booking_status,$5,$6)",
      [input.bookingId, userId, booking.status, input.action, input.action, reason],
    );
    if (input.action === "cancelled") {
      await tx.query(
        "update public.job_requests set status='cancelled',updated_at=now() " +
        "where id=(select request_id from public.bookings where id=$1::uuid)",
        [input.bookingId],
      );
    }
    return { bookingId: input.bookingId, status: updated[0].status };
  });
}
