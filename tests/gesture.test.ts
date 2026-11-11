import { test } from "node:test";
import assert from "node:assert/strict";
import { gesture } from "../src/platform/gesture";

test("finger jitter uses screen pixels rather than shrunken logical-canvas thresholds", () => {
  assert.equal(gesture(14, 8), "tap");
  assert.equal(gesture(0, 18), "tap");
  assert.equal(gesture(19, 0), null);
  assert.equal(gesture(30, 0), null);
});
test("only a clearly horizontal screen-space swipe rotates the board", () => {
  assert.equal(gesture(41, 5), "right");
  assert.equal(gesture(-41, 5), "left");
  assert.equal(gesture(40, 0), null);
  assert.equal(gesture(45, 45), null);
  assert.equal(gesture(1, 50), null);
});
