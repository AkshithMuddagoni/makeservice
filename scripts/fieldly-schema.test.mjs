import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const independentFieldlyMigrations = [
  "migrations/fieldly/0001_fieldly_core.sql",
  "migrations/fieldly/0002_lock_down_browser_data_access.sql",
];
const migrationFiles = [
  ...independentFieldlyMigrations,
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
  "migrations/fieldly/0016_notifications_and_location_retention.sql",
  "migrations/fieldly/0017_index_bookings_dispute_resolved_by.sql",
  "migrations/fieldly/0018_booking_resource_assignment.sql",
  "migrations/fieldly/0019_index_booking_assigned_operator_asset_fk.sql",
];

test("Fieldly PostgreSQL migrations apply cleanly without Supabase Auth tables", async () => {
  const db = new PGlite();
  try {
    await db.waitReady;
    for (const file of independentFieldlyMigrations) {
      await db.exec(await readFile(join(root, file), "utf8"));
    }

    const tables = await db.query(
      "select tablename, rowsecurity from pg_tables where schemaname = 'public'",
    );
    const names = new Set(tables.rows.map((row) => row.tablename));
    for (const name of [
      "fieldly_profiles",
      "fieldly_user_roles",
      "provider_businesses",
      "provider_services",
      "provider_assets",
      "provider_documents",
      "job_requests",
      "provider_quotes",
      "bookings",
      "booking_messages",
      "booking_live_locations",
      "payment_intents",
      "payment_webhook_events",
      "provider_payout_profiles",
      "provider_reviews",
    ]) {
      assert.ok(names.has(name), `missing expected table: ${name}`);
    }

    for (const row of tables.rows.filter((row) => row.tablename.startsWith("fieldly_") ||
      row.tablename.startsWith("provider_") ||
      ["provider_document_upload_sessions", "job_requests", "job_request_targets", "bookings", "booking_events",
       "booking_messages", "booking_live_locations", "payment_intents",
       "payment_webhook_events"].includes(row.tablename))) {
      assert.equal(row.rowsecurity, true, `RLS is not enabled on ${row.tablename}`);
    }

    const authTables = await db.query(
      "select to_regclass('public.user') as user_table",
    );
    assert.equal(
      authTables.rows[0].user_table,
      null,
      "Fieldly migrations must not depend on the opt-in Better Auth schema being installed",
    );
  } finally {
    await db.close();
  }
});


