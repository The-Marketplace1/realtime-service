import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { env } from "../app/config/env.js";
import { getSocketIoAdapterClients } from "../app/config/redis.js";
import { logger } from "../utils/logger.js";
import {
  authenticateSocket,
  type SocketWithAuth,
} from "../authentication/auth.middleware.js";
import { handleConnection } from "../connections/connection.handler.js";
import { roomManager } from "../rooms/room.manager.js";
import { getPresenceManager } from "../presence/presence.manager.js";
import { isAllowedOrigin } from "../security/origin.policy.js";
import { attachSocketRateLimit } from "../rate-limits/socket-rate-limit.middleware.js";
import { incrementCounter } from "../telemetry/metrics.js";
import { createSocketIoOptions } from "../websocket/socketio-options.js";

export function createSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, createSocketIoOptions());

  io.use((socket, next) => {
    const authenticatedSocket = socket as SocketWithAuth;
    const origin = authenticatedSocket.handshake.headers.origin;
    if (origin && !isAllowedOrigin(origin)) {
      incrementCounter("connectionsRejected");
      next(new Error("FORBIDDEN: Origin is not allowed"));
      return;
    }

    authenticateSocket(authenticatedSocket, (err) => {
      if (err) {
        incrementCounter("connectionsRejected");
        next(err);
        return;
      }

      const user = authenticatedSocket.user;
      if (!user?.userId) {
        incrementCounter("connectionsRejected");
        next(new Error("UNAUTHORIZED: Missing authenticated user"));
        return;
      }

      void getPresenceManager()
        .setOnline(
          user.userId,
          user.role,
          authenticatedSocket.id,
          user.sessionId,
          user.deviceId,
          env.MAX_CONNECTIONS_PER_USER,
          user.clientType,
        )
        .then((accepted) => {
          if (!accepted) {
            incrementCounter("connectionsRejected");
            next(new Error("CONNECTION_LIMIT: Maximum connections reached"));
            return;
          }
          incrementCounter("connectionsAccepted");
          next();
        })
        .catch((presenceError: unknown) => {
          incrementCounter("connectionsRejected");
          logger.error(
            { err: presenceError, userId: user.userId },
            "Connection rejected because distributed presence could not be recorded",
          );
          next(new Error("SERVICE_UNAVAILABLE: Presence service unavailable"));
        });
    });
  });

  io.on("connection", (socket) => {
    const authenticatedSocket = socket as SocketWithAuth;
    attachSocketRateLimit(authenticatedSocket);
    handleConnection(io, authenticatedSocket);
  });

  roomManager.init(io);

  io.engine.on("connection_error", (err: { code: string; message: string }) => {
    logger.warn(
      { code: err.code, message: err.message },
      "Socket.io engine connection error",
    );
  });

  logger.info("Socket.io server initialized");

  return io;
}

export async function configureRedisAdapter(io: Server): Promise<void> {
  const { publisher, subscriber } = getSocketIoAdapterClients();
  await Promise.all([publisher.ping(), subscriber.ping()]);
  io.adapter(createAdapter(publisher, subscriber));
  logger.info("Socket.io Redis adapter initialized");
}

