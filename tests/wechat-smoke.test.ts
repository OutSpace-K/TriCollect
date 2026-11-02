import { projection } from "../src/render/projection";
import { faceVisible } from "../src/core/rules";
import { createLevel } from "../src/core/generation";
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync, writeFileSync } from "node:fs";
import { decode, SAVE_KEY } from "../src/platform/storage";
async function boot(
  storage = new Map<string, string>(),
  unitsPerMs = 1000,
  brokenAudio = false,
  live = false,
  initiallyFrozen = false,
  brokenImage = false,
) {
  const images: string[] = [];
  let backgroundDraws = 0;
  let failRender: boolean | string = false;
  let saveDepth = 0;
  let frozenRaw: number | undefined = initiallyFrozen ? 0 : undefined;
  const liveStart = performance.now();
  const rawMs = () =>
    live ? performance.now() - liveStart : microseconds / 1000;
  const circles: { x: number; y: number; r: number }[] = [];
  const topBalls = new Map<string, { x: number; y: number; r: number }>();
  const paintedBalls: { x: number; y: number; r: number }[] = [];
  const rings: { x: number; y: number; r: number }[] = [];
  let lastArc: { x: number; y: number; r: number } | undefined;
  let microseconds = 0;
  let frame: () => void = () => {};
  const handlers: Record<string, Function> = {},
    labels: { s: string; x: number; y: number; color: unknown }[] = [];
  const noop = () => {};
  const ctx = new Proxy(
    {
      drawImage: () => {
        backgroundDraws++;
      },
      save: () => {
        saveDepth++;
      },
      restore: () => {
        saveDepth--;
      },
      beginPath: () => {
        lastArc = undefined;
      },
      arc: (x: number, y: number, r: number) => {
        lastArc = { x, y, r };
        circles.push(lastArc);
      },
      stroke: () => {
        if (
          lastArc &&
          (ctx as unknown as { lineWidth: number }).lineWidth === 2
        )
          rings.push(lastArc);
      },
      fillText: (s: string, x: number, y: number) => {
        if (failRender === true || failRender === s) {
          failRender = false;
          throw Error("injected one-frame rendering fault");
        }
        if (["●", "◆", "▲", "✚", "■", "★", "♥"].includes(s)) {
          const ball = [...circles]
            .reverse()
            .find((b) => Math.abs(b.x - x) < 0.01 && y > b.y && y - b.y < b.r);
          if (ball) paintedBalls.push(ball);
        }

        labels.push({
          s,
          x,
          y,
          color: (ctx as unknown as { fillStyle: unknown }).fillStyle,
        });
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
  const audioPlayers: {
    src: string;
    loop: boolean;
    volume: number;
    plays: number;
    pauses: number;
    playing: boolean;
    play: () => void;
    pause: () => void;
    stop: () => void;
    onError: (f: () => void) => void;
  }[] = [];
  const wx = {
    createImage: () => {
      const image = {
        onload: () => {},
        onerror: () => {},
        set src(value: string) {
          images.push(value);
          queueMicrotask(() =>
            brokenImage ? image.onerror() : image.onload(),
          );
        },
      };
      return image;
    },
    createCanvas: () => ({ getContext: () => ctx }),
    getWindowInfo: () => ({
      windowWidth: 390,
      windowHeight: 844,
      pixelRatio: 2,
      safeArea: { top: 24, bottom: 820 },
    }),
    getMenuButtonBoundingClientRect: () => ({
      top: 32,
      bottom: 64,
      left: 290,
      right: 380,
      width: 90,
      height: 32,
    }),
    getPerformance: () => ({
      now: () => frozenRaw ?? rawMs() * unitsPerMs,
    }),
    createInnerAudioContext: () => {
      const player = {
        src: "",
        loop: false,
        volume: 1,
        plays: 0,
        pauses: 0,
        playing: false,
        play() {
          if (brokenAudio) throw Error("injected audio failure");
          this.plays++;
          this.playing = true;
        },
        pause() {
          this.pauses++;
          this.playing = false;
        },
        stop() {
          this.playing = false;
        },
        onError: noop,
      };
      audioPlayers.push(player);
      return player;
    },
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
        return live ? Date.now() : microseconds / 1000;
      }
    },
    setTimeout: (fn: () => void, ms: number) => {
      if (live) return setTimeout(fn, ms);
      queueMicrotask(() => {
        microseconds += ms * 1000;
        fn();
      });
      return 1;
    },
    clearTimeout,
  });
  await new Promise((resolve) => setImmediate(resolve));
  if (live) {
    const deadline = Date.now() + 2000;
    while (
      !handlers.start &&
      !labels.some((l) => l.s.includes("时钟无法")) &&
      Date.now() < deadline
    )
      await new Promise((r) => setTimeout(r, 5));
  }
  const render = () => {
    labels.length = 0;
    circles.length = 0;
    rings.length = 0;
    topBalls.clear();
    paintedBalls.length = 0;
    frame();
    const saved = decode(storage.get(SAVE_KEY) ?? "");
    if (saved) {
      const layout = projection(
        saved.board.side,
        390,
        147,
        748 - 173,
        (saved.view * Math.PI * 2) / 3,
      );
      const visible = faceVisible(saved.board, saved.view);
      saved.board.tubes.forEach((t, i) => {
        if (!visible.has(t.id)) return;
        const p = layout.point(t),
          y = p.y - layout.ballRadius - 6 - (t.balls.length - 1) * layout.step;
        const ball = paintedBalls.find(
          (b) => Math.abs(b.x - p.x) < 0.01 && Math.abs(b.y - y) < 0.01,
        );
        if (ball) topBalls.set(String(i + 1), ball);
      });
    }
  };
  const tap = (text: string, exact = false) => {
    const l =
      [...labels].reverse().find((l) => l.s === text) ??
      (!exact
        ? [...labels].reverse().find((l) => l.s.includes(text))
        : undefined);
    assert.ok(l, `button ${text}`);
    const t = { clientX: l.x, clientY: l.y - 5 + 72 };
    handlers.start({ touches: [t] });
    handlers.end({ changedTouches: [t] });
    render();
  };
  return {
    storage,
    images,
    backgroundDraws: () => backgroundDraws,
    rings,
    topBalls,
    tapTube: (index: number) => {
      const ring = topBalls.get(String(index));
      assert.ok(ring, `painted top ball ${index}`);
      assert.equal(rings.length, 0, "no permanent selection ring");
      const t = { clientX: ring.x, clientY: ring.y + 72 };
      handlers.start({ touches: [t] });
      handlers.end({ changedTouches: [t] });
      render();
    },
    audioPlayers,
    canvasDepth: () => saveDepth,
    failNextRender: (text?: string) => {
      failRender = text ?? true;
    },
    freezeClock: () => {
      frozenRaw = rawMs() * unitsPerMs;
    },
    labels,
    circles,
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
  assert.ok(r.labels.some((l) => l.s === "休息一下"));
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
  resumed.tap("继续上次");
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
  r.tap("结束本局");
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
    assert.ok(!home.labels.some((l) => l.s === "继续上次"));
    assert.deepEqual(r.storage, snapshot);
    assert.equal(decode(r.storage.get(SAVE_KEY)!)!.phase, "result");
  }
});

