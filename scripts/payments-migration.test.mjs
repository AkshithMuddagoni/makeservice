import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const here = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(here, "..", "migrations", "0001_marketplace_payments.sql");

test("marketplace payment migration creates the payment and settlement tables", async () => {
  const sql = await readFile(migrationPath, "utf8");
  const db = new PGlite();
  try {
    await db.exec(sql);
    const result = await db.query("select table_name from information_schema.tables where table_schema = 'public' and table_name like 'fieldly_%' order by table_name");
    assert.deepEqual(result.rows.map((row) => row.table_name), [
      "fieldly_payment_attempts",
      "fieldly_payment_ledger_entries",
      "fieldly_payment_orders",
      "fieldly_payment_provider_accounts",
      "fieldly_payment_refunds",
      "fieldly_payment_webhook_events",
      "fieldly_vendor_settlements",
    ]);
  } finally {
    await db.close();
  }
});

test("payment migration enforces split arithmetic and idempotency", async () => {
  const sql = await readFile(migrationPath, "utf8");
  const db = new PGlite();
  try {
    await db.exec(sql);
    const insert = "insert into fieldly_payment_orders (booking_ref, quote_ref, customer_ref, provider_ref, stage, stage_label, quoted_total_paise, amount_paise, provider_share_paise, platform_share_paise, commission_bps, idempotency_key) values ($1, $2, $3, $4, 'BOOKING_ADVANCE', 'Test advance', 5000000, 1000000, $5, $6, 500, $7)";
    const args = ["booking_test_1", "quote_test_1", "customer_test_1", "provider_test_1"];
    await db.query(insert, [...args, 950000, 50000, "idempotency_test_1"]);
    await assert.rejects(db.query(insert, [...args, 940000, 50000, "idempotency_test_2"]), /fieldly_payment_order_split_balances/);
    await assert.rejects(db.query(insert, [...args, 950000, 50000, "idempotency_test_1"]), /fieldly_payment_orders_idempotency_key_key/);
  } finally {
    await db.close();
  }
});