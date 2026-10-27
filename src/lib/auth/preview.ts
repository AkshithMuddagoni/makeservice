/**
 * Optional live-preview OAuth client configuration (server-only).
 *
 * Credentials must be injected through a secure server environment; never
 * commit OAuth secrets to source control. The Fieldly production app should
 * use credentials from an authentication provider that the app owner controls.
 */
export const PREVIEW_CLIENT_ID = process.env.GROK_PREVIEW_CLIENT_ID?.trim() || "";
export const PREVIEW_CLIENT_SECRET = process.env.GROK_PREVIEW_CLIENT_SECRET?.trim() || "";

/** The optional shared auth broker issuer (OIDC discovery lives under it). */
export const GROK_ISSUER_DEFAULT = "https://auth.grok.me";

/** Preview callbacks accepted by the upstream preview broker. */
export const PREVIEW_ALLOWED_HOSTS = ["*.grok-sandbox.com"] as const;
