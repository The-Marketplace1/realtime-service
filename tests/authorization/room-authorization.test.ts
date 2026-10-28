import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canAccessRoom } from "../../src/authorization/room-authorization.js";
import type { AuthenticatedSocket } from "../../src/events/event.types.js";

describe("room authorization", () => {
  const customer: AuthenticatedSocket = {
    userId: "customer-1",
    role: "customer",
    sessionId: "session-1",
    bookingIds: ["booking-1"],
    conversationIds: ["conversation-1"],
  };

  it("allows only resources explicitly present in the verified claims", () => {
    assert.equal(canAccessRoom(customer, "booking", "booking-1"), true);
    assert.equal(canAccessRoom(customer, "booking", "booking-2"), false);
    assert.equal(
      canAccessRoom(customer, "conversation", "conversation-1"),
      true,
    );
    assert.equal(
      canAccessRoom(customer, "conversation", "conversation-2"),
      false,
    );
  });

  it("does not let a production user without scopes subscribe to private rooms", () => {
    assert.equal(
      canAccessRoom(
        { userId: "customer-2", role: "customer", sessionId: "session-2" },
        "booking",
        "booking-1",
      ),
      false,
    );
  });

  it("allows established admin identities to access operational room scopes", () => {
    assert.equal(
      canAccessRoom(
        { userId: "admin-1", role: "admin", sessionId: "session-admin" },
        "booking",
        "booking-1",
      ),
      true,
    );
  });
});

