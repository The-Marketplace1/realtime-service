/**
 * Session-related type definitions.
 *
 * Kept minimal — the realtime-service does not own booking session state.
 */

export interface SubscriptionState {
  bookingIds: string[];
  conversationIds: string[];
}

