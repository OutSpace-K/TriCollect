import { test } from "node:test";
import assert from "node:assert/strict";
import { Controller } from "../src/controller";
import { CONFIG } from "../src/config";
import { createLevel } from "../src/core/generation";
import { clone } from "../src/core/rules";
import {
  encode,
  decode,
  SAVE_KEY,
  restore,
  save,
} from "../src/platform/storage";
import { WeChatAd, type Video, type AdOutcome } from "../src/platform/ads";
function setup() {
  let time = 0;
  const data = new Map<string, string>();
  let complete: (r: AdOutcome) => void = () => {};
  const store = {
    get: (k: string) => data.get(k) ?? null,
    set: (k: string, v: string) => {
      data.set(k, v);
    },
  };
  const ads = {
    available: true,
    label: "test",
    request: () => new Promise<AdOutcome>((r) => (complete = r)),
  };
  const g = new Controller(() => time, store, ads);
  return {
    g,
    data,
    store,
    advance: (ms: number) => (time += ms),
    finish: (r: AdOutcome) => complete(r),
  };
}
function start(g: Controller) {
  g.start();
  g.skipIntro();
  g.begin();
}
test("ready/intro never consume fixed 300s, all presets share base", () => {
  const x = setup();
  for (let p = 0; p < 3; p++) {
    x.g.start(p);
    x.advance(10000);
    x.g.tick();
    assert.equal(x.g.state.remaining, 300000);
    x.g.begin();
    x.advance(1000);
    x.g.tick();
    assert.equal(x.g.state.remaining, 299000);
  }
});
test("pause/background hide, resume remains paused, no wall time or frame dependence", () => {
  const x = setup();
  start(x.g);
  x.advance(1234);
  x.g.hide();
  const remaining = x.g.state.remaining;
  assert.equal(remaining, 298766);
  x.advance(1000000);
  x.g.tick();
  assert.equal(x.g.phase, "paused");
  assert.equal(x.g.state.remaining, remaining);
  x.g.begin();
  x.advance(1000);
  x.g.tick();
  assert.equal(x.g.state.remaining, remaining - 1000);
});
test("rotation queues net turns, completes in bounded time and preserves board", () => {
  const x = setup();
  start(x.g);
  const board = clone(x.g.board);
  for (let i = 0; i < 30; i++) {
    x.g.rotate(1);
    assert.equal(x.g.phase, "rotating");
    assert.equal(x.g.state.view, (i + 1) % 3);
  }
  for (let i = 0; i < 3; i++) {
    x.advance(250);
    x.g.tick();
  }
  assert.equal(x.g.phase, "active");
  assert.deepEqual(x.g.board, board);
  x.g.pick("0,0");
  assert.equal(x.g.state.history.length, 1);
});
test("settlement lock rejects rapid duplicate taps", () => {
  const x = setup();
  start(x.g);
  x.g.pick("0,0");
  const b = clone(x.g.board);
  x.g.pick("0,0");
  assert.deepEqual(x.g.board, b);
});
test("undo restores score and balls without refunding time or copying ad ledger", () => {
  const x = setup();
  start(x.g);
  const b = clone(x.g.board);
  x.advance(1000);
  x.g.pick("0,0");
  x.advance(240);
  x.g.tick();
  x.g.undo();
  assert.deepEqual(x.g.board, b);
  assert.equal(x.g.state.remaining, 299000);
  x.g.pick("0,0");
  assert.equal(x.g.state.history.length, 1);
});
test("deadline processed before input; no post-zero move", () => {
  const x = setup();
  start(x.g);
  const b = clone(x.g.board);
  x.advance(CONFIG.baseMs);
  x.g.pick("0,0");
  assert.equal(x.g.phase, "expired");
  assert.deepEqual(x.g.board, b);
});
test("last legal pick wins before subsequent clock expiration", () => {
  const x = setup();
  start(x.g);
  const l = createLevel(0);
  for (const [step, id] of l.witness.entries()) {
    while (x.g.state.view !== l.views[step]) {
      x.g.rotate(1);
      x.advance(250);
      x.g.tick();
    }
    x.g.pick(id);
    x.advance(240);
    x.g.tick();
  }
  assert.equal(x.g.phase, "result");
  assert.equal(x.g.board.status, "won");
  x.advance(999999);
  x.g.tick();
  assert.equal(x.g.phase, "result");
});
test("ad completion exactly once, persists ledger, survives undo and reload", async () => {
  const x = setup();
  start(x.g);
  x.advance(CONFIG.baseMs);
  x.g.tick();
  const request = x.g.extend();
  const r = x.g.state.rewards[0];
  x.finish("completed");
  await request;
  assert.equal(x.g.state.remaining, 30000);
  x.g.reward(r.session, r.id, "completed");
  assert.equal(x.g.state.remaining, 30000);
  assert.equal(x.g.state.extensions, 1);
  assert.ok(decode(x.data.get(SAVE_KEY)!));
  const restored = new Controller(() => 0, x.store, x.g.ads);
  restored.continueSaved();
  assert.equal(restored.state.extensions, 1);
  assert.equal(restored.phase, "paused");
});
test("cancelled/failed ad preserves board and time; old session never rewarded", async () => {
  for (const out of ["cancelled", "failed"] as const) {
    const x = setup();
    start(x.g);
    x.advance(CONFIG.baseMs);
    x.g.tick();
    const b = clone(x.g.board);
    const request = x.g.extend();
    const r = clone(x.g.state.rewards[0]);
    x.finish(out);
    await request;
    assert.deepEqual(x.g.board, b);
    assert.equal(x.g.state.remaining, 0);
    assert.equal(x.g.phase, "expired");
    x.g.end();
    x.g.start(1);
    x.g.reward(r.session, r.id, "completed");
    assert.equal(x.g.state.extensions, 0);
  }
});
test("pending ad restore never grants reward", () => {
  const x = setup();
  start(x.g);
  x.advance(CONFIG.baseMs);
  x.g.tick();
  void x.g.extend();
  const g = new Controller(() => 0, x.store, x.g.ads);
  g.continueSaved();
  assert.equal(g.phase, "expired");
  assert.equal(g.state.extensions, 0);
  assert.equal(g.state.rewards[0].state, "failed");
});
test("corrupt/unknown/inconsistent saves rejected and last good backup recovered", () => {
  const x = setup();
  start(x.g);
  x.g.pick("0,0");
  const good = x.data.get(SAVE_KEY)!;
  assert.ok(decode(good));
  assert.equal(decode(good.slice(5)), null);
  const bad = clone(x.g.state);
  bad.schema = 99 as 1;
  assert.equal(decode(encode(bad)), null);
  bad.schema = 1;
  bad.board.tray.push(clone(bad.board.tray[0]));
  assert.equal(decode(encode(bad)), null);
  x.data.set(SAVE_KEY, "broken");
  assert.ok(restore(x.store).save);
});
test("failed storage write never crashes gameplay", () => {
  const x = setup();
  const g = new Controller(
    () => 0,
    {
      get: () => null,
      set: () => {
        throw Error("full");
      },
    },
    x.g.ads,
  );
  assert.doesNotThrow(() => start(g));
  assert.match(g.message, /存档写入失败/);
});
test("WeChat adapter only isEnded true grants, load/show do not", async () => {
  let close: ((r: { isEnded?: boolean }) => void) | undefined;
  let error: ((r: unknown) => void) | undefined;
  let shown = 0;
  const v: Video = {
    load: async () => {},
    show: async () => {
      shown++;
    },
    onClose: (fn) => {
      close = fn;
    },
    offClose: () => {},
    onError: (fn) => {
      error = fn;
    },
    offError: () => {},
  };
  const ad = new WeChatAd(v);
  let result: AdOutcome | undefined;
  const p = ad.request().then((x) => (result = x));
  await new Promise((r) => setImmediate(r));
  assert.equal(shown, 1);
  assert.equal(result, undefined);
  close!({ isEnded: true });
  close!({ isEnded: true });
  error!({});
  await p;
  assert.equal(result, "completed");
  const p2 = ad.request();
  close!({});
  assert.equal(await p2, "cancelled");
});
test("WeChat rejection fails without rewards and listeners removed", async () => {
  let removed = 0;
  const v: Video = {
    load: async () => {
      throw Error();
    },
    show: async () => {},
    onClose: () => {},
    offClose: () => {
      removed++;
    },
    onError: () => {},
    offError: () => {
      removed++;
    },
  };
  assert.equal(await new WeChatAd(v).request(), "failed");
  assert.equal(removed, 2);
});
test("two-extension limit enforced and no final result revival", async () => {
  const x = setup();
  start(x.g);
  for (let i = 0; i < 2; i++) {
    x.advance(CONFIG.baseMs);
    x.g.tick();
    const p = x.g.extend();
    x.finish("completed");
    await p;
    x.g.begin();
  }
  x.advance(CONFIG.baseMs);
  x.g.tick();
  const before = x.g.state.rewards.length;
  await x.g.extend();
  assert.equal(x.g.state.rewards.length, before);
  assert.equal(x.g.state.extensions, 2);
  x.g.end();
  const r = x.g.state.rewards[0];
  x.g.reward(r.session, r.id, "completed");
  assert.equal(x.g.phase, "result");
  assert.equal(x.g.state.remaining, 0);
});
test("unclaimed home lifecycle never replaces unfinished main or backup across restarts", () => {
  const x = setup();
  start(x.g);
  x.advance(4321);
  x.g.pick("0,0");
  x.advance(CONFIG.animationMs);
  x.g.tick();
  x.g.hide();
  const expected = decode(x.data.get(SAVE_KEY)!)!;
  const storageBefore = new Map(x.data);
  for (let restart = 0; restart < 3; restart++) {
    const home = new Controller(() => 1000000 + restart, x.store, x.g.ads);
    assert.equal(home.phase, "home");
    assert.notEqual(home.state.session, expected.session);
    for (let cycle = 0; cycle < 5; cycle++) {
      home.hide();
      home.tick();
    }
    assert.deepEqual(x.data, storageBefore);
    assert.deepEqual(home.resume, expected);
  }
  const reloaded = new Controller(() => 0, x.store, x.g.ads);
  reloaded.continueSaved();
  assert.deepEqual(reloaded.state, expected);
  assert.equal(reloaded.phase, "paused");
});
test("empty home and repeated home navigation do not create or replace a save", () => {
  const x = setup();
  x.g.hide();
  x.g.checkpoint();
  assert.equal(x.data.size, 0);
  start(x.g);
  x.g.pick("0,0");
  x.g.home();
  const expected = clone(x.g.resume),
    storageBefore = new Map(x.data);
  x.g.home();
  x.g.hide();
  x.g.checkpoint();
  assert.deepEqual(x.g.resume, expected);
  assert.deepEqual(x.data, storageBefore);
});
test("explicit new game replaces a pending resume, then lifecycle saves that chosen session", () => {
  const x = setup();
  start(x.g);
  x.g.pick("0,0");
  x.g.hide();
  const previous = x.g.state.session;
  const reloaded = new Controller(() => 0, x.store, x.g.ads);
  assert.ok(reloaded.resume);
  reloaded.start(1);
  assert.equal(reloaded.resume, null);
  assert.notEqual(reloaded.state.session, previous);
  reloaded.hide();
  assert.equal(decode(x.data.get(SAVE_KEY)!)!.session, reloaded.state.session);
  assert.equal(decode(x.data.get(SAVE_KEY)!)!.preset, 1);
});
test("manually ended non-winning round remains final through home hide and restart", () => {
  const x = setup();
  start(x.g);
  x.advance(10000);
  x.g.end();
  assert.equal(x.g.board.status, "playing");
  assert.equal(x.g.state.phase, "result");
  x.g.home();
  const expected = new Map(x.data);
  for (let i = 0; i < 5; i++) {
    x.g.hide();
    x.g.home();
  }
  assert.deepEqual(x.data, expected);
  assert.equal(x.g.resume, null);
  for (let i = 0; i < 3; i++) {
    const reloaded = new Controller(() => 0, x.store, x.g.ads);
    reloaded.hide();
    assert.equal(reloaded.resume, null);
    assert.deepEqual(x.data, expected);
  }
});

