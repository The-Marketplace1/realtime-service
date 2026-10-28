import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CHANNELS, REDIS_CHANNELS } from "../../src/redis/channels.js";

describe("Redis channel contract", () => {
  it("subscribes only to the established Marketplace event channels", () => {
    assert.equal(REDIS_CHANNELS.BOOKING_EVENTS, "marketplace:booking:events");
    assert.equal(
      REDIS_CHANNELS.COMMUNICATION_EVENTS,
      "marketplace:communication:events",
    );
    assert.equal(CHANNELS.ALL.length, 7);
    assert.ok(CHANNELS.ALL.includes(REDIS_CHANNELS.AUTH_EVENTS));
  });
});