test("full Better Auth and Fieldly migration order applies cleanly", async () => {
  const db = new PGlite();
  try {
    await db.waitReady;
    const orderedFiles = [
      "migrations/auth/0001_auth.sql",
      "migrations/auth/0002_phone_number_fields.sql",
      "migrations/auth/0003_rate_limit.sql",
      "migrations/auth/0004_lock_down_auth_data_access.sql",
      ...migrationFiles,
    ];
    for (const file of orderedFiles) {
      await db.exec(await readFile(join(root, file), "utf8"));
    }

    const authUser = await db.query(
      "select exists (select 1 from pg_class where relname = 'user' and relkind = 'r') as user_exists",
    );
    assert.equal(authUser.rows[0].user_exists, true);

    const authTables = await db.query(
      `select tablename, rowsecurity
       from pg_tables
       where schemaname = 'public'
         and tablename in ('user', 'session', 'account', 'verification')`,
    );
    assert.equal(authTables.rows.length, 4);
    for (const row of authTables.rows) {
      assert.equal(row.rowsecurity, true, `RLS is not enabled on Better Auth table ${row.tablename}`);
    }

    const phoneColumns = await db.query(
      "select column_name from information_schema.columns where table_name = 'user'",
    );
    const phoneColumnNames = new Set(phoneColumns.rows.map((row) => row.column_name));
    assert.ok(phoneColumnNames.has("phoneNumber"));
    assert.ok(phoneColumnNames.has("phoneNumberVerified"));

    const rateLimitTable = await db.query(
      "select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename = 'rateLimit'",
    );
    assert.equal(rateLimitTable.rows.length, 1);
    assert.equal(rateLimitTable.rows[0].rowsecurity, true);

    const appTables = await db.query(
      "select tablename, rowsecurity from pg_tables where schemaname = 'public'",
    );
    const names = new Set(appTables.rows.map((row) => row.tablename));
    for (const name of [
      "fieldly_profiles",
      "fieldly_user_roles",
      "provider_businesses",
      "provider_documents",
      "provider_document_upload_sessions",
      "provider_operator_assets",
      "job_requests",
      "provider_quotes",
      "bookings",
      "booking_live_locations",
      "payment_intents",
      "payment_webhook_events",
    ]) {
      assert.ok(names.has(name), `missing expected table after full migration: ${name}`);
    }
    for (const row of appTables.rows.filter((row) =>
      row.tablename.startsWith("fieldly_") ||
      row.tablename.startsWith("provider_") ||
      ["job_requests", "job_request_targets", "bookings", "booking_events",
       "booking_messages", "booking_live_locations", "payment_intents",
       "payment_webhook_events"].includes(row.tablename)
    )) {
      assert.equal(row.rowsecurity, true, `RLS is not enabled on ${row.tablename}`);
    }

    const operatorAssignmentConstraints = await db.query(
      `select conname
       from pg_constraint
       where conrelid = 'public.provider_operator_assets'::regclass`,
    );
    const bookingResourceConstraints = await db.query(
      `select conname
       from pg_constraint
       where conrelid = 'public.bookings'::regclass`,
    );
    const bookingResourceConstraintNames = new Set(
      bookingResourceConstraints.rows.map((row) => row.conname),
    );
    for (const name of [
      "bookings_assigned_resource_pair_check",
      "bookings_assigned_asset_business_fk",
      "bookings_assigned_operator_business_fk",
      "bookings_assigned_operator_asset_pair_fk",
    ]) {
      assert.ok(
        bookingResourceConstraintNames.has(name),
        `missing booking resource constraint: ${name}`,
      );
    }
    const operatorConstraintNames = new Set(operatorAssignmentConstraints.rows.map((row) => row.conname));
    assert.ok(operatorConstraintNames.has("provider_operator_assets_operator_business_fk"));
    assert.ok(operatorConstraintNames.has("provider_operator_assets_asset_business_fk"));
    const operatorAssignmentRls = await db.query(
      "select rowsecurity from pg_tables where schemaname = 'public' and tablename = 'provider_operator_assets'",
    );
    assert.equal(operatorAssignmentRls.rows[0]?.rowsecurity, true);

    const providerFks = await db.query(
      `select conname
       from pg_constraint
       where conrelid = 'public.provider_businesses'::regclass
         and confrelid = 'public.user'::regclass`,
    );
    assert.ok(
      providerFks.rows.some((row) => row.conname === "provider_businesses_owner_fk"),
      "provider businesses must be owned by an authenticated Better Auth user",
    );

    const requirementsTable = appTables.rows.find(
      (row) => row.tablename === "provider_document_requirements",
    );
    assert.equal(requirementsTable?.rowsecurity, true);

    const bookingCodeColumns = await db.query(
      "select column_name from information_schema.columns where table_schema='public' and table_name='bookings'",
    );
    const bookingCodeColumnNames = new Set(bookingCodeColumns.rows.map((row) => row.column_name));
    assert.ok(bookingCodeColumnNames.has("start_code_issued_at"));
    assert.ok(bookingCodeColumnNames.has("start_code_issue_count"));
    const bookingCodeLimit = await db.query(
      "select conname from pg_constraint where conrelid='public.bookings'::regclass and conname='bookings_start_code_issue_count_check'",
    );
    assert.equal(bookingCodeLimit.rows.length, 1);

    const expectedIndexes = [
      "booking_events_actor_user_id_idx",
      "booking_live_locations_business_id_idx",
      "booking_live_locations_operator_id_idx",
      "booking_messages_sender_user_id_idx",
      "bookings_assigned_asset_id_idx",
      "bookings_assigned_operator_id_idx",
      "bookings_provider_service_id_idx",
      "fieldly_admin_audit_admin_user_id_idx",
      "fieldly_user_roles_granted_by_idx",
      "job_request_targets_business_id_idx",
      "job_request_targets_provider_service_id_idx",
      "provider_asset_services_provider_service_id_idx",
      "provider_assets_reviewed_by_idx",
      "provider_businesses_reviewed_by_idx",
      "provider_documents_asset_id_idx",
      "provider_documents_operator_id_idx",
      "provider_documents_provider_service_id_idx",
      "provider_documents_reviewed_by_idx",
      "provider_operators_linked_user_id_idx",
      "provider_operator_assets_asset_idx",
      "provider_operator_assets_business_idx",
      "provider_operator_assets_operator_business_fk_idx",
      "provider_operator_assets_asset_business_fk_idx",
      "provider_document_upload_sessions_provider_service_id_idx",
      "provider_document_upload_sessions_asset_id_idx",
      "provider_document_upload_sessions_operator_id_idx",
      "provider_quotes_business_id_idx",
      "provider_services_reviewed_by_idx",
      "bookings_assigned_operator_asset_pair_idx",
    ];
    const indexes = await db.query(
      "select indexname from pg_indexes where schemaname = 'public'",
    );
    const indexNames = new Set(indexes.rows.map((row) => row.indexname));
    for (const name of expectedIndexes) {
      assert.ok(indexNames.has(name), `missing expected foreign-key index: ${name}`);
    }
    assert.ok(
      !indexNames.has("provider_businesses_owner_lookup_idx"),
      "the duplicate provider owner index must be removed",
    );
    const migrationLedger = await db.query(
      "select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename = '_migrations'",
    );
    assert.equal(migrationLedger.rows[0]?.rowsecurity, true);

    const rollbackDb = new PGlite();
    try {
      await rollbackDb.waitReady;
      await rollbackDb.exec("create table tx_probe (id integer primary key)");
      await assert.rejects(
        rollbackDb.transaction(async (tx) => {
          await tx.query("insert into tx_probe (id) values (1)");
          throw new Error("force rollback");
        }),
        /force rollback/,
      );
      const rowsAfterRollback = await rollbackDb.query("select id from tx_probe");
      assert.equal(rowsAfterRollback.rows.length, 0);
    } finally {
      await rollbackDb.close();
    }
  } finally {
    await db.close();
  }
});