test("rotation hides input, pause keeps requested face and restart cancels queued turns", () => {
  const x = setup();
  start(x.g);
  x.g.pick("0,1");
  assert.equal(x.g.state.history.length, 0);
  x.g.rotate(1);
  x.advance(100);
  x.g.tick();
  assert.equal(x.g.presentationView, 0);
  x.g.pick("0,0");
  assert.equal(x.g.state.history.length, 0);
  x.g.rotate(1);
  x.g.pause();
  assert.equal(x.g.state.view, 2);
  assert.equal(x.g.presentationView, 2);
  x.g.begin();
  x.g.rotate(-1);
  x.g.start();
  x.g.skipIntro();
  x.g.begin();
  x.advance(1000);
  x.g.tick();
  assert.equal(x.g.state.view, 0);
  assert.equal(x.g.phase, "active");
});
test("hints never reveal another face and incompatible old rules do not resume", () => {
  const x = setup();
  start(x.g);
  for (let view = 0; view < 3; view++) {
    x.g.hintNow();
    if (x.g.hint) assert.ok(x.g.visible.has(x.g.hint));
    x.g.rotate(1);
    x.advance(250);
    x.g.tick();
  }
  const old = clone(x.g.state);
  old.rule = "tricollect-1";
  assert.equal(decode(encode(old)), null);
});
test("corrupted temporary readback cannot replace the committed save", () => {
  const x = setup();
  start(x.g);
  const committed = x.data.get(SAVE_KEY);
  const broken = {
    get: (key: string) => (key.endsWith(".tmp") ? "corrupt" : x.store.get(key)),
    set: x.store.set,
  };
  assert.throws(() => save(broken, x.g.state), /readback/);
  assert.equal(x.data.get(SAVE_KEY), committed);
});
