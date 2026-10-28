/**
 * Redis event handlers — pure relay functions.
 *
 * Each handler receives a parsed Redis event and broadcasts it to the
 * appropriate Socket.io rooms. No business logic, no persistence.
 */
import type { Server } from "socket.io";
import { SOCKET_EVENTS } from "../socketio/socket-events.js";
import { SOCKET_ROOMS } from "../rooms/room-names.js";
import { logger } from "../utils/logger.js";
import type {
  BookingEvent,
  PaymentEvent,
  NotificationEvent,
  CommunicationEvent,
  AdminEvent,
  PresenceEvent,
  LocationEvent,
} from "../events/event.types.js";
import { incrementCounter } from "../telemetry/metrics.js";

// ── Booking events ────────────────────────────────────────────────────────────

export function handleBookingEvent(io: Server, event: BookingEvent): void {
  incrementCounter("relayedEvents");
  const bookingRoom = SOCKET_ROOMS.bookingRoom(event.bookingId);
  const customerRoom = SOCKET_ROOMS.userRoom(event.customerId);
  const professionalRoom = SOCKET_ROOMS.userRoom(event.professionalId);

  // Map Redis event type to a socket event name (1:1 for clean relay)
  const socketEvent = mapBookingType(event.type);

  emitToRooms(
    io,
    [bookingRoom, customerRoom, professionalRoom],
    socketEvent,
    event,
  );
  io.local
    .to(SOCKET_ROOMS.adminRoom())
    .emit(SOCKET_EVENTS.ADMIN.BOOKING_ACTIVITY, event);

  // Evict all sockets from the booking room when the booking closes
  if (
    event.type === "booking.completed" ||
    event.type === "booking.cancelled"
  ) {
    setTimeout(() => {
      io.local.in(bookingRoom).socketsLeave(bookingRoom);
      logger.info(
        { bookingId: event.bookingId, type: event.type },
        "Booking closed — sockets evicted from room",
      );
    }, 2_000);
  }

  logger.debug(
    { bookingId: event.bookingId, type: event.type, socketEvent },
    "Booking event relayed",
  );
}

function mapBookingType(type: BookingEvent["type"]): string {
  const map: Record<BookingEvent["type"], string> = {
    "booking.created": SOCKET_EVENTS.BOOKING.CREATED,
    "booking.updated": SOCKET_EVENTS.BOOKING.UPDATED,
    "booking.accepted": SOCKET_EVENTS.BOOKING.ACCEPTED,
    "booking.rejected": SOCKET_EVENTS.BOOKING.REJECTED,
    "booking.started": SOCKET_EVENTS.BOOKING.STARTED,
    "booking.completed": SOCKET_EVENTS.BOOKING.COMPLETED,
    "booking.cancelled": SOCKET_EVENTS.BOOKING.CANCELLED,
    "booking.disputed": SOCKET_EVENTS.BOOKING.DISPUTED,
  };
  return map[type] ?? type;
}

// ── Payment events ────────────────────────────────────────────────────────────

export function handlePaymentEvent(io: Server, event: PaymentEvent): void {
  incrementCounter("relayedEvents");
  const socketEvent = mapPaymentType(event.type);

  const rooms = [
    event.bookingId ? SOCKET_ROOMS.bookingRoom(event.bookingId) : undefined,
    event.customerId ? SOCKET_ROOMS.userRoom(event.customerId) : undefined,
    event.professionalId
      ? SOCKET_ROOMS.userRoom(event.professionalId)
      : undefined,
  ];
  emitToRooms(io, rooms, socketEvent, event);
  io.local
    .to(SOCKET_ROOMS.adminRoom())
    .emit(SOCKET_EVENTS.ADMIN.PAYMENT_ACTIVITY, event);

  logger.debug(
    { bookingId: event.bookingId, type: event.type, socketEvent },
    "Payment event relayed",
  );
}

