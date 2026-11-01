import { createLevel } from "../src/core/generation";
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { decode, SAVE_KEY } from "../src/platform/storage";
async function boot(
  storage = new Map<string, string>(),
  unitsPerMs = 1000,
  brokenAudio = false,
) {
  let failRender: boolean | string = false;
  let saveDepth = 0;
  let frozenRaw: number | undefined;
  let microseconds = 0;
  let frame: () => void = () => {};
  const handlers: Record<string, Function> = {},
    labels: { s: string; x: number; y: number }[] = [];
  const noop = () => {};
  const ctx = new Proxy(
    {
      save: () => {
        saveDepth++;
      },
      restore: () => {
        saveDepth--;
      },
      fillText: (s: string, x: number, y: number) => {
        if (failRender === true || failRender === s) {
          failRender = false;
          throw Error("injected one-frame rendering fault");
        }
        labels.push({ s, x, y });
      },
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
    getPerformance: () => ({
      now: () => frozenRaw ?? (microseconds * unitsPerMs) / 1000,
    }),
    createInnerAudioContext: () => ({
      play: () => {
        if (brokenAudio) throw Error("injected audio failure");
      },
      stop: noop,
      onError: noop,
    }),
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
    Date: class extends Date {
      static now() {
        return microseconds / 1000;
      }
    },
    setTimeout: (fn: () => void, ms: number) => {
      queueMicrotask(() => {
        microseconds += ms * 1000;
        fn();
      });
      return 1;
    },
    clearTimeout,
  });
  await new Promise((resolve) => setImmediate(resolve));
  const render = () => {
    labels.length = 0;
    frame();
  };
  const tap = (text: string, exact = false) => {
    const l = [...labels]
      .reverse()
      .find((l) => (exact ? l.s === text : l.s.includes(text)));
    assert.ok(l, `button ${text}`);
    const t = { clientX: l.x, clientY: l.y - 5 + 24 };
    handlers.start({ touches: [t] });
    handlers.end({ changedTouches: [t] });
    render();
  };
  return {
    storage,
    canvasDepth: () => saveDepth,
    failNextRender: (text?: string) => {
      failRender = text ?? true;
    },
    freezeClock: () => {
      frozenRaw = (microseconds * unitsPerMs) / 1000;
    },
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
function beginRuntime(r: Awaited<ReturnType<typeof boot>>) {
  r.tap("初见");
  r.advance(1_000_000);
  r.tap("开始 ·");
}
test("prebuilt native game boots without DOM; wx microseconds normalized, touch and lifecycle work in mock runtime", async () => {
  const r = await boot();
  beginRuntime(r);
  r.advance(1_500_000);
  assert.equal(decode(r.storage.get(SAVE_KEY)!)!.remaining, 298500);
  r.hide();
  r.advance(50_000_000);
  r.show();
  assert.ok(r.labels.some((l) => l.s === "已暂停"));
  assert.equal(decode(r.storage.get(SAVE_KEY)!)!.remaining, 298500);
});
test("native bundle home restart/hide preserves 290000ms session and both save copies", async () => {
  const r = await boot();
  beginRuntime(r);
  r.advance(10_000_000);
  r.hide();
  const expected = decode(r.storage.get(SAVE_KEY)!)!;
  assert.equal(expected.remaining, 290000);
  const snapshot = new Map(r.storage);
  for (let restart = 0; restart < 3; restart++) {
    const home = await boot(r.storage);
    for (let i = 0; i < 5; i++) {
      home.hide();
      home.advance(50_000_000);
      home.show();
    }
    assert.deepEqual(r.storage, snapshot);
    assert.equal(decode(r.storage.get(SAVE_KEY)!)!.session, expected.session);
  }
  const resumed = await boot(r.storage);
  resumed.tap("继续上次球仓");
  resumed.tap("继续游戏");
  resumed.advance(1_000_000);
  resumed.hide();
  const actual = decode(r.storage.get(SAVE_KEY)!)!;
  assert.equal(actual.remaining, 289000);
  assert.equal(actual.session, expected.session);
});
test("native bundle manually ended non-winning session never revives on home hide/restart", async () => {
  const r = await boot();
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
    const home = await boot(r.storage);
    home.hide();
    home.show();
    assert.ok(!home.labels.some((l) => l.s === "继续上次球仓"));
    assert.deepEqual(r.storage, snapshot);
    assert.equal(decode(r.storage.get(SAVE_KEY)!)!.phase, "result");
  }
});

for (const units of [1, 1000])
  test(`native bundle ${units} units/ms: continuous picks, instant turns and all presets`, async () => {
    for (let preset = 0; preset < 3; preset++) {
      const r = await boot(new Map(), units);
      r.tap(["初见", "探索", "深入"][preset]);
      r.advance(1_000_000);
      r.tap("开始 ·");
      r.advance(10_000_000);
      r.hide();
      r.show();
      assert.equal(decode(r.storage.get(SAVE_KEY)!)!.remaining, 290000);
      r.tap("继续游戏");
      for (let rotation = 0; rotation < 6; rotation++) {
        r.tap("↷", true);
        assert.equal(
          decode(r.storage.get(SAVE_KEY)!)!.view,
          (rotation + 1) % 3,
        );
      }
      const level = createLevel(preset);
      for (let step = 0; step < level.witness.length; step++) {
        const index = level.board.tubes.findIndex(
          (t) => t.id === level.witness[step],
        );
        r.tap("选球", true);
        for (let i = 0; i < 3; i++) {
          const page = r.labels.find((l) => l.s.startsWith("换页"))!.s;
          if (Number(page.match(/(\d+)\//)![1]) === Math.floor(index / 10) + 1)
            break;
          r.tap("换页");
        }
        r.tap(String(index + 1), true);
        r.advance(250_000);
        assert.equal(
          decode(r.storage.get(SAVE_KEY)!)!.history.length,
          step + 1,
        );
      }
      assert.equal(decode(r.storage.get(SAVE_KEY)!)!.board.status, "won");
    }
  });
test("native RAF survives one rendering exception and audio exception never aborts pick", async () => {
  const r = await boot(new Map(), 1, true);
  beginRuntime(r);
  r.failNextRender("●");
  r.render();
  r.render();
  assert.ok(r.labels.some((l) => l.s === "已暂停"));
  assert.equal(r.canvasDepth(), 0);
  r.tap("继续游戏");
  r.tap("选球", true);
  r.tap("1", true);
  r.advance(250_000);
  assert.equal(decode(r.storage.get(SAVE_KEY)!)!.history.length, 1);
  r.tap("选球", true);
  r.tap("1", true);
  r.advance(250_000);
  assert.equal(decode(r.storage.get(SAVE_KEY)!)!.history.length, 2);
});

test("native frozen clock pauses instead of trapping input and can return home", async () => {
  const r = await boot(new Map(), 1);
  beginRuntime(r);
  r.freezeClock();
  r.advance(2_000_000);
  r.render();
  assert.ok(r.labels.some((l) => l.s === "已暂停"));
  r.tap("返回首页");
  assert.ok(r.labels.some((l) => l.s.includes("初见")));
});
