import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isAllowedOrigin } from "../../src/security/origin.policy.js";

describe("Socket.IO origin policy", () => {
  it("allows configured origins and rejects unlisted or malformed origins", () => {
    assert.equal(isAllowedOrigin("http://localhost"), true);
    assert.equal(isAllowedOrigin("https://untrusted.example"), false);
    assert.equal(isAllowedOrigin("not-an-origin"), false);
  });
});

