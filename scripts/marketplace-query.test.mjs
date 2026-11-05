import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function createMarketplaceFixture() {
  const db = new PGlite();
  await db.waitReady;
  await db.exec('create table public."user" (id text primary key)');
  const migrations = [
    "migrations/fieldly/0001_fieldly_core.sql",
    "migrations/fieldly/0002_lock_down_browser_data_access.sql",
    "migrations/fieldly/0005_provider_onboarding.sql",
    "migrations/fieldly/0006_lock_down_migration_ledger.sql",
    "migrations/fieldly/0007_index_foreign_keys.sql",
    "migrations/fieldly/0008_create_private_documents_bucket.sql",
    "migrations/fieldly/0009_booking_start_code_issuance.sql",
    "migrations/fieldly/0010_booking_start_code_issue_limit.sql",
    "migrations/fieldly/0011_provider_document_upload_sessions.sql",
    "migrations/fieldly/0012_provider_operator_roster.sql",
    "migrations/fieldly/0013_index_provider_document_upload_session_foreign_keys.sql",
    "migrations/fieldly/0014_index_provider_operator_asset_foreign_keys.sql",
    "migrations/fieldly/0015_booking_dispute_resolution.sql",
    "migrations/fieldly/0017_index_bookings_dispute_resolved_by.sql",
    "migrations/fieldly/0018_booking_resource_assignment.sql",
    "migrations/fieldly/0019_provider_operator_account_linking.sql",
  ];
  for (const path of migrations) {
    await db.exec(await readFile(join(root, path), "utf8"));
  }

  await db.query(
    'insert into public."user" (id) values ($1),($2),($3),($4)',
    ["customer-1", "provider-1", "provider-2", "admin-1"],
  );
  await db.query(
    "insert into public.fieldly_user_roles (user_id, role) values ($1, 'customer')",
    ["customer-1"],
  );

  const businessIds = {
    approved: "10000000-0000-4000-8000-000000000001",
    pending: "10000000-0000-4000-8000-000000000002",
  };
  const resourceIds = {};
  for (const [key, id, owner, status] of [
    ["approved", businessIds.approved, "provider-1", "approved"],
    ["pending", businessIds.pending, "provider-2", "under_review"],
  ]) {
    await db.query(
      "insert into public.provider_businesses (id, owner_user_id, legal_name, trading_name, business_type, address_line, district, city, state, pincode, latitude, longitude, verification_status) " +
      "values ($1::uuid,$2,$3,$4,'individual','test address','Hyderabad','Hyderabad','Telangana','500001',17.39,78.49,$5::fieldly_review_status)",
      [id, owner, key + " legal", key + " provider", status],
    );
    const service = await db.query(
      "insert into public.provider_services (business_id, service_id, verification_status, is_listed, is_available) " +
      "values ($1::uuid,'borewell','approved',true,true) returning id::text as id",
      [id],
    );
    const asset = await db.query(
      "insert into public.provider_assets (business_id, asset_type, make, model, ownership, road_use, verification_status, is_available) " +
      "values ($1::uuid,'Borewell rig','OEM','Model X','owned','trailer_moved','approved',true) returning id::text as id",
      [id],
    );
    await db.query(
      "insert into public.provider_asset_services (asset_id, provider_service_id) values ($1::uuid,$2::uuid)",
      [asset.rows[0].id, service.rows[0].id],
    );
    const operator = await db.query(
      "insert into public.provider_operators (business_id, full_name, role_title, experience_years, verification_status) " +
      "values ($1::uuid,'Test operator','Machine operator',5,'approved') returning id::text as id",
      [id],
    );
    await db.query(
      "insert into public.provider_operator_assets (business_id, operator_id, asset_id) values ($1::uuid,$2::uuid,$3::uuid)",
      [id, operator.rows[0].id, asset.rows[0].id],
    );
    await db.query(
      "insert into public.provider_presence (business_id, is_online, last_seen_at) values ($1::uuid,true,now())",
      [id],
    );
    resourceIds[key] = {
      businessId: id,
      serviceId: service.rows[0].id,
      assetId: asset.rows[0].id,
      operatorId: operator.rows[0].id,
    };
  }

  return { db, businessIds, resourceIds };
}

