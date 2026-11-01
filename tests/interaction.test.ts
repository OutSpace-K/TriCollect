import { test } from "node:test";
import assert from "node:assert/strict";
import { Controller } from "../src/controller";
import { Scene } from "../src/render/scene";
import { CONFIG, DISPLAY_NAME } from "../src/config";
function setup() {
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
  game.start();
  game.skipIntro();
  game.begin();
  const scene = new Scene(ctx, game, 390, 844);
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
test("idle selectable spheres have no persistent outline; invalid sphere gives one bounded neutral pulse", () => {
  const x = setup(),
    target = x.scene.targets[0];
  assert.ok(x.scene.targets.length > 0);
  assert.ok(
    !x.strokes.some((s) => s.arc && (s.width === 2 || s.color === "#d64a2a")),
  );
  const wrong = x.scene.ballPositions.find(
    (b) => b.tube === target.id && b.slot === 3,
  )!;
  const board = JSON.stringify(x.game.board),
    remaining = x.game.state.remaining;
  x.scene.tap(wrong.x, wrong.y);
  assert.ok(x.scene.misclickFeedback);
  assert.equal(JSON.stringify(x.game.board), board);
  assert.equal(x.game.state.remaining, remaining);
  assert.ok(!("type" in x.scene.misclickFeedback));
  x.advance(CONFIG.misclickMs / 2);
  assert.ok(x.scene.misclickFeedback);
  x.advance(CONFIG.misclickMs / 2);
  assert.equal(x.scene.misclickFeedback, null);
  assert.equal(x.game.state.remaining, remaining - CONFIG.misclickMs);
  assert.equal(JSON.stringify(x.game.board), board);
});
test("background and UI taps never start feedback; valid pick and lifecycle clear transient feedback", () => {
  const x = setup();
  x.scene.tap(2, 180);
  assert.equal(x.scene.misclickFeedback, null);
  const undo = x.scene.buttons.find((b) => b.id === "undo")!;
  x.scene.tap(undo.x + 2, undo.y + 2);
  assert.equal(x.scene.misclickFeedback, null);
  const target = x.scene.targets[0],
    hidden = x.scene.ghostPositions.find((b) => b.tube === target.id)!;
  x.scene.tap(hidden.x, hidden.y);
  assert.ok(x.scene.misclickFeedback);
  assert.equal(x.game.state.history.length, 0);
  x.scene.tap(target.x, target.y);
  assert.equal(x.scene.misclickFeedback, null);
  assert.equal(x.game.state.history.length, 1);
  x.advance(240);
  x.scene.tap(hidden.x, hidden.y);
  assert.ok(x.scene.misclickFeedback);
  x.game.pause();
  x.scene.render();
  assert.equal(x.scene.misclickFeedback, null);
  x.game.begin();
  x.scene.render();
  x.scene.tap(hidden.x, hidden.y);
  assert.ok(x.scene.misclickFeedback);
  x.game.rotate(1);
  x.scene.render();
  assert.equal(x.scene.misclickFeedback, null);
  x.advance(250);
  const other = x.scene.ghostPositions.find((b) =>
    x.scene.targets.some((t) => t.id === b.tube),
  )!;
  x.scene.tap(other.x, other.y);
  assert.ok(x.scene.misclickFeedback);
  x.game.start();
  x.scene.render();
  assert.equal(x.scene.misclickFeedback, null);
});

test("confirmed display name and home effect lettering fit a narrow viewport", () => {
  assert.equal(DISPLAY_NAME, "转个“球”");
  const x = setup();
  assert.ok(x.labels.includes(DISPLAY_NAME));
  x.game.home();
  x.scene.width = 320;
  x.scene.height = 660;
  x.scene.render();
  for (const text of ["转个", "“", "球", "”"])
    assert.ok(x.labels.includes(text));
  for (const b of x.scene.buttons)
    assert.ok(b.x >= 0 && b.x + b.w <= 320 && b.y >= 0 && b.y + b.h <= 660);
});
