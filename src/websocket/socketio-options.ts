import type { ServerOptions } from "socket.io";
import { env } from "../app/config/env.js";

export function createSocketIoOptions(): Partial<ServerOptions> {
  return {
    path: "/realtime/socket.io",
    cors: {
      origin: env.CORS_ORIGINS,
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
    pingTimeout: 30_000,
    pingInterval: 25_000,
    maxHttpBufferSize: 1_000_000,
  };
}

