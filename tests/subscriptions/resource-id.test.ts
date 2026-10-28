import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isResourceId } from "../../src/validation/resource-id.js";

describe("subscription resource validation", () => {
  it("accepts bounded identifiers used to build private room names", () => {
    assert.equal(isResourceId("booking_01:active"), true);
    assert.equal(isResourceId("a".repeat(128)), true);
  });

  it("rejects empty, oversized, or room-injection identifiers", () => {
    assert.equal(isResourceId(""), false);
    assert.equal(isResourceId("a".repeat(129)), false);
    assert.equal(isResourceId("booking:1 user:other"), false);
    assert.equal(isResourceId(null), false);
  });
});

