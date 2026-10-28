/**
 * Central event router — registers all domain-specific handlers for a connected socket.
 *
 * Domain coverage:
 *    Subscriptions — booking:subscribe/unsubscribe, conversation:subscribe/unsubscribe
 *    Presence      — presence:query, presence:list, status broadcasts
 *    Admin         — metrics, broadcast, kick (admin-only)
 */
import type { Server } from "socket.io";
import type { SocketWithAuth } from "../authentication/auth.middleware.js";
import { registerSubscriptionEvents } from "../subscriptions/subscription.handler.js";
import { registerPresenceEvents } from "../presence/presence.handler.js";
import { registerAdminEvents } from "./admin.handler.js";
import { logger } from "../utils/logger.js";

export function routeAllEvents(io: Server, socket: SocketWithAuth): void {
  const user = socket.user!;

  logger.debug(
    { socketId: socket.id, userId: user.userId, role: user.role },
    "Routing events for connected socket",
  );

  registerSubscriptionEvents(io, socket);
  registerPresenceEvents(io, socket);
  registerAdminEvents(io, socket);
}

