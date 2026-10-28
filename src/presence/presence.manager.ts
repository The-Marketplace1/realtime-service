import { getCache } from "../app/config/redis.js";
import { env } from "../app/config/env.js";
import { CONSTANTS } from "../app/config/constants.js";
import { logger } from "../utils/logger.js";
import type { PresenceState } from "../events/event.types.js";
import {
  buildPresenceState,
  type PresenceConnection,
} from "./presence.state.js";

const PRESENCE_TTL_SECONDS = CONSTANTS.PRESENCE.TTL_SECONDS;
const PRESENCE_KEY_PREFIX = "presence:user:";
const REGISTER_CONNECTION_SCRIPT = `
  local key = KEYS[1]
  local socketId = ARGV[1]
  local connection = ARGV[2]
  local maxConnections = tonumber(ARGV[3])
  local ttl = tonumber(ARGV[4])
  local cutoff = ARGV[5]
  local fields = redis.call("HGETALL", key)
  for i = 1, #fields, 2 do
    local ok, saved = pcall(cjson.decode, fields[i + 1])
    if not ok or type(saved) ~= "table" or type(saved.lastSeen) ~= "string" or saved.lastSeen <= cutoff then
      redis.call("HDEL", key, fields[i])
    end
  end
  if redis.call("HEXISTS", key, socketId) == 1 then
    redis.call("HSET", key, socketId, connection)
    redis.call("EXPIRE", key, ttl)
    return 1
  end
  if redis.call("HLEN", key) >= maxConnections then
    return 0
  end
  redis.call("HSET", key, socketId, connection)
  redis.call("EXPIRE", key, ttl)
  return 1
`;
const PRUNE_CONNECTIONS_SCRIPT = `
  local key = KEYS[1]
  local cutoff = ARGV[1]
  local fields = redis.call("HGETALL", key)
  for i = 1, #fields, 2 do
    local ok, saved = pcall(cjson.decode, fields[i + 1])
    if not ok or type(saved) ~= "table" or type(saved.lastSeen) ~= "string" or saved.lastSeen <= cutoff then
      redis.call("HDEL", key, fields[i])
    end
  end
  local remaining = redis.call("HLEN", key)
  if remaining == 0 then
    redis.call("DEL", key)
  end
  return remaining
`;
const REMOVE_CONNECTION_SCRIPT = `
  local key = KEYS[1]
  redis.call("HDEL", key, ARGV[1])
  local remaining = redis.call("HLEN", key)
  if remaining == 0 then
    redis.call("DEL", key)
  else
    redis.call("EXPIRE", key, tonumber(ARGV[2]))
  end
  return remaining
`;

function connectionKey(userId: string): string {
  return `${PRESENCE_KEY_PREFIX}${userId}:connections`;
}

function parseConnection(raw: string): PresenceConnection | null {
  try {
    const parsed = JSON.parse(raw) as Partial<PresenceConnection>;
    if (
      typeof parsed.userId !== "string" ||
      typeof parsed.role !== "string" ||
      typeof parsed.socketId !== "string" ||
      typeof parsed.sessionId !== "string" ||
      typeof parsed.deviceId !== "string" ||
      typeof parsed.connectedAt !== "string" ||
      typeof parsed.lastSeen !== "string"
    ) {
      return null;
    }
    return parsed as PresenceConnection;
  } catch {
    return null;
  }
}

export class PresenceManager {
  private localPresence = new Map<string, Map<string, PresenceConnection>>();

  private pruneLocalPresence(): void {
    const cutoff = Date.now() - PRESENCE_TTL_SECONDS * 1000;
    for (const [userId, connections] of this.localPresence) {
      for (const [socketId, connection] of connections) {
        if (Date.parse(connection.lastSeen) <= cutoff)
          connections.delete(socketId);
      }
      if (connections.size === 0) this.localPresence.delete(userId);
    }
  }

  private localConnections(userId: string): Map<string, PresenceConnection> {
    let connections = this.localPresence.get(userId);
    if (!connections) {
      connections = new Map();
      this.localPresence.set(userId, connections);
    }
    return connections;
  }

  async setOnline(
    userId: string,
    role: string,
    socketId: string,
    sessionId = socketId,
    deviceId = sessionId,
    maxConnections = env.MAX_CONNECTIONS_PER_USER,
    clientType = "unknown",
  ): Promise<boolean> {
    const now = new Date().toISOString();
    const connection: PresenceConnection = {
      userId,
      role,
      socketId,
      sessionId,
      deviceId,
      status: "connected",
      clientType,
      environment: env.NODE_ENV,
      connectedAt: now,
      lastSeen: now,
    };

    try {
      const cache = getCache();
      const result = await cache.eval(
        REGISTER_CONNECTION_SCRIPT,
        1,
        connectionKey(userId),
        socketId,
        JSON.stringify(connection),
        String(maxConnections),
        String(PRESENCE_TTL_SECONDS),
        new Date(Date.now() - PRESENCE_TTL_SECONDS * 1000).toISOString(),
      );
      if (Number(result) !== 1) return false;
    } catch (err) {
      if (env.isProduction) {
        logger.error(
          { err, userId },
          "Failed to reserve distributed connection slot",
        );
        throw err;
      }

      const local = this.localConnections(userId);
      if (!local.has(socketId) && local.size >= maxConnections) return false;
      logger.warn(
        { err, userId },
        "Failed to persist presence to Redis — using local only",
      );
    }

    this.localConnections(userId).set(socketId, connection);
    logger.debug(
      { userId, role, socketId, sessionId, deviceId },
      "Socket marked online",
    );
    return true;
  }