async function createBookingReservation(db, resource, bookingStatus, disputeStatus = null) {
  const request = await db.query(
    "insert into public.job_requests (customer_user_id, service_id, site_label, site_address, city, state, latitude, longitude, details_consent_at) " +
    "values ('customer-1','borewell','Test site','Test address','Hyderabad','Telangana',17.39,78.49,now()) " +
    "returning id::text as id",
  );
  const quote = await db.query(
    "insert into public.provider_quotes (request_id, business_id, amount_paise, note) " +
    "values ($1::uuid,$2::uuid,100000,'Reserved resource fixture quote') returning id::text as id",
    [request.rows[0].id, resource.businessId],
  );
  await db.query(
    "insert into public.bookings (" +
    "public_reference,request_id,quote_id,customer_user_id,business_id,provider_service_id," +
    "assigned_asset_id,assigned_operator_id,service_id,status,amount_paise,site_snapshot," +
    "dispute_status,dispute_resolved_by,dispute_resolved_at" +
    ") values (" +
    "'MS-TEST-RESOURCE-1',$1::uuid,$2::uuid,'customer-1',$3::uuid,$4::uuid," +
    "$5::uuid,$6::uuid,'borewell',$7::fieldly_booking_status,100000,'{}'::jsonb," +
    "$8::public.fieldly_dispute_status,$9,case when $8::public.fieldly_dispute_status in " +
    "('resolved_customer','resolved_provider','closed_no_action') then now() else null end" +
    ")",
    [
      request.rows[0].id,
      quote.rows[0].id,
      resource.businessId,
      resource.serviceId,
      resource.assetId,
      resource.operatorId,
      bookingStatus,
      disputeStatus,
      disputeStatus && ["resolved_customer", "resolved_provider", "closed_no_action"].includes(disputeStatus)
        ? "admin-1"
        : null,
    ],
  );
}

test("provider discovery returns only approved, online providers with approved available equipment", async () => {
  const { db, businessIds } = await createMarketplaceFixture();
  try {
    const source = await readFile(join(root, "src/lib/fieldly/marketplace-queries.ts"), "utf8");
    const match = source.match(/export const PROVIDER_DISCOVERY_SQL = `([\s\S]*?)`;?/);
    assert.ok(match, "provider discovery SQL export should exist");
    const rows = await db.query(match[1], ["borewell", 17.385, 78.4867, 45, 25]);
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0].business_id, businessIds.approved);
    assert.equal(rows.rows[0].name, "approved provider");
    assert.match(rows.rows[0].equipment, /Borewell rig OEM Model X/);
    assert.ok(Number(rows.rows[0].distance_km) >= 0);
    assert.deepEqual(rows.rows[0].languages, []);
  } finally {
    await db.close();
  }
});

test("provider discovery hides machine/operator pairs reserved by confirmed bookings", async () => {
  const { db, resourceIds } = await createMarketplaceFixture();
  try {
    await createBookingReservation(db, resourceIds.approved, "confirmed");
    const source = await readFile(join(root, "src/lib/fieldly/marketplace-queries.ts"), "utf8");
    const match = source.match(/export const PROVIDER_DISCOVERY_SQL = `([\s\S]*?)`;?/);
    assert.ok(match);
    const rows = await db.query(match[1], ["borewell", 17.385, 78.4867, 45, 25]);
    assert.equal(rows.rows.length, 0);
  } finally {
    await db.close();
  }
});

test("provider discovery holds resources during an open dispute", async () => {
  const { db, resourceIds } = await createMarketplaceFixture();
  try {
    await createBookingReservation(db, resourceIds.approved, "disputed", "under_review");
    const source = await readFile(join(root, "src/lib/fieldly/marketplace-queries.ts"), "utf8");
    const match = source.match(/export const PROVIDER_DISCOVERY_SQL = `([\s\S]*?)`;?/);
    assert.ok(match);
    const rows = await db.query(match[1], ["borewell", 17.385, 78.4867, 45, 25]);
    assert.equal(rows.rows.length, 0);
  } finally {
    await db.close();
  }
});

test("provider discovery releases resources after a dispute is terminally resolved", async () => {
  const { db, resourceIds, businessIds } = await createMarketplaceFixture();
  try {
    await createBookingReservation(db, resourceIds.approved, "disputed", "resolved_customer");
    const source = await readFile(join(root, "src/lib/fieldly/marketplace-queries.ts"), "utf8");
    const match = source.match(/export const PROVIDER_DISCOVERY_SQL = `([\s\S]*?)`;?/);
    assert.ok(match);
    const rows = await db.query(match[1], ["borewell", 17.385, 78.4867, 45, 25]);
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0].business_id, businessIds.approved);
  } finally {
    await db.close();
  }
});

