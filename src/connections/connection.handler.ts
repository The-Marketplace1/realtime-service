/**
 * Socket connection handler — manages the lifecycle of a single socket connection.
 *
 * On connect: authenticate, join personal room, set presence, register event handlers.
 * On disconnect: remove only this socket's presence and subscriptions.
 */
import type { Server } from "socket.io";
import type { SocketWithAuth } from "../authentication/auth.middleware.js";
import { SOCKET_EVENTS } from "../socketio/socket-events.js";
import { SOCKET_ROOMS } from "../rooms/room-names.js";
import { logger } from "../utils/logger.js";
import { getPresenceManager } from "../presence/presence.manager.js";
import { getConnectionTracker } from "./session.manager.js";
import { routeAllEvents } from "../socketio/event.router.js";
import { broadcastToAdmins } from "../utils/socket.utils.js";
import { incrementCounter } from "../telemetry/metrics.js";

export function handleConnection(io: Server, socket: SocketWithAuth): void {
  const user = socket.user!;
  const presenceManager = getPresenceManager();
  const tracker = getConnectionTracker();

  logger.info(
    { socketId: socket.id, userId: user.userId, role: user.role },
    "Socket connected",
  );

  // Join personal room (always)
  socket.join(SOCKET_ROOMS.userRoom(user.userId));

  // Join professional room for availability updates
  if (user.role === "professional") {
    socket.join(SOCKET_ROOMS.professionalRoom(user.userId));
  }

  // Join admin room
  if (user.role === "admin") {
    socket.join(SOCKET_ROOMS.adminRoom());
    logger.debug({ userId: user.userId }, "Admin joined admin room");
  }

  // Acknowledge connection
  socket.emit(SOCKET_EVENTS.SYSTEM.CONNECTED, {
    userId: user.userId,
    role: user.role,
    sessionId: user.sessionId,
    timestamp: new Date().toISOString(),
    message: "Connected to Marketplace realtime service",
  });

  // Notify admins
  broadcastToAdmins(io, SOCKET_EVENTS.ADMIN.USER_CONNECTED, {
    userId: user.userId,
    role: user.role,
    timestamp: new Date().toISOString(),
    onlineCount: presenceManager.getOnlineCount(),
    connectionCount: presenceManager.getConnectionCount(),
  });

  // Register domain event handlers
  routeAllEvents(io, socket);

  // Heartbeat
  socket.on(SOCKET_EVENTS.SYSTEM.PING, () => {
    void presenceManager.updateLastSeen(user.userId, socket.id);
    socket.emit(SOCKET_EVENTS.SYSTEM.PONG, {
      timestamp: new Date().toISOString(),
    });
  });

  // Disconnect
  socket.on("disconnect", async (reason: string) => {
    incrementCounter("connectionsClosed");
    logger.info(
      { socketId: socket.id, userId: user.userId, reason },
      "Socket disconnected",
    );

    tracker.clearSocket(socket.id);

    const stillOnline = await presenceManager.setOffline(
      user.userId,
      socket.id,
    );
    if (!stillOnline) {
      broadcastToAdmins(io, SOCKET_EVENTS.ADMIN.USER_DISCONNECTED, {
        userId: user.userId,
        role: user.role,
        reason,
        timestamp: new Date().toISOString(),
        onlineCount: presenceManager.getOnlineCount(),
        connectionCount: presenceManager.getConnectionCount(),
      });
    }
  });

  socket.on("error", (err: Error) => {
    logger.error(
      { err, socketId: socket.id, userId: user.userId },
      "Socket error",
    );
  });
}

