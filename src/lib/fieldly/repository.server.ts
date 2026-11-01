import { DEV_USER_ID } from "../auth/verify.server";
import { getSql } from "../db";
import { getProviderDocumentRequirements, SERVICE_ONBOARDING } from "./provider-onboarding";

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
    const [services, assets, requirements, payouts] = await Promise.all([
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
    "select role::text as role from public.fieldly_user_roles where user_id = $1 and role = 'admin' limit 1",
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
    originalFilename: string;
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
      id: string; document_type: string; original_filename: string; mime_type: string;
      size_bytes: string; status: string; expires_on: string | null; created_at: string;
    }>(
      `select id, document_type, original_filename, mime_type, size_bytes::text as size_bytes,
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
      id: item.id, documentType: item.document_type, originalFilename: item.original_filename,
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
  await requireFieldlyAdmin(sql, input.adminUserId);
  assertAdminReviewReason(input.decision, input.note);

  return sql.transaction(async (tx) => {
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