for (const units of [1, 1000])
  test(`native bundle ${units} units/ms: continuous picks, animated turns and all presets`, async () => {
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
        r.tap("→", true);
        r.advance(250_000);
        assert.equal(
          decode(r.storage.get(SAVE_KEY)!)!.view,
          (3 - ((rotation + 1) % 3)) % 3,
        );
      }
      const level = createLevel(preset);
      for (let step = 0; step < level.witness.length; step++) {
        const index = level.board.tubes.findIndex(
          (t) => t.id === level.witness[step],
        );
        while (decode(r.storage.get(SAVE_KEY)!)!.view !== level.views[step]) {
          r.tap("→", true);
          r.advance(250_000);
        }
        r.tapTube(index + 1);
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
  assert.ok(r.labels.some((l) => l.s === "休息一下"));
  assert.equal(r.canvasDepth(), 0);
  r.tap("继续游戏");
  r.tapTube(1);
  r.advance(250_000);
  assert.equal(decode(r.storage.get(SAVE_KEY)!)!.history.length, 1);
  r.tapTube(1);
  r.advance(250_000);
  assert.equal(decode(r.storage.get(SAVE_KEY)!)!.history.length, 2);
});

test("native frozen clock pauses instead of trapping input and can return home", async () => {
  const r = await boot(new Map(), 1);
  beginRuntime(r);
  r.freezeClock();
  r.advance(2_000_000);
  r.render();
  assert.ok(r.labels.some((l) => l.s === "休息一下"));
  r.tap("返回首页");
  assert.ok(r.labels.some((l) => l.s.includes("初见")));
});

