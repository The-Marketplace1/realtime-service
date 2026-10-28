function requireEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

const nodeEnv = process.env.NODE_ENV?.trim() || "development";
const isProduction = nodeEnv === "production";
const jwtSecret =
  process.env.JWT_SECRET?.trim() ||
  (isProduction
    ? requireEnv("JWT_SECRET")
    : "development-only-jwt-secret-not-for-shared-environments");
const redisUrl =
  process.env.REDIS_URL?.trim() ||
  (isProduction ? requireEnv("REDIS_URL") : "redis://localhost:6379");
const corsOriginValue =
  process.env.CORS_ORIGINS?.trim() ||
  (isProduction ? requireEnv("CORS_ORIGINS") : "*");
const corsOrigins = corsOriginValue
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const port = Number.parseInt(process.env.PORT ?? "5000", 10);
const maxConnectionsPerUser = Number.parseInt(
  process.env.MAX_CONNECTIONS_PER_USER ?? "5",
  10,
);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}
if (!Number.isInteger(maxConnectionsPerUser) || maxConnectionsPerUser < 1) {
  throw new Error("MAX_CONNECTIONS_PER_USER must be a positive integer");
}
if (isProduction && corsOrigins.includes("*")) {
  throw new Error("CORS_ORIGINS must not include '*' in production");
}
if (isProduction && corsOrigins.length === 0) {
  throw new Error(
    "CORS_ORIGINS must contain at least one allowed origin in production",
  );
}

export const env = {
  NODE_ENV: nodeEnv,
  PORT: port,
  LOG_LEVEL: process.env.LOG_LEVEL ?? "info",

  /** Shared JWT secret — realtime-service verifies only, never issues. */
  JWT_SECRET: jwtSecret,

  /** Redis connection string */
  REDIS_URL: redisUrl,

  /** Allowed WebSocket origins (comma-separated, "*" for development) */
  CORS_ORIGINS: corsOrigins,

  /** Max concurrent socket connections per user (across devices) */
  MAX_CONNECTIONS_PER_USER: maxConnectionsPerUser,

  get isProduction() {
    return this.NODE_ENV === "production";
  },

  get isDevelopment() {
    return this.NODE_ENV === "development";
  },
} as const;

export type Env = typeof env;

