/**
 * Admin handler — admin-only operational controls.
 *
 * Guards all handlers with a role check. Non-admin sockets are not registered.
 */
import type { Server } from "socket.io";
import type { SocketWithAuth } from "../authentication/auth.middleware.js";
import { SOCKET_EVENTS } from "./socket-events.js";
import { SOCKET_ROOMS } from "../rooms/room-names.js";
import { logger } from "../utils/logger.js";
import { emitError } from "../utils/socket.utils.js";
import { getPresenceManager } from "../presence/presence.manager.js";

export function registerAdminEvents(io: Server, socket: SocketWithAuth): void {
  const user = socket.user!;

  if (user.role !== "admin") return;

  const presenceManager = getPresenceManager();

  // ── Live metrics ──────────────────────────────────────────────────────────

  socket.on("admin:metrics", async () => {
    const onlineCount = presenceManager.getOnlineCount();
    const onlineUsers = presenceManager.getOnlineUsers();

    socket.emit(SOCKET_EVENTS.ADMIN.METRICS_UPDATE, {
      onlineUsers: onlineCount,
      onlineUserIds: onlineUsers,
      timestamp: new Date().toISOString(),
    });

    logger.debug({ adminId: user.userId }, "Admin metrics requested");
  });

  // ── Global broadcast ──────────────────────────────────────────────────────

  socket.on("admin:broadcast", (data: { event: string; payload: unknown }) => {
    if (!data?.event || data.payload === undefined) {
      emitError(socket, "event and payload are required", "INVALID_PAYLOAD");
      return;
    }

    const allowedEvents = [
      "system.maintenance",
      "system.announcement",
      SOCKET_EVENTS.ADMIN.SYSTEM_ALERT,
    ];

    if (!allowedEvents.includes(data.event)) {
      emitError(socket, "Event not permitted for broadcast", "FORBIDDEN");
      return;
    }

    const target = SOCKET_ROOMS.adminRoom();
    io.local.to(target).emit(data.event, {
      ...((data.payload as Record<string, unknown>) ?? {}),
      sentBy: user.userId,
      timestamp: new Date().toISOString(),
    });

    logger.info(
      { adminId: user.userId, event: data.event, target },
      "Admin broadcast sent",
    );
  });

  // ── Disconnect a user ─────────────────────────────────────────────────────

  socket.on("admin:kick_user", (data: { userId: string; reason?: string }) => {
    if (!data?.userId) {
      emitError(socket, "userId is required", "INVALID_PAYLOAD");
      return;
    }

    const userRoom = SOCKET_ROOMS.userRoom(data.userId);
    io.to(userRoom).emit(SOCKET_EVENTS.SYSTEM.DISCONNECTED, {
      reason: data.reason ?? "Disconnected by admin",
      timestamp: new Date().toISOString(),
    });

    io.in(userRoom).disconnectSockets(true);

    logger.warn(
      { adminId: user.userId, targetUserId: data.userId, reason: data.reason },
      "Admin disconnected user",
    );
  });
}

