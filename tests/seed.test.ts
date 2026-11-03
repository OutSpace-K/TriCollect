import { test } from "node:test";
import assert from "node:assert/strict";
import { nextSeed } from "../src/core/seed";
import { Controller } from "../src/controller";
import { Scene } from "../src/render/scene";
import { UnavailableAd } from "../src/platform/ads";
import { createLevel } from "../src/core/generation";
import { replay, invariant } from "../src/core/rules";
function setup(entropy: () => number) {
  const values = new Map<string, string>();
  const store = {
    get: (k: string) => values.get(k) ?? null,
    set: (k: string, v: string) => {
      values.set(k, v);
    },
  };
  const g = new Controller(
    () => 0,
    store,
    new UnavailableAd(),
    () => {},
    entropy,
  );
  const noop = () => {};
  const ctx = new Proxy(
    {
      createLinearGradient: () => ({ addColorStop: noop }),
      createRadialGradient: () => ({ addColorStop: noop }),
    },
    {
      get: (o, k) => (k in o ? o[k as keyof typeof o] : noop),
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D;
  const scene = new Scene(ctx, g, 320, 660);
  const tap = (id: string) => {
    scene.render();
    const b = scene.buttons.find((b) => b.id === id);
    assert.ok(b, id);
    scene.tap(b.x + b.w / 2, b.y + b.h / 2);
  };
  return { g, store, values, tap };
}
test("seed source handles throwing, invalid, constant and 32-bit wrap values", () => {
  for (const source of [
    () => NaN,
    () => Infinity,
    () => -1,
    () => 1,
    () => {
      throw Error("unavailable");
    },
  ]) {
    const first = nextSeed(new Set(), source);
    const second = nextSeed(new Set([first]), source);
    assert.ok(Number.isInteger(second) && second >= 0 && second <= 0xffffffff);
    assert.notEqual(first, second);
  }
  assert.equal(
    nextSeed(new Set([0xffffffff]), () => 1 - Number.EPSILON),
    0,
  );
});
test("only confirmed home starts consume entropy; cancel and resume preserve exact save", () => {
  let calls = 0;
  const x = setup(() => {
    calls++;
    return 0.25;
  });
  x.tap("start-menu");
  assert.equal(calls, 0);
  x.tap("home-dialog-close");
  assert.equal(calls, 0);
  x.tap("start-menu");
  x.tap("start-1");
  assert.equal(calls, 1);
  assert.equal(x.g.state.seed, 0x40000000);
  x.g.skipIntro();
  x.g.begin();
  x.g.home();
  const session = x.g.state.session,
    board = JSON.stringify(x.g.board),
    disk = JSON.stringify([...x.values]);
  x.tap("start-menu");
  x.tap("start-2");
  assert.equal(calls, 1);
  x.tap("home-dialog-close");
  assert.equal(JSON.stringify([...x.values]), disk);
  assert.equal(JSON.stringify(x.g.board), board);
  x.tap("resume");
  assert.equal(calls, 1);
  assert.equal(x.g.state.session, session);
  assert.equal(JSON.stringify(x.g.board), board);
  x.g.home();
  x.tap("start-menu");
  x.tap("start-2");
  x.tap("confirm-new");
  assert.equal(calls, 2);
  assert.notEqual(x.g.state.seed, 0x40000000);
  assert.equal(x.g.state.preset, 2);
});
test("constant entropy cannot repeat recent home seeds; reload excludes saved seed; explicit seeds remain reproducible", () => {
  const x = setup(() => 0);
  const seeds = new Set<number>();
  for (let i = 0; i < 30; i++) {
    x.g.startRandom(i % 3);
    assert.ok(!seeds.has(x.g.state.seed));
    seeds.add(x.g.state.seed);
  }
  const seed = x.g.state.seed;
  const g = new Controller(
    () => 0,
    x.store,
    new UnavailableAd(),
    () => {},
    () => seed / 0x100000000,
  );
  const resumed = JSON.stringify(g.resume!.board);
  g.continueSaved();
  assert.equal(JSON.stringify(g.board), resumed);
  g.home();
  g.startRandom(2);
  assert.notEqual(g.state.seed, seed);
  g.start(1, 123);
  assert.deepEqual(g.board, createLevel(1, 123).board);
});
test("300 random-entry seeds across all tiers retain replayable no-ad solutions", () => {
  const x = setup(() => 0.6180339887);
  for (let i = 0; i < 300; i++) {
    x.g.startRandom(i % 3);
    const l = createLevel(i % 3, x.g.state.seed);
    assert.deepEqual(x.g.board, l.board);
    const won = replay(l.board, l.witness);
    assert.equal(won.status, "won");
    assert.ok(invariant(won, l.witness.length));
  }
});
