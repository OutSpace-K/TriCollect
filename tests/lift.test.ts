import { test } from "node:test";
import assert from "node:assert/strict";
import { Controller } from "../src/controller";
import { createLevel } from "../src/core/generation";
import { lift, returnPocket, take, invariant, clone } from "../src/core/rules";
import { valid, restore } from "../src/platform/storage";
import type { AdOutcome } from "../src/platform/ads";
function setup() {
  const data = new Map<string, string>();
  const store = {
    get: (k: string) => data.get(k) ?? null,
    set: (k: string, v: string) => {
      data.set(k, v);
    },
  };
  let finish!: (outcome: AdOutcome) => void;
  const ads = {
    available: true,
    label: "test only",
    request: () =>
      new Promise<AdOutcome>((r) => {
        finish = r;
      }),
  };
  const g = new Controller(() => 0, store, ads);
  g.start();
  g.skipIntro();
  g.begin();
  const level = createLevel(0);
  g.state.board = take(g.board, level.witness[0], "first");
  return { g, store, ads, finish: (o: AdOutcome) => finish(o) };
}
test("lift cancelled/failed/unconfigured keeps exact board, time and retry eligibility", async () => {
  for (const outcome of ["cancelled", "failed"] as const) {
    const x = setup(),
      before = clone(x.g.board),
      time = x.g.state.remaining;
    const pending = x.g.liftBall();
    x.finish(outcome);
    await pending;
    assert.deepEqual(x.g.board, before);
    assert.equal(x.g.state.remaining, time);
    assert.equal(x.g.state.extensions, 0);
    assert.ok(valid(x.g.state));
    x.g.begin();
    assert.ok(x.g.canLift);
  }
  const x = setup();
  x.ads.available = false;
  await x.g.liftBall();
  assert.equal(x.g.state.rewards.length, 0);
});
test("completed lift is once-only, session fenced, restart durable and free return undoable", async () => {
  const x = setup(),
    before = clone(x.g.board),
    session = x.g.state.session;
  const pending = x.g.liftBall();
  await x.g.liftBall();
  x.g.start(1);
  assert.equal(x.g.state.session, session);
  x.finish("completed");
  await pending;
  const r = x.g.state.rewards[0],
    after = clone(x.g.board);
  x.g.reward(session, r.id, "completed");
  x.g.reward("stale", r.id, "completed");
  assert.deepEqual(x.g.board, after);
  assert.equal(x.g.state.extensions, 0);
  assert.equal(x.g.board.pocket?.[0].id, before.tray[0].id);
  assert.ok(valid(x.g.state));
  const restored = new Controller(() => 0, x.store, x.ads);
  restored.continueSaved();
  restored.begin();
  assert.deepEqual(restored.board, after);
  assert.equal(restored.canLift, false);
  restored.returnBall();
  assert.equal(restored.board.pocket?.length, 0);
  assert.deepEqual(restored.board.tray, before.tray);
  restored.undo();
  assert.deepEqual(restored.board, after);
  assert.equal(restored.canUndo, false);
  restored.returnBall();
  assert.ok(valid(restored.state));
});
test("restart while requested fails pending reward without moving a ball", () => {
  const x = setup(),
    before = clone(x.g.board);
  void x.g.liftBall();
  assert.equal(restore(x.store).save?.rewards[0].state, "requested");
  const g = new Controller(() => 0, x.store, x.ads);
  g.continueSaved();
  assert.equal(g.state.rewards[0].state, "failed");
  assert.deepEqual(g.board, before);
  g.reward(g.state.session, g.state.rewards[0].id, "completed");
  assert.deepEqual(g.board, before);
});
test("300 seeded rounds across three tiers preserve identities and finish with held ball", () => {
  for (let preset = 0; preset < 3; preset++)
    for (let seed = 0; seed < 100; seed++) {
      const l = createLevel(preset, seed);
      let b = take(l.board, l.witness[0], "first");
      b = lift(b, "lift");
      assert.ok(invariant(b, l.witness.length));
      // Leave the first ball held until its two matching partners wait in the tray.
      let returned = false;
      for (let i = 1; i < l.witness.length; i++) {
        b = take(b, l.witness[i], `pick-${i}`);
        if (
          !returned &&
          b.tray.filter((x) => x.type === b.pocket![0].type).length === 2
        ) {
          b = returnPocket(b, "return");
          returned = true;
        }
        assert.ok(invariant(b, l.witness.length), `${preset}:${seed}:${i}`);
      }
      assert.ok(returned);
      assert.equal(b.status, "won");
    }
});

test("full tray lift reopens play; immediate free return can block and single undo restores pocket", async () => {
  const x = setup();
  for (let turn = 0; turn < 1000 && x.g.board.status !== "blocked"; turn++) {
    const { available } = await import("../src/core/rules");
    const ids = [...available(x.g.board)];
    ids.sort((a, b) => {
      const count = (id: string) =>
        x.g.board.tray.filter(
          (ball) =>
            ball.type ===
            x.g.board.tubes.find((t) => t.id === id)!.balls.at(-1)!.type,
        ).length;
      return count(a) - count(b);
    });
    x.g.state.board = take(x.g.board, ids[0], `walk-${turn}`);
  }
  assert.equal(x.g.board.status, "blocked");
  x.g.phase = "blocked";
  const before = clone(x.g.board),
    pending = x.g.liftBall();
  x.finish("completed");
  await pending;
  assert.equal(x.g.board.tray.length, 6);
  assert.equal(x.g.board.status, "playing");
  x.g.begin();
  x.g.returnBall();
  assert.equal(x.g.phase, "blocked");
  assert.deepEqual(x.g.board.tray, before.tray);
  x.g.undo();
  assert.equal(x.g.phase, "active");
  assert.equal(x.g.board.pocket?.length, 1);
  assert.ok(valid(x.g.state));
});
