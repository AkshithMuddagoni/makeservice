import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("provider upload cleanup worker authenticates with a Vault-only cron token", async () => {
  const source = await readFile(
    join(root, "supabase/functions/fieldly-upload-cleanup/index.ts"),
    "utf8",
  );
  assert.match(source, /vault\.decrypted_secrets/);
  assert.match(source, /fieldly_provider_upload_cleanup_cron_secret/);
  assert.match(source, /x-fieldly-cleanup-secret/);
  assert.match(source, /constantTimeEquals/);
  assert.match(source, /SUPABASE_DB_URL/);
  assert.match(source, /SUPABASE_SECRET_KEYS/);
  assert.match(source, /method: "DELETE"/);
  assert.match(source, /storage\/v1\/object/);
  assert.match(source, /provider-documents\//);
  assert.match(source, /storage_cleanup_completed_at/);
  assert.match(source, /pg_try_advisory_xact_lock/);
  assert.match(source, /storage_cleanup_attempts < 10/);
  assert.match(source, /retryLimitReachedPaths/);
  assert.match(source, /apikey: secretKey/);
  assert.doesNotMatch(source, /authorization:.*secretKey/);
  assert.doesNotMatch(source, /delete\s+from\s+storage\.objects/i);
  assert.doesNotMatch(source, /console\.(log|error)\([^)]*(secret|storage_path|path)/i);
});

test("upload cleanup metadata migration is additive and retry-safe", async () => {
  const migration = await readFile(
    join(root, "migrations/fieldly/0021_provider_document_upload_cleanup.sql"),
    "utf8",
  );
  assert.match(migration, /ADD COLUMN IF NOT EXISTS storage_cleanup_completed_at/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS storage_cleanup_attempts/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS storage_cleanup_last_attempt_at/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS provider_document_upload_sessions_cleanup_idx/);
  assert.match(migration, /storage_cleanup_attempts BETWEEN 0 AND 10/);
  assert.match(migration, /storage_cleanup_attempts < 10/);
  assert.doesNotMatch(migration, /DELETE\s+FROM\s+storage\.objects/i);
});
