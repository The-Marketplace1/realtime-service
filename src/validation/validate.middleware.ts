import type { SocketWithAuth } from "../authentication/auth.middleware.js";
import { emitError } from "../utils/socket.utils.js";

export interface ValidationRule {
  field: string;
  required?: boolean;
  type?: "string" | "number" | "boolean" | "object";
  min?: number;
  max?: number;
}

export function validatePayload(
  socket: SocketWithAuth,
  payload: unknown,
  rules: ValidationRule[],
): payload is Record<string, unknown> {
  if (!payload || typeof payload !== "object") {
    emitError(socket, "Invalid payload: expected an object", "INVALID_PAYLOAD");
    return false;
  }

  const data = payload as Record<string, unknown>;

  for (const rule of rules) {
    const value = data[rule.field];

    if (
      rule.required &&
      (value === undefined || value === null || value === "")
    ) {
      emitError(
        socket,
        `Missing required field: ${rule.field}`,
        "INVALID_PAYLOAD",
      );
      return false;
    }

    if (value === undefined || value === null) continue;

    if (rule.type && typeof value !== rule.type) {
      emitError(
        socket,
        `Field ${rule.field} must be of type ${rule.type}`,
        "INVALID_PAYLOAD",
      );
      return false;
    }

    if (rule.type === "number" && typeof value === "number") {
      if (rule.min !== undefined && value < rule.min) {
        emitError(
          socket,
          `Field ${rule.field} must be >= ${rule.min}`,
          "INVALID_PAYLOAD",
        );
        return false;
      }
      if (rule.max !== undefined && value > rule.max) {
        emitError(
          socket,
          `Field ${rule.field} must be <= ${rule.max}`,
          "INVALID_PAYLOAD",
        );
        return false;
      }
    }

    if (rule.type === "string" && typeof value === "string") {
      if (rule.min !== undefined && value.length < rule.min) {
        emitError(
          socket,
          `Field ${rule.field} must be at least ${rule.min} characters`,
          "INVALID_PAYLOAD",
        );
        return false;
      }
      if (rule.max !== undefined && value.length > rule.max) {
        emitError(
          socket,
          `Field ${rule.field} must be at most ${rule.max} characters`,
          "INVALID_PAYLOAD",
        );
        return false;
      }
    }
  }

  return true;
}

