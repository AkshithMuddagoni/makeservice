import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationFiles = [
  "migrations/fieldly/0001_fieldly_core.sql",
  "migrations/fieldly/0002_lock_down_browser_data_access.sql",
];

test("Fieldly PostgreSQL migrations apply cleanly without Supabase Auth tables", async () => {
  const db = new PGlite();
  try {
    await db.waitReady;
    for (const file of migrationFiles) {
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
