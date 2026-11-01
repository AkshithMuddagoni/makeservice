import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isValidIndiaE164Phone,
  normalizeIndiaMobile,
  sendOtpWithMsg91,
  temporaryEmailForIndiaPhone,
} from "./msg91.server.ts";

const settings = {
  authKey: "test-auth-key",
  templateId: "approved-template-id",
};

function response(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("validates India E.164 phone numbers for Better Auth", () => {
  assert.equal(isValidIndiaE164Phone("+919876543210"), true);
  assert.equal(isValidIndiaE164Phone("+916123456789"), true);
  assert.equal(isValidIndiaE164Phone("9876543210"), false);
  assert.equal(isValidIndiaE164Phone("+911234567890"), false);
  assert.equal(isValidIndiaE164Phone("+14155552671"), false);
  assert.equal(isValidIndiaE164Phone("+91987654321"), false);
});

test("generates a stable placeholder email for verified Indian phone sign-up", () => {
  assert.equal(
    temporaryEmailForIndiaPhone("+919876543210"),
    "customer+919876543210@phone.fieldly.invalid",
  );
  assert.throws(
    () => temporaryEmailForIndiaPhone("9876543210"),
    /Indian E.164/,
  );
});

test("normalizes Indian national and E.164 mobile values for MSG91", () => {
  assert.equal(normalizeIndiaMobile("9876543210"), "919876543210");
  assert.equal(normalizeIndiaMobile("+919876543210"), "919876543210");
  assert.equal(normalizeIndiaMobile("91 98765 43210"), "919876543210");
});

test("rejects non-Indian or invalid mobile numbers", () => {
  assert.throws(() => normalizeIndiaMobile("1234567890"), /Indian mobile/);
  assert.throws(() => normalizeIndiaMobile("+14155552671"), /Indian mobile/);
  assert.throws(() => normalizeIndiaMobile("987654321"), /Indian mobile/);
});

test("sends Better Auth OTP in the configured MSG91 DLT template variable", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  await sendOtpWithMsg91({
    settings: { ...settings, otpVariable: "VAR2" },
    phoneNumber: "+919876543210",
    code: "123456",
    fetchImpl: async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return response(200, { type: "success", message: "Request accepted" });
    },
  });

  assert.equal(capturedUrl, "https://control.msg91.com/api/v5/flow");
  assert.equal(capturedInit?.method, "POST");
  const headers = new Headers(capturedInit?.headers);
  assert.equal(headers.get("authkey"), settings.authKey);
  assert.equal(headers.get("content-type"), "application/json");
  const body = JSON.parse(String(capturedInit?.body));
  assert.equal(body.template_id, settings.templateId);
  assert.equal(body.recipients[0].mobiles, "919876543210");
  assert.equal(body.recipients[0].VAR2, "123456");
});

test("uses VAR1 by default for a DLT template", async () => {
  let capturedBody = "";
  await sendOtpWithMsg91({
    settings,
    phoneNumber: "9876543210",
    code: "654321",
    fetchImpl: async (_url, init) => {
      capturedBody = String(init?.body);
      return response(200, { type: "success" });
    },
  });
  const body = JSON.parse(capturedBody);
  assert.equal(body.recipients[0].VAR1, "654321");
});

test("does not leak delivery details when MSG91 rejects the request", async () => {
  await assert.rejects(
    sendOtpWithMsg91({
      settings,
      phoneNumber: "9876543210",
      code: "123456",
      fetchImpl: async () => response(401, {
        type: "error",
        message: "invalid authkey",
      }),
    }),
    /could not accept/,
  );
});

test("rejects malformed template variables and OTPs", async () => {
  await assert.rejects(
    sendOtpWithMsg91({
      settings: { ...settings, otpVariable: "mobiles" },
      phoneNumber: "9876543210",
      code: "123456",
      fetchImpl: async () => response(200, { type: "success" }),
    }),
    /variable name/,
  );
  await assert.rejects(
    sendOtpWithMsg91({
      settings,
      phoneNumber: "9876543210",
      code: "12345",
      fetchImpl: async () => response(200, { type: "success" }),
    }),
    /six digits/,
  );
});