const animationReports: unknown[] = [];
async function driveUntil(
  r: Awaited<ReturnType<typeof boot>>,
  condition: () => boolean,
  budgetMs: number,
) {
  const start = Date.now();
  while (!condition() && Date.now() - start < budgetMs) {
    await new Promise((resolve) => setTimeout(resolve, 16));
    r.render();
  }
  assert.ok(
    condition(),
    `animation/lifecycle deadline exceeded: ${budgetMs}ms`,
  );
  return Date.now() - start;
}
for (const units of [1, 1000])
  test(`native animation wall-clock deadlines at ${units} units/ms`, async () => {
    const r = await boot(new Map(), units, false, true);
    r.tap("初见");
    const introMs = await driveUntil(
      r,
      () => r.labels.some((l) => l.s.includes("开始 ·")),
      1600,
    );
    assert.ok(introMs >= 800 && introMs <= 1400);
    r.tap("开始 ·");
    r.tapTube(1);
    const movingCircles = r.circles.map((c) => ({ ...c }));
    const transferMs = await driveUntil(
      r,
      () => r.labels.some((l) => l.s === "撤销" && l.color === "#ffffff"),
      800,
    );
    assert.ok(transferMs <= 500);
    assert.ok(
      movingCircles.some(
        (a) =>
          !r.circles.some((b) => a.x === b.x && a.y === b.y && a.r === b.r),
      ),
      "departing sprite position disappears; next fixed slot is revealed",
    );
    const settled = JSON.stringify(r.circles);
    await new Promise((resolve) => setTimeout(resolve, 100));
    r.render();
    assert.equal(
      JSON.stringify(r.circles),
      settled,
      "remaining tube/tray balls no longer move",
    );
    r.tapTube(1);
    await driveUntil(
      r,
      () => r.labels.some((l) => l.s === "撤销" && l.color === "#ffffff"),
      800,
    );
    assert.equal(decode(r.storage.get(SAVE_KEY)!)!.history.length, 2);
    r.tap("暂停", true);
    r.tap("结束本局");
    r.tap("再来一局");
    const start = Date.now();
    r.tap("跳过开场");
    const skipMs = Date.now() - start;
    assert.ok(skipMs < 200);
    assert.ok(r.labels.some((l) => l.s.includes("开始 ·")));
    animationReports.push({
      unitsPerMs: units,
      introMs,
      transferMs,
      skipMs,
      remainingBallsStable: true,
      secondPickAccepted: true,
    });
    writeFileSync(
      "evidence/v0.1.12-animation-wallclock.json",
      JSON.stringify(
        {
          scope:
            "Actual WeChat bundle, host real timers and independent Date.now deadlines; wx API/units simulated, not installed DevTools",
          results: animationReports,
        },
        null,
        2,
      ),
    );
  });
for (const units of [1, 1000])
  test(`native frozen-clock intro/transfer fail safely at ${units} units/ms`, async () => {
    const invalid = await boot(new Map(), units, false, true, true);
    assert.ok(invalid.labels.some((l) => l.s.includes("时钟无法")));
    assert.ok(!invalid.labels.some((l) => l.s.includes("初见")));
    for (const stage of ["intro", "transfer"]) {
      const r = await boot(new Map(), units, false, true);
      r.tap("初见");
      if (stage === "transfer") {
        r.tap("跳过开场");
        r.tap("开始 ·");
        r.tapTube(1);
      }
      r.freezeClock();
      const pauseMs = await driveUntil(
        r,
        () => r.labels.some((l) => l.s === "休息一下"),
        2200,
      );
      assert.ok(pauseMs < 2000);
      if (stage === "transfer")
        assert.equal(decode(r.storage.get(SAVE_KEY)!)!.history.length, 1);
      r.tap("返回首页");
      assert.ok(r.labels.some((l) => l.s.includes("初见")));
      animationReports.push({
        unitsPerMs: units,
        frozenStage: stage,
        visiblePauseMs: pauseMs,
        returnHomeWorks: true,
      });
    }
    writeFileSync(
      "evidence/v0.1.12-animation-wallclock.json",
      JSON.stringify(
        {
          scope:
            "Actual WeChat bundle with real host timers; not installed DevTools",
          results: animationReports,
        },
        null,
        2,
      ),
    );
  });