  async setOffline(userId: string, socketId: string): Promise<boolean> {
    const connections = this.localPresence.get(userId);
    connections?.delete(socketId);
    if (connections && connections.size === 0) {
      this.localPresence.delete(userId);
    }

    try {
      const cache = getCache();
      await cache.eval(
        REMOVE_CONNECTION_SCRIPT,
        1,
        connectionKey(userId),
        socketId,
        String(PRESENCE_TTL_SECONDS),
      );
    } catch (err) {
      logger.warn(
        { err, userId, socketId },
        "Failed to remove socket presence from Redis",
      );
    }

    const stillOnline = await this.isOnlineLocally(userId);
    logger.debug({ userId, socketId, stillOnline }, "Socket marked offline");
    return stillOnline;
  }

  async getConnectionCountForUser(userId: string): Promise<number> {
    try {
      return Number(
        await getCache().eval(
          PRUNE_CONNECTIONS_SCRIPT,
          1,
          connectionKey(userId),
          new Date(Date.now() - PRESENCE_TTL_SECONDS * 1000).toISOString(),
        ),
      );
    } catch (err) {
      if (env.isProduction) throw err;
      return this.localPresence.get(userId)?.size ?? 0;
    }
  }

  async isOnline(userId: string): Promise<boolean> {
    return (await this.getPresence(userId)) !== null;
  }

  private async isOnlineLocally(userId: string): Promise<boolean> {
    this.pruneLocalPresence();
    const local = this.localPresence.get(userId);
    if (local && local.size > 0) return true;
    try {
      const cache = getCache();
      return (await cache.hlen(connectionKey(userId))) > 0;
    } catch {
      return false;
    }
  }

  async getPresence(userId: string): Promise<PresenceState | null> {
    try {
      const cache = getCache();
      await cache.eval(
        PRUNE_CONNECTIONS_SCRIPT,
        1,
        connectionKey(userId),
        new Date(Date.now() - PRESENCE_TTL_SECONDS * 1000).toISOString(),
      );
      const entries = await cache.hgetall(connectionKey(userId));
      const connections = Object.values(entries)
        .map(parseConnection)
        .filter(
          (connection): connection is PresenceConnection => connection !== null,
        );
      const state = buildPresenceState(connections);
      if (state) return state;
    } catch (err) {
      logger.debug(
        { err, userId },
        "Redis presence read failed — using local state",
      );
    }

    const local = this.localPresence.get(userId);
    return local ? buildPresenceState([...local.values()]) : null;
  }

  async updateLastSeen(userId: string, socketId: string): Promise<void> {
    const connection = this.localPresence.get(userId)?.get(socketId);
    const now = new Date().toISOString();
    if (connection) {
      connection.lastSeen = now;
    }

    try {
      const cache = getCache();
      const key = connectionKey(userId);
      await cache.eval(
        PRUNE_CONNECTIONS_SCRIPT,
        1,
        key,
        new Date(Date.now() - PRESENCE_TTL_SECONDS * 1000).toISOString(),
      );
      const raw = await cache.hget(key, socketId);
      const redisConnection = raw ? parseConnection(raw) : null;
      if (redisConnection) {
        redisConnection.lastSeen = now;
        await cache.hset(key, socketId, JSON.stringify(redisConnection));
        await cache.expire(key, PRESENCE_TTL_SECONDS);
      }
    } catch {
      // non-critical
    }
  }

  getOnlineUsers(): string[] {
    this.pruneLocalPresence();
    return Array.from(this.localPresence.keys());
  }

  getOnlineCount(): number {
    this.pruneLocalPresence();
    return this.localPresence.size;
  }

  getConnectionCount(): number {
    this.pruneLocalPresence();
    let count = 0;
    for (const connections of this.localPresence.values()) {
      count += connections.size;
    }
    return count;
  }

  getConnectedDeviceCount(): number {
    this.pruneLocalPresence();
    const devices = new Set<string>();
    for (const connections of this.localPresence.values()) {
      for (const connection of connections.values()) {
        devices.add(`${connection.userId}:${connection.deviceId}`);
      }
    }
    return devices.size;
  }

  getActiveSessionCount(): number {
    this.pruneLocalPresence();
    const sessions = new Set<string>();
    for (const connections of this.localPresence.values()) {
      for (const connection of connections.values()) {
        sessions.add(`${connection.userId}:${connection.sessionId}`);
      }
    }
    return sessions.size;
  }
}

let _presenceManager: PresenceManager | null = null;

export function getPresenceManager(): PresenceManager {
  if (!_presenceManager) {
    _presenceManager = new PresenceManager();
  }
  return _presenceManager;
}