function mapPaymentType(type: PaymentEvent["type"]): string {
  const map: Record<PaymentEvent["type"], string> = {
    "payment.created": SOCKET_EVENTS.PAYMENT.CREATED,
    "payment.authorized": SOCKET_EVENTS.PAYMENT.AUTHORIZED,
    "payment.completed": SOCKET_EVENTS.PAYMENT.COMPLETED,
    "payment.failed": SOCKET_EVENTS.PAYMENT.FAILED,
    "escrow.created": SOCKET_EVENTS.PAYMENT.ESCROW_CREATED,
    "escrow.funded": SOCKET_EVENTS.PAYMENT.ESCROW_FUNDED,
    "escrow.released": SOCKET_EVENTS.PAYMENT.ESCROW_RELEASED,
    "withdrawal.requested": SOCKET_EVENTS.PAYMENT.WITHDRAWAL_REQUESTED,
    "withdrawal.completed": SOCKET_EVENTS.PAYMENT.WITHDRAWAL_COMPLETED,
  };
  return map[type] ?? type;
}

// ── Notification events ───────────────────────────────────────────────────────

export function handleNotificationEvent(
  io: Server,
  event: NotificationEvent,
): void {
  incrementCounter("relayedEvents");
  const userRoom = SOCKET_ROOMS.userRoom(event.userId);
  const socketEvent =
    event.type === "notification.read"
      ? SOCKET_EVENTS.NOTIFICATION.READ
      : SOCKET_EVENTS.NOTIFICATION.CREATED;

  io.local.to(userRoom).emit(socketEvent, event);

  logger.debug(
    { userId: event.userId, type: event.type },
    "Notification event relayed",
  );
}

// ── Communication events (chat + calls from communication-service) ─────────────

export function handleCommunicationEvent(
  io: Server,
  event: CommunicationEvent,
): void {
  incrementCounter("relayedEvents");
  const socketEvent = mapCommunicationType(event.type);
  const rooms: Array<string | undefined> = [];

  if (event.bookingId) {
    rooms.push(SOCKET_ROOMS.bookingRoom(event.bookingId));
  }

  if (event.conversationId) {
    rooms.push(SOCKET_ROOMS.conversationRoom(event.conversationId));
  }

  if (event.senderId) {
    rooms.push(SOCKET_ROOMS.userRoom(event.senderId));
  }
  if (event.recipientId) {
    rooms.push(SOCKET_ROOMS.userRoom(event.recipientId));
  }

  emitToRooms(io, rooms, socketEvent, event);

  logger.debug(
    {
      type: event.type,
      bookingId: event.bookingId,
      conversationId: event.conversationId,
    },
    "Communication event relayed",
  );
}

function mapCommunicationType(type: CommunicationEvent["type"]): string {
  const map: Record<CommunicationEvent["type"], string> = {
    "conversation.created": SOCKET_EVENTS.CONVERSATION.CREATED,
    "conversation.archived": SOCKET_EVENTS.CONVERSATION.ARCHIVED,
    "message.sent": SOCKET_EVENTS.MESSAGE.SENT,
    "message.edited": SOCKET_EVENTS.MESSAGE.EDITED,
    "message.deleted": SOCKET_EVENTS.MESSAGE.DELETED,
    "message.read": SOCKET_EVENTS.MESSAGE.READ,
    "typing.started": SOCKET_EVENTS.TYPING.STARTED,
    "typing.stopped": SOCKET_EVENTS.TYPING.STOPPED,
    "call.started": SOCKET_EVENTS.CALL.STARTED,
    "call.ringing": SOCKET_EVENTS.CALL.RINGING,
    "call.accepted": SOCKET_EVENTS.CALL.ACCEPTED,
    "call.rejected": SOCKET_EVENTS.CALL.REJECTED,
    "call.connected": SOCKET_EVENTS.CALL.CONNECTED,
    "call.ended": SOCKET_EVENTS.CALL.ENDED,
    "call.missed": SOCKET_EVENTS.CALL.MISSED,
  };
  return map[type] ?? type;
}