for (const units of [1, 1000])
  test(`native 250ms turns and frozen-turn recovery at ${units} units/ms`, async () => {
    const r = await boot(new Map(), units, false, true);
    r.tap("初见");
    r.tap("跳过开场");
    r.tap("开始 ·");
    r.tap("→", true);
    const ms = await driveUntil(r, () => r.topBalls.size > 0, 800);
    assert.ok(ms >= 180 && ms < 500);
    assert.equal(decode(r.storage.get(SAVE_KEY)!)!.view, 2);
    r.tap("←", true);
    r.tap("←", true);
    r.tap("暂停", true);
    assert.equal(decode(r.storage.get(SAVE_KEY)!)!.view, 1);
    r.tap("继续游戏");
    r.tap("→", true);
    r.freezeClock();
    const interrupted = await driveUntil(
      r,
      () => r.labels.some((l) => l.s === "休息一下"),
      2200,
    );
    r.tap("返回首页");
    assert.ok(r.labels.some((l) => l.s.includes("初见")));
    animationReports.push({
      unitsPerMs: units,
      rotationMs: ms,
      frozenRotationPauseMs: interrupted,
    });
    writeFileSync(
      "evidence/v0.1.12-animation-wallclock.json",
      JSON.stringify(
        {
          scope:
            "Native bundle with simulated wx, real host timers; not installed DevTools",
          results: animationReports,
        },
        null,
        2,
      ),
    );
  });

test("native music starts on touch, pauses on hide and reuses one loop across rounds", async () => {
  const r = await boot();
  assert.equal(r.audioPlayers.length, 0);
  beginRuntime(r);
  const music = r.audioPlayers.find((p) => p.src.endsWith("ambience.wav"))!;
  assert.ok(music);
  assert.equal(music.loop, true);
  assert.equal(music.volume, 0.22);
  assert.equal(music.plays, 1);
  for (let i = 0; i < 20; i++) r.render();
  assert.equal(music.plays, 1);
  r.hide();
  assert.equal(music.playing, false);
  r.show();
  assert.equal(music.playing, false);
  r.tap("继续游戏");
  assert.equal(music.plays, 2);
  r.tap("声音开", true);
  assert.equal(music.playing, false);
  r.tap("暂停", true);
  r.tap("返回首页");
  beginRuntime(r);
  assert.equal(music.playing, false);
  r.tap("静音", true);
  assert.equal(music.playing, true);
  for (let i = 0; i < 3; i++) {
    r.tap("暂停", true);
    r.tap("返回首页");
    beginRuntime(r);
  }
  assert.equal(
    r.audioPlayers.filter((p) => p.src.endsWith("ambience.wav")).length,
    1,
  );
});

test("native image asset loads and image failure leaves gameplay available", async () => {
  for (const fail of [false, true]) {
    const r = await boot(new Map(), 1, false, false, false, fail);
    beginRuntime(r);
    assert.deepEqual(r.images, [
      "assets/background.png",
      "assets/play-background.png",
    ]);
    assert.equal(r.backgroundDraws() > 0, !fail);
    r.tapTube(1);
    r.advance(250000);
    assert.equal(decode(r.storage.get(SAVE_KEY)!)!.history.length, 1);
  }
});

test("native home hero restores canvas state after a paint fault", async () => {
  const r = await boot();
  r.failNextRender("●");
  r.render();
  r.render();
  assert.equal(r.canvasDepth(), 0);
  assert.ok(r.labels.some((l) => l.s.includes("初见")));
  r.tap("初见");
  r.tap("跳过开场");
  r.tap("开始 ·");
  r.tap("暂停", true);
  r.tap("返回首页", true);
  assert.ok(r.labels.some((l) => l.s.includes("初见")));
  assert.equal(r.canvasDepth(), 0);
});
