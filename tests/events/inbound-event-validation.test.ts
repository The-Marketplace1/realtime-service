import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CHANNELS } from "../../src/redis/channels.js";
import { isValidInboundEvent } from "../../src/events/event.validation.js";

describe("inbound event validation", () => {
  it("requires recipient and notification identifiers before notification relay", () => {
    assert.equal(
      isValidInboundEvent(CHANNELS.NOTIFICATION_EVENTS, {
        type: "notification.created",
        userId: "customer-1",
      }),
      false,
    );
    assert.equal(
      isValidInboundEvent(CHANNELS.NOTIFICATION_EVENTS, {
        type: "notification.created",
        userId: "customer-1",
        notificationId: "notification-1",
      }),
      true,
    );
  });

  it("validates location coordinates and booking recipients", () => {
    assert.equal(
      isValidInboundEvent(CHANNELS.PRESENCE_EVENTS, {
        type: "location.update",
        bookingId: "booking-1",
        professionalId: "professional-1",
        customerId: "customer-1",
        lat: 90,
        lng: 20,
      }),
      true,
    );
    assert.equal(
      isValidInboundEvent(CHANNELS.PRESENCE_EVENTS, {
        type: "location.update",
        bookingId: "booking-1",
        professionalId: "professional-1",
        customerId: "customer-1",
        lat: 91,
        lng: 20,
      }),
      false,
    );
    assert.equal(
      isValidInboundEvent(CHANNELS.PRESENCE_EVENTS, {
        type: "location.update",
        bookingId: "booking-1",
        professionalId: "professional-1",
        customerId: "customer-1",
        lat: "6.5",
        lng: 3.3,
      }),
      false,
    );
  });
});

