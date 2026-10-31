import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";

/**
 * Better Auth HTTP endpoint.
 *
 * The browser client calls same-origin /api/auth/* endpoints for session
 * lookup, phone OTP send/verify, and OAuth callbacks. Keep this as a thin
 * Request/Response bridge; authorization and validation belong in Better
 * Auth plugins and authenticated server functions.
 */
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => auth.handler(request),
      POST: async ({ request }: { request: Request }) => auth.handler(request),
    },
  },
});
