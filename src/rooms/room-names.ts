/** Canonical Socket.IO room names; membership is authorization-controlled. */
export const SOCKET_ROOMS = {
  /** All sockets belonging to a specific user (across devices) */
  userRoom: (userId: string) => `user:${userId}`,
  /** All participants in a specific booking */
  bookingRoom: (bookingId: string) => `booking:${bookingId}`,
  /** All participants in a specific conversation */
  conversationRoom: (conversationId: string) =>
    `conversation:${conversationId}`,
  /** All sockets for a specific professional (availability updates) */
  professionalRoom: (professionalId: string) =>
    `professional:${professionalId}`,
  /** Admin dashboard subscribers */
  adminRoom: () => "admin",
  /** Analytics stream subscribers */
  analyticsRoom: () => "analytics",
  /** Global broadcast room */
  globalRoom: () => "room:global",
} as const;

