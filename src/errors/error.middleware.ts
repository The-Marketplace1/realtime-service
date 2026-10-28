import type { SocketWithAuth } from "../authentication/auth.middleware.js";
import { SOCKET_EVENTS } from "../socketio/socket-events.js";
import { logger } from "../utils/logger.js";

export function handleSocketError(
  socket: SocketWithAuth,
  err: unknown,
  context?: string,
): void {
  const isError = err instanceof Error;
  const message = isError ? err.message : "An unexpected error occurred";
  const userId = socket.user?.userId ?? "unknown";

  logger.error(
    { err, socketId: socket.id, userId, context },
    "Socket handler error",
  );

  socket.emit(SOCKET_EVENTS.SYSTEM.ERROR, {
    message,
    code: "HANDLER_ERROR",
    context,
    timestamp: new Date().toISOString(),
  });
}

export function withErrorHandler(
  socket: SocketWithAuth,
  handler: () => void | Promise<void>,
  context?: string,
): void {
  try {
    const result = handler();
    if (result instanceof Promise) {
      result.catch((err: unknown) => handleSocketError(socket, err, context));
    }
  } catch (err) {
    handleSocketError(socket, err, context);
  }
}

