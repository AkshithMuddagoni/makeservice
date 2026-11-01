import assert from "node:assert/strict";
import { test } from "node:test";
import {
  detectProviderDocumentMime,
  isValidProviderDocumentDate,
  sanitizeProviderDocumentFilename,
  validateProviderDocumentMetadata,
} from "./document-security.ts";

test("recognizes supported document signatures rather than trusting MIME labels", () => {
  assert.equal(detectProviderDocumentMime(new TextEncoder().encode("%PDF-1.7")), "application/pdf");
  assert.equal(detectProviderDocumentMime(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(detectProviderDocumentMime(Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])), "image/png");
  assert.equal(detectProviderDocumentMime(Uint8Array.from([0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x45,0x42,0x50])), "image/webp");
  assert.equal(detectProviderDocumentMime(new TextEncoder().encode("not a document")), null);
});

test("sanitizes user filenames and rejects paths, unsupported extensions and MIME types", () => {
  assert.equal(sanitizeProviderDocumentFilename("../../pan-card.pdf"), "pan-card.pdf");
  assert.equal(sanitizeProviderDocumentFilename("folder\\identity.png"), "identity.png");
  assert.equal(
    validateProviderDocumentMetadata({ fileName: "identity.pdf", mimeType: "application/pdf", sizeBytes: 120 })
      .extension,
    "pdf",
  );
  assert.throws(
    () => validateProviderDocumentMetadata({ fileName: "script.html", mimeType: "text/html", sizeBytes: 100 }),
    /Only PDF/,
  );
  assert.throws(
    () => validateProviderDocumentMetadata({ fileName: "identity.pdf", mimeType: "application/pdf", sizeBytes: 11 * 1024 * 1024 }),
    /10 MiB/,
  );
});

test("accepts only real ISO calendar dates", () => {
  assert.equal(isValidProviderDocumentDate("2026-11-01"), true);
  assert.equal(isValidProviderDocumentDate("2026-02-30"), false);
  assert.equal(isValidProviderDocumentDate("01-11-2026"), false);
  assert.equal(isValidProviderDocumentDate(null), true);
});
