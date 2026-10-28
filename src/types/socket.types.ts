import type { Socket, Server } from "socket.io";
import type { AuthenticatedUser } from "./user.types.js";

export interface AuthenticatedSocket extends Socket {
  user?: AuthenticatedUser;
}

export interface SocketContext {
  io: Server;
  socket: AuthenticatedSocket;
}

export interface SocketError {
  message: string;
  code: string;
  timestamp: string;
}

export interface RoomJoinResult {
  room: string;
  bookingId: string;
  message: string;
}

