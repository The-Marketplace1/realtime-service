import type { Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { env } from "../app/config/env.js";
import { logger } from "../utils/logger.js";
import type { AuthenticatedSocket } from "../events/event.types.js";
import { incrementCounter } from "../telemetry/metrics.js";
import { isResourceId } from "../validation/resource-id.js";

export interface SocketWithAuth extends Socket {
  user?: AuthenticatedSocket;
}

interface JwtPayload {
  sub?: string;
  userId?: string;
  role?: string;
  sessionId?: string;
  deviceId?: string;
  clientType?: unknown;
  iat?: number;
  exp?: number;
  bookingIds?: unknown;
  conversationIds?: unknown;
}

export function authenticateSocket(
  socket: SocketWithAuth,
  next: (err?: Error) => void,
): void {
  try {
    const token =
      (socket.handshake.auth["token"] as string | undefined) ??
      (
        socket.handshake.headers["authorization"] as string | undefined
      )?.replace(/^Bearer\s+/i, "");

    if (!token) {
      incrementCounter("authenticationFailures");
      logger.warn(
        { socketId: socket.id },
        "Socket connection attempted without token",
      );
      return next(new Error("UNAUTHORIZED: Authentication token is required"));
    }

    const decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ["HS256", "RS256"],
    }) as JwtPayload;

    const userId = decoded.sub ?? decoded.userId;
    if (!isResourceId(userId)) {
      incrementCounter("authenticationFailures");
      return next(
        new Error("UNAUTHORIZED: Invalid token payload — missing userId"),
      );
    }
    if (typeof decoded.exp !== "number" || !Number.isFinite(decoded.exp)) {
      incrementCounter("authenticationFailures");
      return next(new Error("UNAUTHORIZED: Token expiration is required"));
    }

    const role = (decoded.role ?? "customer") as AuthenticatedSocket["role"];
    if (!["customer", "professional", "admin"].includes(role)) {
      incrementCounter("authenticationFailures");
      return next(new Error("UNAUTHORIZED: Invalid role in token"));
    }

    const defaultClientType: AuthenticatedSocket["clientType"] =
      role === "customer"
        ? "customer-app"
        : role === "professional"
          ? "professional-app"
          : "admin-dashboard";
    const allowedClientTypes = [
      "customer-app",
      "professional-app",
      "admin-dashboard",
      "unknown",
    ] as const;
    const clientType = allowedClientTypes.includes(
      decoded.clientType as (typeof allowedClientTypes)[number],
    )
      ? (decoded.clientType as AuthenticatedSocket["clientType"])
      : defaultClientType;

    socket.user = {
      userId,
      role,
      clientType,
      sessionId: decoded.sessionId ?? socket.id,
      deviceId: decoded.deviceId,
      bookingIds: Array.isArray(decoded.bookingIds)
        ? decoded.bookingIds.filter(isResourceId)
        : undefined,
      conversationIds: Array.isArray(decoded.conversationIds)
        ? decoded.conversationIds.filter(isResourceId)
        : undefined,
    };

    logger.debug(
      { socketId: socket.id, userId, role },
      "Socket authenticated successfully",
    );

    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      incrementCounter("authenticationFailures");
      logger.warn(
        { socketId: socket.id },
        "Socket connection with expired token",
      );
      return next(new Error("UNAUTHORIZED: Token has expired"));
    }
    if (err instanceof jwt.JsonWebTokenError) {
      incrementCounter("authenticationFailures");
      logger.warn(
        { socketId: socket.id },
        "Socket connection with invalid token",
      );
      return next(new Error("UNAUTHORIZED: Invalid token"));
    }
    logger.error(
      { err, socketId: socket.id },
      "Unexpected error during socket auth",
    );
    incrementCounter("authenticationFailures");
    return next(new Error("INTERNAL: Authentication failed"));
  }
}

