import { v4 as uuidv4 } from "uuid";

export function generateId(prefix?: string): string {
  const id = uuidv4();
  return prefix ? `${prefix}_${id}` : id;
}

export function generateEventId(): string {
  return generateId("evt");
}

export function generateMessageId(): string {
  return generateId("msg");
}

export function generateConversationId(): string {
  return generateId("conv");
}

