import type { BookingStatus } from "../events/booking.status.js";

export type BookingMode = "on_site" | "remote" | "online";

export interface BookingSession {
  bookingId: string;
  customerId: string;
  professionalId: string;
  status: BookingStatus;
  mode: BookingMode;
  isOnsiteTracking: boolean;
  trackingActive: boolean;
  chatActive: boolean;
  /** Physical coordinates of the job site — used for arrival detection. */
  serviceLocation?: { lat: number; lng: number };
  createdAt: Date;
  updatedAt: Date;
}

export interface BookingSessionUpdate {
  status: BookingStatus;
  metadata?: Record<string, unknown>;
}

