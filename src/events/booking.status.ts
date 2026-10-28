/**
 * Booking status constants.
 *
 * Used for display/logging only. Booking state machine lives in backend-api.
 */
export const BOOKING_STATUS = {
  REQUESTED: "REQUESTED",
  ACCEPTED: "ACCEPTED",
  PREPARATION: "PREPARATION",
  EN_ROUTE: "EN_ROUTE",
  ARRIVED: "ARRIVED",
  IN_PROGRESS: "IN_PROGRESS",
  AWAITING_CONFIRMATION: "AWAITING_CONFIRMATION",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;

export type BookingStatus =
  (typeof BOOKING_STATUS)[keyof typeof BOOKING_STATUS];

