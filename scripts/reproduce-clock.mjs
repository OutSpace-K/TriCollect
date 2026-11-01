// Read-only diagnostic for the old delivered bundle. Pass its local path explicitly.
import vm from "node:vm";
import { readFileSync, writeFileSync } from "node:fs";
const bundle = process.argv[2];
if (!bundle)
  throw Error(
    "Usage: node scripts/reproduce-clock.mjs /path/to/v0.1.1/game.js",
  );
const results = [];
for (const unit of [1, 1000]) {
  let ms = 0,
    frame = () => {};
  const labels = [],
    storage = new Map(),
    handlers = {};
  const noop = () => {};
  const ctx = new Proxy(
    {
      fillText: (text, x, y) => labels.push({ text, x, y }),
      createLinearGradient: () => ({ addColorStop: noop }),
      createRadialGradient: () => ({ addColorStop: noop }),
    },
    {
      get: (t, k) => (k in t ? t[k] : noop),
      set: (t, k, v) => {
        t[k] = v;
        return true;
      },
    },
  );
  const wx = {
    createCanvas: () => ({ getContext: () => ctx }),
    getWindowInfo: () => ({
      windowWidth: 390,
      windowHeight: 844,
      pixelRatio: 1,
      safeArea: { top: 24, bottom: 820 },
    }),
    getPerformance: () => ({ now: () => ms * unit }),
    createInnerAudioContext: () => ({ play: noop, stop: noop, onError: noop }),
    getStorageSync: (k) => storage.get(k),
    setStorageSync: (k, v) => storage.set(k, v),
    onTouchStart: (f) => (handlers.start = f),
    onTouchEnd: (f) => (handlers.end = f),
    onTouchCancel: noop,
    onHide: (f) => (handlers.hide = f),
    onShow: noop,
  };
  vm.runInNewContext(readFileSync(bundle, "utf8"), {
    wx,
    console,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (f) => (frame = f),
  });
  const render = () => {
    labels.length = 0;
    frame();
  };
  const tap = (text, exact = false) => {
    const l = [...labels]
      .reverse()
      .find((l) => (exact ? l.text === text : l.text.includes(text)));
    if (!l) throw Error("Missing " + text);
    const t = { clientX: l.x, clientY: l.y - 5 + 24 };
    handlers.start({ touches: [t] });
    handlers.end({ changedTouches: [t] });
    render();
  };
  const saved = () =>
    JSON.parse(JSON.parse(storage.get("tricollect.save.v1")).payload);
  tap("初见");
  tap("跳过开场");
  tap("开始 ·");
  ms += 10000;
  render();
  tap("1", true);
  const first = saved();
  ms += 1000;
  render();
  tap("1", true);
  const second = saved();
  results.push({
    suppliedUnitsPerMs: unit,
    after10SecondsRemainingMs: first.remaining,
    firstPickHistory: first.history.length,
    historyAfterSecondPickOneSecondLater: second.history.length,
  });
}
const report = {
  scope:
    "v0.1.1 actual bundle with two supplied clock semantics. Reproduction of a conditional failure, not evidence of user device units.",
  results,
};
writeFileSync(
  "evidence/v0.1.2-bundle-reproduction.json",
  JSON.stringify(report, null, 2),
);
console.log(report);
