import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SOCKET_EVENTS } from "../../src/socketio/socket-events.js";
import { REDIS_CHANNELS } from "../../src/redis/channels.js";
import { SOCKET_ROOMS } from "../../src/rooms/room-names.js";
import {
  handleBookingEvent,
  handleCommunicationEvent,
  handleNotificationEvent,
  handlePaymentEvent,
  handlePresenceEvent,
  handleLocationEvent,
} from "../../src/delivery/event.handlers.js";
import { isValidInboundEvent } from "../../src/events/event.validation.js";
import {
  buildPresenceState,
  type PresenceConnection,
} from "../../src/presence/presence.state.js";

type Emission = { rooms: string[]; event: string; payload: unknown };

function createMockIo(): { io: any; emissions: Emission[] } {
  const emissions: Emission[] = [];
  const createOperator = (rooms: string[]) => ({
    to(room: string) {
      return createOperator([...rooms, room]);
    },
    emit(event: string, payload: unknown) {
      emissions.push({ rooms: [...new Set(rooms)], event, payload });
    },
  });

  return {
    io: {
      local: { to: (room: string) => createOperator([room]) },
      to: (room: string) => createOperator([room]),
    },
    emissions,
  };
}

describe("realtime relay contract", () => {
  it("uses the shared Redis channels and room names", () => {
    assert.equal(
      REDIS_CHANNELS.COMMUNICATION_EVENTS,
      "marketplace:communication:events",
    );
    assert.equal(
      REDIS_CHANNELS.NOTIFICATION_EVENTS,
      "marketplace:notification:events",
    );
    assert.equal(SOCKET_ROOMS.adminRoom(), "admin");
    assert.equal(
      SOCKET_ROOMS.conversationRoom("conv-1"),
      "conversation:conv-1",
    );
  });

  it("relays booking events to booking participants and admins without duplicate rooms", () => {
    const { io, emissions } = createMockIo();
    const event = {
      type: "booking.accepted" as const,
      bookingId: "booking-1",
      customerId: "customer-1",
      professionalId: "professional-1",
    };

    handleBookingEvent(io, event);

    assert.deepEqual(emissions[0].rooms, [
      "booking:booking-1",
      "user:customer-1",
      "user:professional-1",
    ]);
    assert.equal(emissions[0].event, SOCKET_EVENTS.BOOKING.ACCEPTED);
    assert.equal(emissions[1].rooms[0], SOCKET_ROOMS.adminRoom());
  });

  it("relays modern payment events even when no booking room is present", () => {
    const { io, emissions } = createMockIo();
    handlePaymentEvent(io, {
      type: "payment.failed",
      paymentId: "payment-1",
      amount: 100,
      currency: "NGN",
    });

    assert.equal(emissions.length, 1);
    assert.equal(emissions[0].event, SOCKET_EVENTS.ADMIN.PAYMENT_ACTIVITY);
    assert.deepEqual(emissions[0].rooms, [SOCKET_ROOMS.adminRoom()]);
  });

  it("delivers notifications only to the target user room", () => {
    const { io, emissions } = createMockIo();
    handleNotificationEvent(io, {
      type: "notification.created",
      userId: "customer-1",
      notificationId: "notification-1",
    });

    assert.deepEqual(emissions[0].rooms, ["user:customer-1"]);
    assert.equal(emissions[0].event, SOCKET_EVENTS.NOTIFICATION.CREATED);
  });

  it("relays location updates to the booking and authorized customer rooms", () => {
    const { io, emissions } = createMockIo();
    handleLocationEvent(io, {
      type: "location.update",
      bookingId: "booking-1",
      professionalId: "professional-1",
      customerId: "customer-1",
      lat: 6.5244,
      lng: 3.3792,
    });

    assert.deepEqual(emissions[0].rooms, [
      "booking:booking-1",
      "user:customer-1",
    ]);
    assert.equal(emissions[0].event, "location.update");
  });

  it("drops malformed inbound events before they reach relay handlers", () => {
    assert.equal(
      isValidInboundEvent(REDIS_CHANNELS.NOTIFICATION_EVENTS, {
        type: "notification.created",
        userId: "customer-1",
      }),
      false,
    );
    assert.equal(
      isValidInboundEvent(REDIS_CHANNELS.NOTIFICATION_EVENTS, {
        type: "notification.created",
        userId: "customer-1",
        notificationId: "notification-1",
      }),
      true,
    );
  });

  it("fans communication events into booking, conversation, and participant rooms", () => {
    const { io, emissions } = createMockIo();
    handleCommunicationEvent(io, {
      type: "message.sent",
      bookingId: "booking-1",
      conversationId: "conversation-1",
      senderId: "customer-1",
      recipientId: "professional-1",
      messageId: "message-1",
    });

    assert.deepEqual(emissions[0].rooms, [
      "booking:booking-1",
      "conversation:conversation-1",
      "user:customer-1",
      "user:professional-1",
    ]);
    assert.equal(emissions[0].event, SOCKET_EVENTS.MESSAGE.SENT);
  });

  it("relays professional status to the professional and admin streams", () => {
    const { io, emissions } = createMockIo();
    handlePresenceEvent(io, {
      type: "professional.available",
      professionalId: "professional-1",
      status: "available",
    });

    assert.deepEqual(emissions[0].rooms, [
      "user:professional-1",
      "professional:professional-1",
    ]);
    assert.equal(emissions[0].event, SOCKET_EVENTS.PROFESSIONAL.AVAILABLE);
    assert.equal(emissions[1].rooms[0], SOCKET_ROOMS.adminRoom());
  });

  it("maps legacy professional status events to the modern availability stream", () => {
    const { io, emissions } = createMockIo();

    handlePresenceEvent(io, {
      type: "professional.status",
      bookingId: "booking-1",
      professionalId: "professional-1",
      status: "en_route",
    });

    assert.equal(emissions[0].event, SOCKET_EVENTS.PROFESSIONAL.BUSY);
    assert.deepEqual(emissions[0].rooms, [
      "user:professional-1",
      "professional:professional-1",
    ]);
  });
});

