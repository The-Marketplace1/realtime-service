import { env } from "../app/config/env.js";

export function isAllowedOrigin(origin: string): boolean {
  if (env.CORS_ORIGINS.includes("*")) return true;

  try {
    const normalizedOrigin = new URL(origin).origin;
    return env.CORS_ORIGINS.some((allowed) => {
      try {
        return new URL(allowed).origin === normalizedOrigin;
      } catch {
        return allowed === origin;
      }
    });
  } catch {
    return false;
  }
}

