/** Redis Pub/Sub event channels consumed from Marketplace service owners. */
export const REDIS_CHANNELS = {
  BOOKING_EVENTS: "marketplace:booking:events",
  PAYMENT_EVENTS: "marketplace:payment:events",
  NOTIFICATION_EVENTS: "marketplace:notification:events",
  COMMUNICATION_EVENTS: "marketplace:communication:events",
  ADMIN_EVENTS: "marketplace:admin:events",
  PRESENCE_EVENTS: "marketplace:presence:events",
  AUTH_EVENTS: "marketplace:auth:events",
} as const;

export type RedisChannel = (typeof REDIS_CHANNELS)[keyof typeof REDIS_CHANNELS];

export const CHANNELS = {
  ...REDIS_CHANNELS,
  ALL: Object.values(REDIS_CHANNELS),
} as const;

