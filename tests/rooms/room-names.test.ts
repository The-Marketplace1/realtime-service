import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SOCKET_ROOMS } from "../../src/rooms/room-names.js";

describe("private room names", () => {
  it("keeps room types isolated by explicit namespaces", () => {
    assert.equal(SOCKET_ROOMS.userRoom("user-1"), "user:user-1");
    assert.equal(SOCKET_ROOMS.bookingRoom("booking-1"), "booking:booking-1");
    assert.equal(
      SOCKET_ROOMS.conversationRoom("conversation-1"),
      "conversation:conversation-1",
    );
    assert.equal(SOCKET_ROOMS.adminRoom(), "admin");
    assert.notEqual(
      SOCKET_ROOMS.userRoom("booking-1"),
      SOCKET_ROOMS.bookingRoom("booking-1"),
    );
  });
});

