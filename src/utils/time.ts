export function nowMs(): number {
  return Date.now();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function msSince(timestampMs: number): number {
  return Date.now() - timestampMs;
}

export function isStale(timestampMs: number, thresholdMs: number): boolean {
  return msSince(timestampMs) > thresholdMs;
}

export function secondsSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / 1000);
}

