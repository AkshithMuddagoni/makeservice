export type AuthRuntimeModeInput = {
  gateIdentityEnabled: boolean;
  databaseConfigured: boolean;
};

export type AuthRuntimeMode = "verified-session" | "development-fallback";

/**
 * Never allow the shared development identity to access a real database.
 * When auth is enabled, the caller must resolve a real verified session.
 */
export function resolveAuthRuntimeMode(input: AuthRuntimeModeInput): AuthRuntimeMode {
  if (input.gateIdentityEnabled) return "verified-session";
  if (input.databaseConfigured) {
    throw new Error(
      "Auth is disabled (VITE_AUTH_ENABLED=false) but DATABASE_URL is set — " +
        "refusing to fall back to the shared dev user against a real database.",
    );
  }
  return "development-fallback";
}
