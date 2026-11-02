export type DbSource = "postgres" | "pglite";

/**
 * Resolve the storage backend without ever silently choosing ephemeral storage
 * in a production server. PGlite remains available for local development and
 * preview environments that explicitly run outside NODE_ENV=production.
 */
export function resolveDbSource(
  nodeEnv: string | undefined,
  connectionString: string | undefined,
): DbSource {
  const configured = typeof connectionString === "string" && connectionString.trim().length > 0;
  if (nodeEnv === "production" && !configured) {
    throw new Error(
      "DATABASE_URL is required in production. Refusing to start with ephemeral PGlite storage.",
    );
  }
  return configured ? "postgres" : "pglite";
}
