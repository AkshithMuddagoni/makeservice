import assert from "node:assert/strict";
import tls from "node:tls";
import { test } from "node:test";
import { postgresSslOptions } from "../src/lib/postgres-ssl.mjs";

const originalCa = process.env.DATABASE_SSL_CA_BASE64;

function restoreCa() {
  if (originalCa === undefined) delete process.env.DATABASE_SSL_CA_BASE64;
  else process.env.DATABASE_SSL_CA_BASE64 = originalCa;
}

test("requires an explicit CA for Supabase PostgreSQL hosts", () => {
  delete process.env.DATABASE_SSL_CA_BASE64;
  try {
    assert.throws(
      () => postgresSslOptions("postgres://postgres:pw@db.project.supabase.co:5432/postgres"),
      /DATABASE_SSL_CA_BASE64 is required/,
    );
    assert.throws(
      () => postgresSslOptions("postgres://postgres.project:pw@aws-0-region.pooler.supabase.com:5432/postgres"),
      /DATABASE_SSL_CA_BASE64 is required/,
    );
  } finally {
    restoreCa();
  }
});

test("adds the configured Supabase CA while retaining standard Node roots", () => {
  const pem = tls.rootCertificates[0];
  process.env.DATABASE_SSL_CA_BASE64 = Buffer.from(pem, "utf8").toString("base64");

  try {
    const options = postgresSslOptions(
      "postgres://postgres:pw@aws-0-region.pooler.supabase.com:5432/postgres",
    );
    assert.equal(options.rejectUnauthorized, true);
    assert.ok(Array.isArray(options.ca));
    assert.ok(options.ca.includes(pem));
    assert.ok(options.ca.some((cert) => Buffer.isBuffer(cert)));
  } finally {
    restoreCa();
  }
});

test("rejects malformed Base64 and non-certificate content", () => {
  process.env.DATABASE_SSL_CA_BASE64 = "not base64!";
  try {
    assert.throws(
      () => postgresSslOptions("postgres://db.example.com/postgres"),
      /not valid Base64/,
    );
  } finally {
    restoreCa();
  }

  process.env.DATABASE_SSL_CA_BASE64 = Buffer.from("not a PEM certificate").toString("base64");
  try {
    assert.throws(
      () => postgresSslOptions("postgres://db.example.com/postgres"),
      /must decode to a PEM certificate/,
    );
  } finally {
    restoreCa();
  }
});

test("keeps certificate verification enabled for other PostgreSQL providers", () => {
  delete process.env.DATABASE_SSL_CA_BASE64;
  try {
    assert.deepEqual(
      postgresSslOptions("postgres://user:pw@db.example.com:5432/app"),
      { rejectUnauthorized: true },
    );
  } finally {
    restoreCa();
  }
});
