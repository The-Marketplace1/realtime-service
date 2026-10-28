import { createServer } from "node:http";
import app from "./app.js";
import { env } from "./config/env.js";
import { logger } from "../utils/logger.js";
import {
  configureRedisAdapter,
  createSocketServer,
} from "../socketio/index.js";
import { startEventSubscriber } from "../redis/event.subscriber.js";

async function main(): Promise<void> {
  const httpServer = createServer(app);

  const io = createSocketServer(httpServer);

  await configureRedisAdapter(io);
  await startEventSubscriber(io);

  httpServer.listen(env.PORT, () => {
    logger.info(
      {
        port: env.PORT,
        env: env.NODE_ENV,
        redisUrl: env.REDIS_URL.replace(/\/\/.*@/, "//***@"),
      },
      "Realtime service is running",
    );
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Shutdown signal received");

    const { getPresenceManager } =
      await import("../presence/presence.manager.js");
    const presenceManager = getPresenceManager();
    await Promise.all(
      [...io.sockets.sockets.values()]
        .map(
          (socket) =>
            socket as import("../authentication/auth.middleware.js").SocketWithAuth,
        )
        .filter((socket) => socket.user)
        .map((socket) =>
          presenceManager.setOffline(socket.user!.userId, socket.id),
        ),
    );
    await new Promise<void>((resolve) => io.close(() => resolve()));

    const { closeAllRedisConnections } = await import("./config/redis.js");
    await closeAllRedisConnections();
    logger.info("Socket.IO, HTTP, and Redis connections closed");
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "Uncaught exception — shutting down");
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    logger.fatal({ reason }, "Unhandled promise rejection — shutting down");
    process.exit(1);
  });
}

main().catch((err) => {
  console.error("Failed to start realtime service:", err);
  process.exit(1);
});

