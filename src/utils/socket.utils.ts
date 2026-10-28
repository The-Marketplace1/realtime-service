import type { Server, Socket } from "socket.io";
import { logger } from "./logger.js";
import { incrementCounter } from "../telemetry/metrics.js";
import { SOCKET_EVENTS } from "../socketio/socket-events.js";
import { SOCKET_ROOMS } from "../rooms/room-names.js";

export function emitToRoom(
  io: Server,
  room: string,
  event: string,
  data: unknown,
): void {
  io.to(room).emit(event, data);
  logger.debug({ room, event }, "Emitted event to room");
}

export function emitToUser(
  io: Server,
  userId: string,
  event: string,
  data: unknown,
): void {
  const room = `user:${userId}`;
  io.to(room).emit(event, data);
  logger.debug({ userId, event }, "Emitted event to user");
}

export function emitError(
  socket: Socket,
  message: string,
  code?: string,
): void {
  incrementCounter("protocolErrors");
  socket.emit(SOCKET_EVENTS.SYSTEM.ERROR, {
    message,
    code: code ?? "UNKNOWN_ERROR",
    timestamp: new Date().toISOString(),
  });
}

export function joinRoom(socket: Socket, room: string): void {
  socket.join(room);
  logger.debug({ socketId: socket.id, room }, "Socket joined room");
}

export function leaveRoom(socket: Socket, room: string): void {
  socket.leave(room);
  logger.debug({ socketId: socket.id, room }, "Socket left room");
}

export function getRoomSize(io: Server, room: string): number {
  const roomData = io.sockets.adapter.rooms.get(room);
  return roomData ? roomData.size : 0;
}

export function broadcastToAdmins(
  io: Server,
  event: string,
  data: unknown,
): void {
  io.to(SOCKET_ROOMS.adminRoom()).emit(event, data);
  logger.debug({ event }, "Broadcasted event to admins");
}