test("provider discovery returns no listings when providers are outside the service radius", async () => {
  const { db } = await createMarketplaceFixture();
  try {
    const source = await readFile(join(root, "src/lib/fieldly/marketplace-queries.ts"), "utf8");
    const match = source.match(/export const PROVIDER_DISCOVERY_SQL = `([\s\S]*?)`;?/);
    assert.ok(match);
    const rows = await db.query(match[1], ["borewell", 28.6139, 77.209, 45, 25]);
    assert.equal(rows.rows.length, 0);
  } finally {
    await db.close();
  }
});


test("operator invitations allow only one outstanding invitation per operator", async () => {
  const { db, resourceIds } = await createMarketplaceFixture();
  const operator = resourceIds.approved;
  const values = [
    operator.businessId,
    operator.operatorId,
    "+919876543210",
    "a".repeat(64),
    "provider-1",
  ];
  try {
    await db.query(
      "insert into public.provider_operator_invites (business_id,operator_id,invited_phone_e164,token_hash,created_by_user_id,expires_at) " +
      "values ($1::uuid,$2::uuid,$3,$4,$5,now()+interval '72 hours')",
      values,
    );
    await assert.rejects(
      db.query(
        "insert into public.provider_operator_invites (business_id,operator_id,invited_phone_e164,token_hash,created_by_user_id,expires_at) " +
        "values ($1::uuid,$2::uuid,$3,$4,$5,now()+interval '72 hours')",
        [operator.businessId, operator.operatorId, "+919876543210", "b".repeat(64), "provider-1"],
      ),
      (error) => error.code === "23505",
    );

    await db.query(
      "update public.provider_operator_invites set revoked_at = now() where operator_id = $1::uuid",
      [operator.operatorId],
    );
    await db.query(
      "insert into public.provider_operator_invites (business_id,operator_id,invited_phone_e164,token_hash,created_by_user_id,expires_at) " +
      "values ($1::uuid,$2::uuid,$3,$4,$5,now()+interval '72 hours')",
      [operator.businessId, operator.operatorId, "+919876543210", "c".repeat(64), "provider-1"],
    );
    const rows = await db.query(
      "select count(*)::int as total, count(*) filter (where revoked_at is null)::int as open " +
      "from public.provider_operator_invites where operator_id = $1::uuid",
      [operator.operatorId],
    );
    assert.equal(rows.rows[0].total, 2);
    assert.equal(rows.rows[0].open, 1);
  } finally {
    await db.close();
  }
});

test("operator invitations enforce verified acceptance metadata, phone format and user references", async () => {
  const { db, resourceIds } = await createMarketplaceFixture();
  const operator = resourceIds.approved;
  try {
    await assert.rejects(
      db.query(
        "insert into public.provider_operator_invites (business_id,operator_id,invited_phone_e164,token_hash,created_by_user_id,expires_at) " +
        "values ($1::uuid,$2::uuid,$3,$4,$5,now()+interval '72 hours')",
        [operator.businessId, operator.operatorId, "1234567890", "d".repeat(64), "provider-1"],
      ),
      (error) => error.code === "23514",
    );

    await assert.rejects(
      db.query(
        "insert into public.provider_operator_invites (business_id,operator_id,invited_phone_e164,token_hash,created_by_user_id,expires_at,accepted_at) " +
        "values ($1::uuid,$2::uuid,'+919876543210',$3,'provider-1',now()+interval '72 hours',now())",
        [operator.businessId, operator.operatorId, "e".repeat(64)],
      ),
      (error) => error.code === "23514",
    );

    await db.query(
      "update public.provider_operators set phone_e164 = '+919876543210' where id = $1::uuid",
      [operator.operatorId],
    );
    await assert.rejects(
      db.query(
        "update public.provider_operators set linked_user_id = 'missing-user' where id = $1::uuid",
        [operator.operatorId],
      ),
      (error) => error.code === "23503",
    );
    await db.query(
      "update public.provider_operators set linked_user_id = 'customer-1' where id = $1::uuid",
      [operator.operatorId],
    );
    const row = await db.query(
      "select linked_user_id from public.provider_operators where id = $1::uuid",
      [operator.operatorId],
    );
    assert.equal(row.rows[0].linked_user_id, "customer-1");
  } finally {
    await db.close();
  }
});