test("private document bucket migration is safe without Supabase Storage installed", async () => {
  const db = new PGlite();
  try {
    await db.waitReady;
    await db.exec(await readFile(join(root, "migrations/fieldly/0008_create_private_documents_bucket.sql"), "utf8"));
    const bucketSchema = await db.query("select to_regclass('storage.buckets') as bucket_table");
    assert.equal(bucketSchema.rows[0].bucket_table, null);
  } finally {
    await db.close();
  }
});

test("private document bucket is non-public and restricted to reviewable file types", async () => {
  const db = new PGlite();
  try {
    await db.waitReady;
    await db.exec("create schema storage");
    await db.exec(`
      create table storage.buckets (
        id text primary key,
        name text not null,
        public boolean not null,
        file_size_limit bigint,
        allowed_mime_types text[]
      )
    `);
    await db.exec(await readFile(join(root, "migrations/fieldly/0008_create_private_documents_bucket.sql"), "utf8"));
    const rows = await db.query(
      "select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'fieldly-private'",
    );
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0].public, false);
    assert.equal(Number(rows.rows[0].file_size_limit), 10485760);
    assert.deepEqual(rows.rows[0].allowed_mime_types, [
      "application/pdf", "image/jpeg", "image/png", "image/webp",
    ]);
  } finally {
    await db.close();
  }
});
