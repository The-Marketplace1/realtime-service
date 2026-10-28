/**
 * Event mapper utilities.
 *
 * Provides safe JSON parsing for raw Redis messages.
 * Type-specific mapping is handled directly in event.handlers.ts.
 */
import type { MarketplaceEvent } from "./event.types.js";

export function parseRedisMessage(raw: string): MarketplaceEvent | null {
  try {
    return JSON.parse(raw) as MarketplaceEvent;
  } catch {
    return null;
  }
}

