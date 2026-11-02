import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveDbSource } from "./db-config.ts";

test("uses PostgreSQL when a database URL is configured", () => {
  assert.equal(resolveDbSource("production", "postgresql://db.example/app"), "postgres");
  assert.equal(resolveDbSource("development", "postgresql://db.example/app"), "postgres");
});

test("allows PGlite only outside production when no database URL exists", () => {
  assert.equal(resolveDbSource("development", undefined), "pglite");
  assert.equal(resolveDbSource("test", undefined), "pglite");
  assert.equal(resolveDbSource(undefined, "  "), "pglite");
});

test("fails closed in production when DATABASE_URL is absent or blank", () => {
  assert.throws(
    () => resolveDbSource("production", undefined),
    /DATABASE_URL is required in production/,
  );
  assert.throws(
    () => resolveDbSource("production", "   "),
    /Refusing to start with ephemeral PGlite storage/,
  );
});
