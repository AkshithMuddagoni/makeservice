const BUCKET = "fieldly-private";
const REQUEST_TIMEOUT_MS = 20_000;

type StorageConfig = { origin: string; baseUrl: string; apiKey: string };

function storageConfig(): StorageConfig {
  const rawUrl = process.env.SUPABASE_URL?.trim();
  const apiKey =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!rawUrl || !apiKey) {
    throw new Error(
      "Private document storage is not configured. Set SUPABASE_URL and a server-only SUPABASE_SECRET_KEY.",
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("SUPABASE_URL is invalid.");
  }
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    throw new Error("Private document storage requires HTTPS.");
  }
  const origin = parsed.origin;
  return { origin, baseUrl: `${origin}/storage/v1`, apiKey };
}

function encodePath(path: string): string {
  return path.split("/").map((part) => encodeURIComponent(part)).join("/");
}

async function requestStorage(
  method: string,
  endpoint: string,
  body?: unknown,
): Promise<Response> {
  const config = storageConfig();
  const headers = new Headers({
    apikey: config.apiKey,
    Authorization: `Bearer ${config.apiKey}`,
  });
  let payload: BodyInit | undefined;
  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
    payload = JSON.stringify(body);
  }
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}${endpoint}`, {
      method,
      headers,
      body: payload,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: "error",
    });
  } catch {
    throw new Error("Private document storage could not be reached. Please retry.");
  }
  if (!response.ok) {
    // Storage errors can contain internal paths or request details; keep them
    // out of client-visible errors and application logs.
    throw new Error("Private document storage rejected the operation.");
  }
  return response;
}

export async function createPrivateDocumentUploadUrl(path: string): Promise<{ signedUrl: string; expiresInSeconds: number }> {
  const config = storageConfig();
  const endpoint = `/object/upload/sign/${BUCKET}/${encodePath(path)}`;
  const response = await requestStorage("POST", endpoint, { upsert: false });
  const result = await response.json() as { url?: string; token?: string };
  if (!result.token) throw new Error("Storage did not return an upload token.");
  const signedUrl = result.url
    ? new URL(`${config.baseUrl}${result.url}`, config.origin).toString()
    : new URL(`${endpoint}?token=${encodeURIComponent(result.token)}`, config.baseUrl).toString();
  const parsed = new URL(signedUrl);
  if (parsed.origin !== config.origin || !parsed.pathname.startsWith("/storage/v1/object/upload/sign/fieldly-private/")) {
    throw new Error("Storage returned an invalid signed upload URL.");
  }
  return { signedUrl: parsed.toString(), expiresInSeconds: 2 * 60 * 60 };
}

export async function downloadPrivateDocument(path: string): Promise<Uint8Array> {
  const response = await requestStorage("GET", `/object/authenticated/${BUCKET}/${encodePath(path)}`);
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > 10 * 1024 * 1024) {
    throw new Error("The uploaded document exceeds the storage size limit.");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 1 || bytes.length > 10 * 1024 * 1024) {
    throw new Error("The uploaded document size is invalid.");
  }
  return bytes;
}

export async function deletePrivateDocument(path: string): Promise<void> {
  await requestStorage("DELETE", `/object/${BUCKET}`, { prefixes: [path] });
}

export async function createPrivateDocumentDownloadUrl(path: string, expiresInSeconds = 300): Promise<string> {
  const config = storageConfig();
  const endpoint = `/object/sign/${BUCKET}/${encodePath(path)}`;
  const response = await requestStorage("POST", endpoint, { expiresIn: expiresInSeconds });
  const result = await response.json() as { signedURL?: string };
  if (!result.signedURL) throw new Error("Storage did not return a signed document URL.");
  const signedUrl = result.signedURL.startsWith("http")
    ? result.signedURL
    : `${config.baseUrl}${result.signedURL}`;
  const parsed = new URL(signedUrl);
  if (parsed.origin !== config.origin || !parsed.pathname.startsWith("/storage/v1/object/sign/fieldly-private/")) {
    throw new Error("Storage returned an invalid signed download URL.");
  }
  return parsed.toString();
}