// ── Presence and professional availability ────────────────────────────────────

export function handlePresenceEvent(io: Server, event: PresenceEvent): void {
  incrementCounter("relayedEvents");
  const socketEvent = mapPresenceType(event);
  const userId = event.userId ?? event.professionalId;

  if (!userId) {
    logger.warn(
      { type: event.type },
      "Presence event has no user identifier — dropped",
    );
    return;
  }

  const rooms = [SOCKET_ROOMS.userRoom(userId)];
  if (event.type.startsWith("professional.")) {
    rooms.push(SOCKET_ROOMS.professionalRoom(userId));
  }

  emitToRooms(io, rooms, socketEvent, event);
  io.local
    .to(SOCKET_ROOMS.adminRoom())
    .emit(SOCKET_EVENTS.ADMIN.DASHBOARD_UPDATE, event);
}

export function handleLocationEvent(io: Server, event: LocationEvent): void {
  incrementCounter("relayedEvents");
  const rooms = [
    SOCKET_ROOMS.bookingRoom(event.bookingId),
    SOCKET_ROOMS.userRoom(event.customerId),
  ];

  emitToRooms(io, rooms, "location.update", event);

  logger.debug(
    {
      bookingId: event.bookingId,
      professionalId: event.professionalId,
      customerId: event.customerId,
    },
    "Location event relayed",
  );
}

function mapPresenceType(event: PresenceEvent): string {
  if (event.type === "professional.status") {
    switch (event.status) {
      case "offline":
        return SOCKET_EVENTS.PROFESSIONAL.OFFLINE;
      case "en_route":
      case "arrived":
      case "working":
        return SOCKET_EVENTS.PROFESSIONAL.BUSY;
      case "available":
        return SOCKET_EVENTS.PROFESSIONAL.AVAILABLE;
      case "online":
        return SOCKET_EVENTS.PROFESSIONAL.ONLINE;
      default:
        return SOCKET_EVENTS.PROFESSIONAL.ONLINE;
    }
  }

  const map: Record<PresenceEvent["type"], string> = {
    "user.online": SOCKET_EVENTS.PRESENCE.ONLINE,
    "user.offline": SOCKET_EVENTS.PRESENCE.OFFLINE,
    "professional.online": SOCKET_EVENTS.PROFESSIONAL.ONLINE,
    "professional.offline": SOCKET_EVENTS.PROFESSIONAL.OFFLINE,
    "professional.busy": SOCKET_EVENTS.PROFESSIONAL.BUSY,
    "professional.available": SOCKET_EVENTS.PROFESSIONAL.AVAILABLE,
    "professional.status": SOCKET_EVENTS.PROFESSIONAL.ONLINE,
  };
  return map[event.type];
}

// ── Admin events ──────────────────────────────────────────────────────────────

export function handleAdminEvent(io: Server, event: AdminEvent): void {
  incrementCounter("relayedEvents");
  const socketEvent =
    event.type === "admin.dashboard.update"
      ? SOCKET_EVENTS.ADMIN.DASHBOARD_UPDATE
      : event.type;
  io.local.to(SOCKET_ROOMS.adminRoom()).emit(socketEvent, event);

  logger.debug({ type: event.type }, "Admin event relayed");
}

function emitToRooms(
  io: Server,
  rooms: Array<string | undefined>,
  event: string,
  payload: unknown,
): void {
  const uniqueRooms = [
    ...new Set(rooms.filter((room): room is string => Boolean(room))),
  ];
  if (uniqueRooms.length === 0) return;

  const broadcast = uniqueRooms
    .slice(1)
    .reduce((operator, room) => operator.to(room), io.local.to(uniqueRooms[0]));
  broadcast.emit(event, payload);
}

