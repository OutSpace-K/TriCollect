import { test } from "node:test";
import assert from "node:assert/strict";
import { Controller } from "../src/controller";
import { NoAdsService, UnavailableAd } from "../src/platform/ads";
import { createLevel } from "../src/core/generation";
import { take, clone } from "../src/core/rules";
import { valid, restore } from "../src/platform/storage";
function setup() {
  let time = 0,
    requests = 0;
  const data = new Map<string, string>();
  const store = {
    get: (k: string) => data.get(k) ?? null,
    set: (k: string, v: string) => {
      data.set(k, v);
    },
  };
  const ads = new NoAdsService();
  ads.request = () => {
    requests++;
    throw Error("must not request ads");
  };
  const make = () => new Controller(() => time, store, ads);
  const g = make();
  g.start(0);
  g.skipIntro();
  g.begin();
  g.state.board = take(g.board, createLevel(0).witness[0], "fixture-pick");
  g.checkpoint();
  return {
    g,
    make,
    store,
    ads,
    requests: () => requests,
    advance: (ms: number) => {
      time += ms;
      g.tick();
    },
  };
}
test("no-ads service explicitly advertises free assistance, never a video completion", async () => {
  const ads = new NoAdsService();
  assert.equal(ads.free, true);
  assert.equal(ads.available, false);
  assert.equal(await ads.request(), "failed");
});
test("free lift is atomic, once per round, paused, durable, and return undo cannot duplicate it", async () => {
  const x = setup(),
    before = clone(x.g.board),
    remaining = x.g.state.remaining;
  await Promise.all([x.g.liftBall(), x.g.liftBall(), x.g.liftBall()]);
  assert.equal(x.requests(), 0);
  assert.equal(x.g.phase, "paused");
  assert.equal(x.g.board.tray.length, before.tray.length - 1);
  assert.equal(x.g.board.pocket?.[0].id, before.tray.at(-1)!.id);
  assert.equal(x.g.state.rewards.length, 1);
  assert.match(x.g.state.rewards[0].id, /:assist:/);
  assert.equal(x.g.canUndo, false);
  assert.ok(valid(x.g.state));
  x.advance(60000);
  assert.equal(x.g.state.remaining, remaining);
  const restored = x.make();
  restored.continueSaved();
  assert.equal(restored.phase, "paused");
  assert.equal(restored.canLift, false);
  assert.deepEqual(restored.board, x.g.board);
  restored.begin();
  restored.returnBall();
  assert.equal(restored.board.pocket?.length, 0);
  assert.equal(restored.canLift, false);
  restored.undo();
  assert.equal(restored.board.pocket?.length, 1);
  assert.equal(restored.canUndo, false);
  restored.returnBall();
  await restored.liftBall();
  assert.equal(restored.board.pocket?.length, 0);
  assert.equal(restored.state.rewards.length, 1);
  assert.ok(valid(restored.state));
});
test("free extension is expired-only, twice at 30 seconds, durable and paused until continued", async () => {
  const x = setup();
  await x.g.extend();
  assert.equal(x.g.state.extensions, 0);
  for (let i = 1; i <= 2; i++) {
    x.g.state.remaining = 0;
    x.g.phase = "expired";
    x.g.checkpoint();
    await Promise.all([x.g.extend(), x.g.extend(), x.g.extend()]);
    assert.equal(x.g.state.extensions, i);
    assert.equal(x.g.state.added, i * 30000);
    assert.equal(x.g.state.remaining, 30000);
    assert.equal(x.g.phase, "paused");
    x.advance(60000);
    assert.equal(x.g.state.remaining, 30000);
    assert.ok(valid(x.g.state));
    assert.equal(restore(x.store).save?.extensions, i);
    const restored = x.make();
    restored.continueSaved();
    assert.equal(restored.phase, "paused");
    assert.equal(restored.state.remaining, 30000);
    restored.begin();
    await restored.extend();
    assert.equal(restored.state.extensions, i);
    x.g.begin();
  }
  x.g.state.remaining = 0;
  x.g.phase = "expired";
  await x.g.extend();
  assert.equal(x.g.state.extensions, 2);
  assert.equal(x.g.state.remaining, 0);
  assert.equal(x.g.state.rewards.length, 2);
  assert.equal(x.requests(), 0);
});
test("new rounds reset free allowances and stale callbacks cannot grant anything", async () => {
  const x = setup();
  await x.g.liftBall();
  const oldSession = x.g.state.session,
    oldId = x.g.state.rewards[0].id;
  x.g.start(1);
  const newSession = x.g.state.session;
  assert.notEqual(newSession, oldSession);
  assert.equal(x.g.state.rewards.length, 0);
  x.g.reward(oldSession, oldId, "completed");
  assert.equal(x.g.state.rewards.length, 0);
  assert.equal(x.g.state.extensions, 0);
  assert.equal(x.g.board.pocket?.length ?? 0, 0);
  assert.equal(x.requests(), 0);
  assert.ok(valid(x.g.state));
});
test("unconfigured non-free ad service retains unavailable behavior", async () => {
  const x = setup();
  x.g.ads = new UnavailableAd();
  const before = clone(x.g.board);
  await x.g.liftBall();
  assert.deepEqual(x.g.board, before);
  assert.equal(x.g.state.rewards.length, 0);
  x.g.state.remaining = 0;
  x.g.phase = "expired";
  await x.g.extend();
  assert.equal(x.g.state.remaining, 0);
  assert.equal(x.g.state.extensions, 0);
});
