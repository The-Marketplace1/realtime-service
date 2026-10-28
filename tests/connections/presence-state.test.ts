import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildPresenceState,
  type PresenceConnection,
} from "../../src/presence/presence.state.js";

describe("connection presence state", () => {
  it("aggregates socket, device, and session counts without duplicating devices", () => {
    const connections: PresenceConnection[] = [
      {
        userId: "professional-1",
        role: "professional",
        socketId: "socket-1",
        sessionId: "session-a",
        deviceId: "device-phone",
        connectedAt: "2026-08-27T08:00:00.000Z",
        lastSeen: "2026-08-27T08:01:00.000Z",
      },
      {
        userId: "professional-1",
        role: "professional",
        socketId: "socket-2",
        sessionId: "session-a",
        deviceId: "device-phone",
        connectedAt: "2026-08-27T08:02:00.000Z",
        lastSeen: "2026-08-27T08:04:00.000Z",
      },
      {
        userId: "professional-1",
        role: "professional",
        socketId: "socket-3",
        sessionId: "session-b",
        deviceId: "device-tablet",
        connectedAt: "2026-08-27T08:03:00.000Z",
        lastSeen: "2026-08-27T08:03:30.000Z",
      },
    ];

    const state = buildPresenceState(connections);
    assert.ok(state);
    assert.equal(state.connectedDeviceCount, 2);
    assert.equal(state.activeSessionCount, 2);
    assert.equal(state.socketCount, 3);
    assert.equal(state.connectedAt.toISOString(), "2026-08-27T08:00:00.000Z");
    assert.equal(state.lastSeen.toISOString(), "2026-08-27T08:04:00.000Z");
  });
});

