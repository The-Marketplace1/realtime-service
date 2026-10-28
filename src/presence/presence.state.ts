import type { PresenceState } from "../events/event.types.js";

export interface PresenceConnection {
  userId: string;
  role: string;
  socketId: string;
  sessionId: string;
  deviceId: string;
  status?: "connected";
  clientType?: string;
  environment?: string;
  connectedAt: string;
  lastSeen: string;
}

export function buildPresenceState(
  connections: PresenceConnection[],
): PresenceState | null {
  if (connections.length === 0) return null;

  const sortedByConnectedAt = [...connections].sort(
    (a, b) => Date.parse(a.connectedAt) - Date.parse(b.connectedAt),
  );
  const sortedByLastSeen = [...connections].sort(
    (a, b) => Date.parse(b.lastSeen) - Date.parse(a.lastSeen),
  );

  return {
    userId: connections[0].userId,
    role: connections[0].role,
    socketIds: connections.map((connection) => connection.socketId),
    connectedAt: new Date(sortedByConnectedAt[0].connectedAt),
    lastSeen: new Date(sortedByLastSeen[0].lastSeen),
    connectedDeviceCount: new Set(
      connections.map((connection) => connection.deviceId),
    ).size,
    activeSessionCount: new Set(
      connections.map((connection) => connection.sessionId),
    ).size,
    socketCount: connections.length,
  };
}

