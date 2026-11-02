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
  ];
  for (const path of migrations) {
    await db.exec(await readFile(join(root, path), "utf8"));
  }

  await db.query(
    'insert into public."user" (id) values ($1),($2),($3)',
    ["customer-1", "provider-1", "provider-2"],
  );
  await db.query(
    "insert into public.fieldly_user_roles (user_id, role) values ($1, 'customer')",
    ["customer-1"],
  );

  const businessIds = {
    approved: "10000000-0000-4000-8000-000000000001",
    pending: "10000000-0000-4000-8000-000000000002",
  };
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
  }

  return { db, businessIds };
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
