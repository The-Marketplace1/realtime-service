import { CHANNELS } from "../redis/channels.js";
import type { MarketplaceEvent } from "./event.types.js";
import { isResourceId } from "../validation/resource-id.js";

const BOOKING_TYPES = new Set([
  "booking.created",
  "booking.updated",
  "booking.accepted",
  "booking.rejected",
  "booking.started",
  "booking.completed",
  "booking.cancelled",
  "booking.disputed",
  "booking.confirmed",
  "booking.professional_en_route",
  "booking.professional_arrived",
  "booking.service_started",
  "booking.awaiting_confirmation",
]);
const PAYMENT_TYPES = new Set([
  "payment.created",
  "payment.authorized",
  "payment.completed",
  "payment.failed",
  "escrow.created",
  "escrow.funded",
  "escrow.released",
  "escrow.refunded",
  "withdrawal.requested",
  "withdrawal.completed",
]);
const COMMUNICATION_TYPES = new Set([
  "conversation.created",
  "conversation.archived",
  "message.sent",
  "message.edited",
  "message.deleted",
  "message.read",
  "typing.started",
  "typing.stopped",
  "call.started",
  "call.ringing",
  "call.accepted",
  "call.rejected",
  "call.connected",
  "call.ended",
  "call.missed",
  "chat.message",
  "chat.session.created",
  "chat.session.closed",
]);
const PRESENCE_TYPES = new Set([
  "user.online",
  "user.offline",
  "user.updated",
  "professional.online",
  "professional.offline",
  "professional.busy",
  "professional.available",
  "professional.status",
]);

function hasResource(event: MarketplaceEvent, key: string): boolean {
  return isResourceId(event[key]);
}

function hasAnyResource(event: MarketplaceEvent, keys: string[]): boolean {
  return keys.some((key) => hasResource(event, key));
}

function hasFiniteNumber(event: MarketplaceEvent, key: string): boolean {
  return typeof event[key] === "number" && Number.isFinite(event[key]);
}

function hasValidCoordinates(event: MarketplaceEvent): boolean {
  return (
    hasFiniteNumber(event, "lat") &&
    hasFiniteNumber(event, "lng") &&
    Number(event.lat) >= -90 &&
    Number(event.lat) <= 90 &&
    Number(event.lng) >= -180 &&
    Number(event.lng) <= 180
  );
}

export function isValidInboundEvent(
  channel: string,
  event: MarketplaceEvent,
): boolean {
  if (typeof event.type !== "string" || event.type.length > 100) return false;

  if (event.type === "location.update") {
    return (
      hasResource(event, "bookingId") &&
      hasResource(event, "professionalId") &&
      hasResource(event, "customerId") &&
      hasValidCoordinates(event)
    );
  }

  switch (channel) {
    case CHANNELS.BOOKING_EVENTS:
      return (
        BOOKING_TYPES.has(event.type) &&
        hasResource(event, "bookingId") &&
        hasResource(event, "customerId") &&
        hasResource(event, "professionalId")
      );

    case CHANNELS.PAYMENT_EVENTS:
      return (
        PAYMENT_TYPES.has(event.type) &&
        hasAnyResource(event, [
          "bookingId",
          "customerId",
          "professionalId",
          "paymentId",
          "escrowId",
        ])
      );

    case CHANNELS.NOTIFICATION_EVENTS:
      return (
        (event.type === "notification.created" ||
          event.type === "notification.read") &&
        hasResource(event, "userId") &&
        hasResource(event, "notificationId")
      );

    case CHANNELS.COMMUNICATION_EVENTS:
      return (
        COMMUNICATION_TYPES.has(event.type) &&
        hasAnyResource(event, [
          "bookingId",
          "conversationId",
          "senderId",
          "recipientId",
          "callId",
          "messageId",
        ])
      );

    case CHANNELS.PRESENCE_EVENTS:
      return (
        PRESENCE_TYPES.has(event.type) &&
        hasAnyResource(event, ["userId", "professionalId"])
      );

    case CHANNELS.ADMIN_EVENTS:
      return (
        event.type === "admin.dashboard.update" ||
        event.type.startsWith("admin.")
      );

    case CHANNELS.AUTH_EVENTS:
      return event.type.startsWith("auth.");

    default:
      return false;
  }
}

