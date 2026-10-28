import type { SocketWithAuth } from "../authentication/auth.middleware.js";
import { getCache } from "../app/config/redis.js";
import { env } from "../app/config/env.js";
import { incrementCounter } from "../telemetry/metrics.js";
import { logger } from "../utils/logger.js";
import { CONSTANTS } from "../app/config/constants.js";

const INCREMENT_WINDOW_SCRIPT = `
  local count = redis.call("INCR", KEYS[1])
  if count == 1 then
    redis.call("PEXPIRE", KEYS[1], tonumber(ARGV[1]))
  end
  return count
`;

export function attachSocketRateLimit(socket: SocketWithAuth): void {
  socket.use(([eventName], next) => {
    if (typeof eventName !== "string" || !socket.user) {
      next();
      return;
    }

    const isSubscription =
      eventName.endsWith(":subscribe") || eventName.endsWith(":unsubscribe");
    const limit = isSubscription
      ? CONSTANTS.RATE_LIMIT.SUBSCRIPTION_MAX_PER_WINDOW
      : CONSTANTS.RATE_LIMIT.DEFAULT_PER_EVENT;
    const key = `rate-limit:socket:${socket.user.userId}:${eventName}`;

    void getCache()
      .eval(
        INCREMENT_WINDOW_SCRIPT,
        1,
        key,
        String(CONSTANTS.RATE_LIMIT.WINDOW_MS),
      )
      .then((count) => {
        if (Number(count) <= limit) {
          next();
          return;
        }

        incrementCounter("rateLimitRejections");
        logger.warn(
          { userId: socket.user?.userId, event: eventName, limit },
          "Socket event rate limit exceeded",
        );
        next(new Error("RATE_LIMIT_EXCEEDED"));
      })
      .catch((err: unknown) => {
        logger.error(
          { err, event: eventName },
          "Socket rate-limit check failed",
        );
        if (env.isProduction) {
          next(new Error("SERVICE_UNAVAILABLE"));
        } else {
          next();
        }
      });
  });
}

