export const PROVIDER_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

export const PROVIDER_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type ProviderDocumentMimeType = typeof PROVIDER_DOCUMENT_MIME_TYPES[number];

const MIME_EXTENSIONS: Record<ProviderDocumentMimeType, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function providerDocumentExtension(mimeType: string): string | null {
  return Object.prototype.hasOwnProperty.call(MIME_EXTENSIONS, mimeType)
    ? MIME_EXTENSIONS[mimeType as ProviderDocumentMimeType]
    : null;
}

/** Remove path components/control characters; filenames are display metadata only. */
export function sanitizeProviderDocumentFilename(value: string): string {
  const basename = value.replace(/\\/g, "/").split("/").pop() ?? "";
  const safe = basename
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"|?*]/g, "_")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 160);
  return safe || "provider-document";
}

export function validateProviderDocumentMetadata(input: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): { fileName: string; mimeType: ProviderDocumentMimeType; sizeBytes: number; extension: string } {
  const extension = providerDocumentExtension(input.mimeType);
  if (!extension) {
    throw new Error("Only PDF, JPEG, PNG and WebP documents are accepted.");
  }
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 1 || input.sizeBytes > PROVIDER_DOCUMENT_MAX_BYTES) {
    throw new Error("Document size must be between 1 byte and 10 MiB.");
  }
  const fileName = sanitizeProviderDocumentFilename(input.fileName);
  if (!/\.(pdf|jpe?g|png|webp)$/i.test(fileName)) {
    throw new Error("The filename must use a PDF, JPG, PNG or WebP extension.");
  }
  return {
    fileName,
    mimeType: input.mimeType as ProviderDocumentMimeType,
    sizeBytes: input.sizeBytes,
    extension,
  };
}

/** Detect document formats from bytes, not the browser-provided MIME string. */
export function detectProviderDocumentMime(bytes: Uint8Array): ProviderDocumentMimeType | null {
  if (bytes.length >= 5 &&
      bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) {
    return "application/pdf";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return "image/png";
  }
  if (bytes.length >= 12 &&
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return "image/webp";
  }
  return null;
}

export function isValidProviderDocumentDate(value: string | null | undefined): boolean {
  if (value == null || value === "") return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
