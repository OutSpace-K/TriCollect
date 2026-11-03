import { test } from "node:test";
import assert from "node:assert/strict";
import { viewport } from "../src/platform/viewport";
test("native capsule and home indicator remain outside all game coordinates at narrow and tall sizes", () => {
  for (const height of [568, 660, 844, 932])
    for (const menu of [64, 88, undefined, NaN]) {
      const v = viewport(height, 24, height - 24, menu);
      if (menu !== undefined && Number.isFinite(menu)) assert.ok(v.top > menu);
      else assert.equal(v.top, 68);
      assert.ok(
        Math.abs(v.top + v.logicalHeight * v.factor + v.bottom - height) < 1e-8,
      );
      for (const y of [18, 52, v.logicalHeight - 44]) {
        const physical = v.top + y * v.factor;
        assert.ok(physical > v.top && physical < height - v.bottom);
        assert.ok(Math.abs((physical - v.top) / v.factor - y) < 1e-8);
      }
    }
});
