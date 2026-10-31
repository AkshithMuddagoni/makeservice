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
      "provider_document_requirements",
      "provider_documents",
      "provider_document_requirements",
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
      ["job_requests", "job_request_targets", "bookings", "booking_events",
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
    }
  } finally {
    await db.close();
  }
});
