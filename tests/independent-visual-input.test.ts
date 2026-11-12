import { test } from "node:test";
import assert from "node:assert/strict";
import { Controller } from "../src/controller";
import { Scene } from "../src/render/scene";
import { CONFIG, DISPLAY_NAME } from "../src/config";
function setup(preset = 0, width = 390, height = 844, scale = 1) {
  let time = 0,
    arc = false;
  const labels: string[] = [];
  const strokes: { arc: boolean; color: unknown; width: unknown }[] = [];
  const noop = () => {};
  const ctx = new Proxy(
    {
      fillText(text: string) {
        labels.push(text);
      },
      beginPath() {
        arc = false;
      },
      arc() {
        arc = true;
      },
      stroke() {
        strokes.push({
          arc,
          color: (ctx as unknown as CanvasRenderingContext2D).strokeStyle,
          width: (ctx as unknown as CanvasRenderingContext2D).lineWidth,
        });
      },
      createLinearGradient: () => ({ addColorStop: noop }),
      createRadialGradient: () => ({ addColorStop: noop }),
    },
    {
      get: (o, k) => (k in o ? o[k as keyof typeof o] : noop),
      set: (o, k, v) => {
        (o as Record<string | symbol, unknown>)[k] = v;
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  const data = new Map<string, string>();
  const game = new Controller(
    () => time,
    {
      get: (k) => data.get(k) ?? null,
      set: (k, v) => {
        data.set(k, v);
      },
    },
    { available: false, label: "none", request: async () => "failed" },
  );
  game.start(preset);
  game.skipIntro();
  game.begin();
  const scene = new Scene(ctx, game, width, height, scale);
  scene.render();
  return {
    scene,
    game,
    strokes,
    labels,
    advance: (ms: number) => {
      time += ms;
      game.tick();
      scene.render();
    },
  };
}

import { viewport } from "../src/platform/viewport";
import { projection } from "../src/render/projection";
const sizes = [
  [320, 568],
  [360, 640],
  [390, 844],
  [430, 932],
];
test("independent four-phone restored perspective input and rotation audit", () => {
  let legal = 0,
    blocked = 0,
    overlaps = 0,
    bounds = 0;
  for (const [w, h] of sizes)
    for (const preset of [0, 1, 2])
      for (const view of [0, 1, 2]) {
        const vp = viewport(h, 24, h - 24, 64);
        const x = setup(preset, w / vp.factor, vp.logicalHeight, vp.factor);
        x.game.state.view = view;
        x.scene.render();
        assert.deepEqual(
          new Set(x.scene.targets.map((t) => t.id)),
          x.game.visible,
        );
        let picked: string | undefined;
        const realPick = x.game.pick.bind(x.game);
        x.game.pick = (id: string) => {
          picked = id;
        };
        for (const t of x.scene.targets) {
          picked = undefined;
          x.scene.tap(t.x, t.y);
          assert.equal(
            picked,
            t.id,
            `legal center ${w}/${preset}/${view}/${t.id}`,
          );
          assert.ok(
            t.x - t.visualRadius >= 0 && t.x + t.visualRadius <= x.scene.width,
          );
          assert.ok(
            t.y - t.visualRadius >= 127 &&
              t.y + t.visualRadius <= x.scene.height - 199,
          );
          legal++;
        }
        for (const b of [...x.scene.ballPositions, ...x.scene.ghostPositions]) {
          const ownTop = x.scene.targets.some(
            (t) => t.id === b.tube && Math.hypot(t.x - b.x, t.y - b.y) < 1e-7,
          );
          if (ownTop) continue;
          picked = undefined;
          x.scene.tap(b.x, b.y);
          const direct = x.scene.targets
            .filter((t) => Math.hypot(t.x - b.x, t.y - b.y) <= t.visualRadius)
            .sort(
              (a, c) =>
                Math.hypot(a.x - b.x, a.y - b.y) -
                Math.hypot(c.x - b.x, c.y - b.y),
            )[0];
          if (direct) {
            assert.equal(picked, direct.id);
            overlaps++;
          } else {
            assert.equal(
              picked,
              undefined,
              `blocked ${w}/${preset}/${view}/${b.id}`,
            );
            blocked++;
          }
        }
        x.game.pick = realPick;
        const t = x.scene.targets[0];
        const before = x.game.board.tubes.find((tube) => tube.id === t.id)!
          .balls.length;
        x.scene.tap(t.x, t.y);
        assert.equal(
          x.game.board.tubes.find((tube) => tube.id === t.id)!.balls.length,
          before - 1,
        );
        assert.equal(x.game.state.history.length, 1);
        const top = 127,
          bottom = x.scene.height - 199;
        for (let degree = 0; degree < 360; degree++) {
          const p = projection(
            x.game.board.side,
            x.scene.width,
            top,
            bottom,
            (degree * Math.PI) / 180,
            Math.max(...x.game.board.tubes.map((t) => t.capacity)),
          );
          for (const tube of x.game.board.tubes) {
            const q = p.point(tube);
            assert.ok(
              q.x - p.radius >= 9.99 && q.x + p.radius <= x.scene.width - 9.99,
              `horizontal ${w}/${preset}/${degree}`,
            );
            assert.ok(
              q.y - p.height >= top && q.y <= bottom,
              `vertical ${w}/${preset}/${degree}: ${q.y - p.height}..${q.y} within ${top}..${bottom}`,
            );
            assert.ok(p.ballRadius < p.radius);
            bounds++;
          }
        }
      }
  console.log({ legal, blocked, overlaps, bounds, configurations: 36 });
});
