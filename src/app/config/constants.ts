/**
 * Operational constants for the realtime-service.
 *
 * These govern connection management, rate limits, and Redis key patterns.
 * Business constants (message retention, max length, etc.) belong in their
 * respective services (communication-service, backend-api).
 */
export const CONSTANTS = {
  RATE_LIMIT: {
    WINDOW_MS: 10_000,
    /** Maximum events of one name per user and window. */
    DEFAULT_PER_EVENT: 120,
    /** Maximum booking/conversation subscribe operations per user and window. */
    SUBSCRIPTION_MAX_PER_WINDOW: 20,
  },

  PRESENCE: {
    /** Redis TTL for presence keys (seconds) */
    TTL_SECONDS: 300,
  },

  REDIS: {
    KEY_PREFIX: "mkt:rt:",
    PRESENCE_KEY: (userId: string) => `mkt:rt:presence:${userId}`,
  },
} as const;

