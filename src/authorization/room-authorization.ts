import { env } from "../app/config/env.js";
import type { AuthenticatedSocket } from "../events/event.types.js";

export function canAccessRoom(
  user: AuthenticatedSocket,
  kind: "booking" | "conversation",
  resourceId: string,
): boolean {
  if (user.role === "admin") return true;

  const allowedIds =
    kind === "booking" ? user.bookingIds : user.conversationIds;
  if (allowedIds) return allowedIds.includes(resourceId);

  // Development can operate with ordinary auth tokens. Production requires
  // auth-service to include scoped room claims or a future authorization hook.
  return env.isDevelopment;
}

