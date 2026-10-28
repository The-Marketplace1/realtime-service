mport { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createSocketServer } from "../../src/socketio/index.js";

describe("Socket.IO server", () => {
  it("mounts the established realtime endpoint with WebSocket and polling support", async () => {
    const httpServer = createServer();
    const io = createSocketServer(httpServer);
    await new Promise<void>((resolve) => {
      httpServer.listen(0, "127.0.0.1", resolve);
    });

    try {
      assert.equal(io.path(), "/realtime/socket.io");
      assert.deepEqual(io.engine.opts.transports, ["websocket", "polling"]);
    } finally {
      await new Promise<void>((resolve) => io.close(() => resolve()));
    }
  });
});

