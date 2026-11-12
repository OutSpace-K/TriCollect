import { test } from "node:test";
import assert from "node:assert/strict";
import {
  worldPosition,
  rotateWorld,
  projection,
} from "../src/render/projection";
import { createLevel } from "../src/core/generation";
import { faceCoordinates } from "../src/core/rules";
test("bundle rotates rigidly about its geometric center with no horizontal scale", () => {
  for (const preset of [0, 2]) {
    const b = createLevel(preset).board;
    for (const angle of [
      0,
      0.2,
      0.7,
      1.2,
      (Math.PI * 2) / 3,
      Math.PI,
      (Math.PI * 4) / 3,
    ]) {
      const f = projection(b.side, 320, 147, 487, angle),
        points = b.tubes.map(f.point);
      assert.ok(
        Math.abs(
          points.reduce((s, p) => s + p.x, 0) / points.length - f.axis.x,
        ) < 1e-9,
      );
      assert.ok(
        Math.abs(
          points.reduce((s, p) => s + p.y, 0) / points.length - f.axis.y,
        ) < 1e-9,
      );
      for (const t of b.tubes) {
        const p = worldPosition(t, b.side),
          r = rotateWorld(p, angle),
          s = f.point(t);
        assert.ok(Math.abs(Math.hypot(p.x, p.z) - Math.hypot(r.x, r.z)) < 1e-9);
        assert.ok(s.x - f.radius >= 9.99 && s.x + f.radius <= 310.01);
        assert.ok(s.y - f.height >= 160.99 && s.y <= 479.01);
      }
    }
    for (let v = 0; v < 3; v++) {
      const f = projection(b.side, 390, 147, 671, (v * Math.PI * 2) / 3);
      for (const t of b.tubes) {
        const p = f.point(t),
          { lane, depth } = faceCoordinates(t, b.side, v);
        assert.ok(
          Math.abs(
            p.x - (195 + (lane + depth / 2 - (b.side - 1) / 2) * f.lane),
          ) < 1e-8,
        );
      }
    }
  }
});
test("five fixed ball slots touch without crossing tube walls at mobile sizes", () => {
  for (const side of [6, 8])
    for (const width of [320, 390, 500]) {
      const p = projection(side, width, 147, 487, 0);
      assert.equal(p.step, 2 * p.ballRadius);
      assert.ok(p.ballRadius < p.radius);
      assert.ok(p.step * 4 + 2 * p.ballRadius + 6 <= p.height);
    }
});
test("enlarged spheres retain wall clearance, fixed height and touching slots", () => {
  for (const side of [6, 8])
    for (const width of [320, 390, 500]) {
      const top = 147,
        bottom = 487,
        edge = side - 1;
      const originalDepth = Math.min(108, edge * 18, (bottom - top) * 0.24);
      const maxHeight = Math.min(
        380,
        bottom - top - 24 - (originalDepth * 0.52 * 4) / 3,
      );
      const p = projection(side, width, top, bottom, 0);
      assert.ok(
        Math.abs((p.zScale * edge * Math.sqrt(3)) / 2 - originalDepth * 0.52) <
          1e-8,
      );
      assert.equal(
        p.ballRadius,
        Math.min(p.radius * 0.96, (maxHeight - 20) / 10),
      );
      assert.equal(p.height, p.ballRadius * 10 + 20);
    }
});

test("v0.1.28 spends recovered vertical margins on larger phone balls", () => {
  for (const width of [320, 390, 448, 500])
    for (const side of [6, 8])
      for (const capacity of [5, 7]) {
        const top = 127,
          bottom = 421,
          edge = side - 1;
        const p = projection(side, width, top, bottom, 0, capacity);
        const oldDepth = Math.min(108, edge * 18, (bottom - top) * 0.24) * 0.52;
        const oldHeight = Math.min(300, bottom - top - 52 - (oldDepth * 4) / 3);
        const oldRadius = Math.min(
          p.radius * 0.92,
          (oldHeight - 20) / (capacity * 2),
        );
        assert.ok(p.ballRadius >= oldRadius);
        if (capacity === 7) assert.ok(p.ballRadius > oldRadius * 1.14);
        assert.equal(p.step, p.ballRadius * 2);
      }
});
