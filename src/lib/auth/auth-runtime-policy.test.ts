import assert from "node:assert/strict";
import test from "node:test";
import { resolveAuthRuntimeMode } from "./auth-runtime-policy.ts";

test("enabled authentication always requires a verified session", () => {
  assert.equal(
    resolveAuthRuntimeMode({ gateIdentityEnabled: true, databaseConfigured: true }),
    "verified-session",
  );
  assert.equal(
    resolveAuthRuntimeMode({ gateIdentityEnabled: true, databaseConfigured: false }),
    "verified-session",
  );
});

test("auth disabled with a production database fails closed", () => {
  assert.throws(
    () => resolveAuthRuntimeMode({ gateIdentityEnabled: false, databaseConfigured: true }),
    /refusing to fall back to the shared dev user/,
  );
});

test("auth disabled without a database allows only the local development identity", () => {
  assert.equal(
    resolveAuthRuntimeMode({ gateIdentityEnabled: false, databaseConfigured: false }),
    "development-fallback",
  );
});
