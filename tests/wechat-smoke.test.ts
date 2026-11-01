import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { decode, SAVE_KEY } from "../src/platform/storage";
function boot(storage = new Map<string, string>()) {
  let microseconds = 0;
  let frame: () => void = () => {};
  const handlers: Record<string, Function> = {},
    labels: { s: string; x: number; y: number }[] = [];
  const noop = () => {};
  const ctx = new Proxy(
    {
      fillText: (s: string, x: number, y: number) => labels.push({ s, x, y }),
      createLinearGradient: () => ({ addColorStop: noop }),
      createRadialGradient: () => ({ addColorStop: noop }),
    },
    {
      get: (target, key) =>
        key in target ? target[key as keyof typeof target] : noop,
      set: (target, key, value) => {
        (target as Record<string | symbol, unknown>)[key] = value;
        return true;
      },
    },
  );
  const wx = {
    createCanvas: () => ({ getContext: () => ctx }),
    getWindowInfo: () => ({
      windowWidth: 390,
      windowHeight: 844,
      pixelRatio: 2,
      safeArea: { top: 24, bottom: 820 },
    }),
    getPerformance: () => ({ now: () => microseconds }),
    createInnerAudioContext: () => ({ play: noop, stop: noop, onError: noop }),
    getStorageSync: (k: string) => storage.get(k),
    setStorageSync: (k: string, v: string) => storage.set(k, v),
    onTouchStart: (f: Function) => (handlers.start = f),
    onTouchEnd: (f: Function) => (handlers.end = f),
    onTouchCancel: (f: Function) => (handlers.cancel = f),
    onHide: (f: Function) => (handlers.hide = f),
    onShow: (f: Function) => (handlers.show = f),
  };
  const source = readFileSync(
    process.env.TRICOLLECT_TEST_BUNDLE || "dist/wechat/game.js",
    "utf8",
  );
  assert.ok(!source.includes("window.confirm"));
  assert.ok(!source.includes("localStorage"));
  assert.ok(!source.includes("MockAd"));
  vm.runInNewContext(source, {
    wx,
    requestAnimationFrame: (fn: () => void) => (frame = fn),
    console,
    setTimeout,
    clearTimeout,
  });
  const render = () => {
    labels.length = 0;
    frame();
  };
  const tap = (text: string) => {
    const l = labels.find((l) => l.s.includes(text));
    assert.ok(l, `button ${text}`);
    const t = { clientX: l.x, clientY: l.y - 5 + 24 };
    handlers.start({ touches: [t] });
    handlers.end({ changedTouches: [t] });
    render();
  };
  return {
    storage,
    labels,
    tap,
    render,
    advance: (us: number) => {
      microseconds += us;
      render();
    },
    hide: () => handlers.hide(),
    show: () => {
      handlers.show();
      render();
    },
  };
}
function beginRuntime(r: ReturnType<typeof boot>) {
  r.tap("初见");
  r.advance(1_000_000);
  r.tap("开始 ·");
}
test("prebuilt native game boots without DOM; wx microseconds normalized, touch and lifecycle work in mock runtime", () => {
  const r = boot();
  beginRuntime(r);
  r.advance(1_500_000);
  assert.equal(decode(r.storage.get(SAVE_KEY)!)!.remaining, 298500);
  r.hide();
  r.advance(50_000_000);
  r.show();
  assert.ok(r.labels.some((l) => l.s === "已暂停"));
  assert.equal(decode(r.storage.get(SAVE_KEY)!)!.remaining, 298500);
});
test("native bundle home restart/hide preserves 290000ms session and both save copies", () => {
  const r = boot();
  beginRuntime(r);
  r.advance(10_000_000);
  r.hide();
  const expected = decode(r.storage.get(SAVE_KEY)!)!;
  assert.equal(expected.remaining, 290000);
  const snapshot = new Map(r.storage);
  for (let restart = 0; restart < 3; restart++) {
    const home = boot(r.storage);
    for (let i = 0; i < 5; i++) {
      home.hide();
      home.advance(50_000_000);
      home.show();
    }
    assert.deepEqual(r.storage, snapshot);
    assert.equal(decode(r.storage.get(SAVE_KEY)!)!.session, expected.session);
  }
  const resumed = boot(r.storage);
  resumed.tap("继续上次球仓");
  resumed.tap("继续游戏");
  resumed.advance(1_000_000);
  resumed.hide();
  const actual = decode(r.storage.get(SAVE_KEY)!)!;
  assert.equal(actual.remaining, 289000);
  assert.equal(actual.session, expected.session);
});
test("native bundle manually ended non-winning session never revives on home hide/restart", () => {
  const r = boot();
  beginRuntime(r);
  r.advance(10_000_000);
  r.hide();
  r.render();
  r.tap("结束并保留");
  assert.equal(decode(r.storage.get(SAVE_KEY)!)!.phase, "result");
  assert.equal(decode(r.storage.get(SAVE_KEY)!)!.board.status, "playing");
  r.tap("返回首页");
  const snapshot = new Map(r.storage);
  for (let i = 0; i < 5; i++) {
    r.hide();
    r.show();
  }
  assert.deepEqual(r.storage, snapshot);
  for (let restart = 0; restart < 3; restart++) {
    const home = boot(r.storage);
    home.hide();
    home.show();
    assert.ok(!home.labels.some((l) => l.s === "继续上次球仓"));
    assert.deepEqual(r.storage, snapshot);
    assert.equal(decode(r.storage.get(SAVE_KEY)!)!.phase, "result");
  }
});
