import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "../auth/middleware";

/**
 * These functions are safe to call from React. Database access is dynamically
 * imported inside the server handler, and the user id is supplied only by the
 * session-verifying auth middleware (never by a browser argument).
 */
export const getCurrentFieldlyAccount = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getFieldlyAccountForUser } = await import("./repository.server");
    return getFieldlyAccountForUser(context.userId);
  });

export const ensureCurrentFieldlyAccount = createServerFn({ method: "POST" })
  .validator(z.object({
    displayName: z.string().trim().min(1).max(100).nullable(),
  }).strict())
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { ensureFieldlyAccountForUser } = await import("./repository.server");
    return ensureFieldlyAccountForUser(context.userId, data.displayName);
  });
