import Redis from "ioredis";
import { env } from "./env.js";
import { logger } from "../../utils/logger.js";

function createRedisClient(name: string): Redis {
  const client = new Redis(env.REDIS_URL, {
    retryStrategy(times) {
      const delay = Math.min(times * 100, 3000);
      logger.warn(
        { name, attempt: times, delayMs: delay },
        "Redis reconnecting",
      );
      return delay;
    },
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false,
  });

  client.on("connect", () => {
    logger.info({ name }, "Redis client connected");
  });

  client.on("ready", () => {
    logger.info({ name }, "Redis client ready");
  });

  client.on("error", (err: Error) => {
    logger.error({ name, err }, "Redis client error");
  });

  client.on("close", () => {
    logger.warn({ name }, "Redis client connection closed");
  });

  return client;
}

let _publisher: Redis | null = null;
let _subscriber: Redis | null = null;
let _cache: Redis | null = null;
let _socketIoPublisher: Redis | null = null;
let _socketIoSubscriber: Redis | null = null;

export function getPublisher(): Redis {
  if (!_publisher) {
    _publisher = createRedisClient("publisher");
  }
  return _publisher;
}

export function getSubscriber(): Redis {
  if (!_subscriber) {
    _subscriber = createRedisClient("subscriber");
  }
  return _subscriber;
}

export function getCache(): Redis {
  if (!_cache) {
    _cache = createRedisClient("cache");
  }
  return _cache;
}

/** Dedicated pub/sub clients for the Socket.IO cross-node adapter. */
export function getSocketIoAdapterClients(): {
  publisher: Redis;
  subscriber: Redis;
} {
  if (!_socketIoPublisher) {
    _socketIoPublisher = createRedisClient("socketio-adapter-publisher");
  }
  if (!_socketIoSubscriber) {
    _socketIoSubscriber = createRedisClient("socketio-adapter-subscriber");
  }
  return { publisher: _socketIoPublisher, subscriber: _socketIoSubscriber };
}

export async function closeAllRedisConnections(): Promise<void> {
  const clients = [
    _publisher,
    _subscriber,
    _cache,
    _socketIoPublisher,
    _socketIoSubscriber,
  ].filter(Boolean) as Redis[];
  await Promise.all(clients.map((client) => client.quit()));
  _publisher = null;
  _subscriber = null;
  _cache = null;
  _socketIoPublisher = null;
  _socketIoSubscriber = null;
  logger.info("All Redis connections closed");
}

