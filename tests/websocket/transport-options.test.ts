import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createSocketIoOptions } from "../../src/websocket/socketio-options.js";

describe("WebSocket transport options", () => {
  it("uses Socket.IO with WebSocket and polling fallback on the public realtime path", () => {
    const options = createSocketIoOptions();
    assert.equal(options.path, "/realtime/socket.io");
    assert.deepEqual(options.transports, ["websocket", "polling"]);
    assert.equal(options.pingInterval, 25_000);
    assert.equal(options.pingTimeout, 30_000);
  });
});

