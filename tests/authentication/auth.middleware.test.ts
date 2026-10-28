import { describe, it } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import {
  authenticateSocket,
  type SocketWithAuth,
} from "../../src/authentication/auth.middleware.js";

const key = process.env.JWT_SECRET ?? "unit-test-verification-key";

function mockSocket(token: string): SocketWithAuth {
  return {
    id: "test-socket",
    handshake: {
      auth: { token },
      headers: {},
    },
  } as unknown as SocketWithAuth;
}

describe("socket authentication", () => {
  it("attaches the verified identity and scoped authorization claims", () => {
    const socket = mockSocket(
      jwt.sign(
        {
          sub: "customer-1",
          role: "customer",
          clientType: "customer-app",
          bookingIds: ["booking-1"],
          conversationIds: ["conversation-1"],
        },
        key,
        { expiresIn: "5m" },
      ),
    );
    let error: Error | undefined;

    authenticateSocket(socket, (err) => {
      error = err;
    });

    assert.equal(error, undefined);
    assert.equal(socket.user?.userId, "customer-1");
    assert.equal(socket.user?.clientType, "customer-app");
    assert.deepEqual(socket.user?.bookingIds, ["booking-1"]);
    assert.deepEqual(socket.user?.conversationIds, ["conversation-1"]);
  });

  it("rejects a token signed with a different key", () => {
    const socket = mockSocket(
      jwt.sign({ sub: "customer-1" }, "wrong-key", { expiresIn: "5m" }),
    );
    let error: Error | undefined;

    authenticateSocket(socket, (err) => {
      error = err;
    });

    assert.match(error?.message ?? "", /Invalid token/);
    assert.equal(socket.user, undefined);
  });
});

