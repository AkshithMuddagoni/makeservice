import { DEV_USER_ID } from "../auth/verify.server";
import { getSql } from "../db";

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
  documentRequirements: Array<{
    key: string;
    label: string;
    description: string;
    requiredForApproval: boolean;
    secureOnly: boolean;
    jobSpecific: boolean;
    selectedInPreview: boolean;
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
  if (input.assets.some((asset) =>
    asset.serviceIds.length < 1 || asset.serviceIds.some((serviceId) => !serviceIds.has(serviceId))
  )) {
    throw new Error("Every machine must be linked to one or more services in this application.");
  }
  if (input.profile.yearsExperience < 0 || input.profile.yearsExperience > 80) {
    throw new Error("Enter experience between 0 and 80 years.");
  }
  if (input.documentRequirements.length > 100) {
    throw new Error("Too many document checklist items were submitted.");
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

      for (const requirement of input.documentRequirements) {
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
            requirement.selectedInPreview,
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
        documentRequirementCount: input.documentRequirements.length,
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
