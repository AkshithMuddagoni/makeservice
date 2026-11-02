import tls from "node:tls";

/**
 * Return strict PostgreSQL TLS options.
 *
 * Supabase's database certificate chain requires its project CA certificate
 * to be included explicitly for Node.js clients. Store the PEM certificate as
 * a single Base64 environment value so it can be configured in Render without
 * committing a certificate file into the repository.
 *
 * @param {string | undefined} databaseUrl
 * @returns {import("node:tls").ConnectionOptions}
 */
export function postgresSslOptions(databaseUrl = process.env.DATABASE_URL) {
  const caBase64 = process.env.DATABASE_SSL_CA_BASE64?.replace(/\s/g, "");

  let hostname = "";
  if (databaseUrl) {
    try {
      hostname = new URL(databaseUrl).hostname.toLowerCase();
    } catch {
      throw new Error("[database] DATABASE_URL is not a valid PostgreSQL URL.");
    }
  }

  const isSupabaseHost =
    hostname.endsWith(".supabase.co") ||
    hostname.endsWith(".pooler.supabase.com");

  if (!caBase64) {
    if (isSupabaseHost) {
      throw new Error(
        "[database] DATABASE_SSL_CA_BASE64 is required for verified Supabase PostgreSQL TLS connections.",
      );
    }
    return { rejectUnauthorized: true };
  }

  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(caBase64)) {
    throw new Error("[database] DATABASE_SSL_CA_BASE64 is not valid Base64.");
  }

  const ca = Buffer.from(caBase64, "base64");
  const pem = ca.toString("utf8");

  if (
    ca.length === 0 ||
    !pem.includes("-----BEGIN CERTIFICATE-----") ||
    !pem.includes("-----END CERTIFICATE-----")
  ) {
    throw new Error(
      "[database] DATABASE_SSL_CA_BASE64 must decode to a PEM certificate.",
    );
  }

  return {
    ca: [...tls.rootCertificates, ca],
    rejectUnauthorized: true,
  };
}
