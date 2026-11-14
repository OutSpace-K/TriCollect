import { test } from "node:test";
import assert from "node:assert/strict";
import { Scene } from "../src/render/scene";
function recorder() {
  const calls: unknown[][] = [];
  return {
    calls,
    ctx: {
      drawImage: (...args: unknown[]) => calls.push(args),
      scale: () => {},
    } as unknown as CanvasRenderingContext2D,
  };
}
function setup() {
  const main = recorder();
  const s = new Scene(main.ctx, {} as any, 390, 748);
  s.setHiddenArtwork({} as CanvasImageSource, true);
  const buffers: ReturnType<typeof recorder>[] = [];
  s.setHiddenArtworkCanvasFactory((width, height) => {
    const r = recorder();
    buffers.push(r);
    return { width, height, getContext: () => r.ctx };
  });
  const paint = (x = 100, base = 350) =>
    (s as any).paintHiddenArtwork(
      main.ctx,
      x,
      200,
      base,
      20,
      20,
      370,
      100,
      600,
    );
  return { s, main, buffers, paint };
}
test("24 cylindrical strips are generated once and each cache hit draws one bitmap", () => {
  const x = setup();
  x.paint();
  assert.equal(x.buffers.length, 1);
  assert.equal(x.buffers[0].calls.length, 24);
  assert.equal(x.main.calls.length, 1);
  x.paint();
  assert.equal(x.buffers.length, 1);
  assert.equal(x.main.calls.length, 2);
  assert.equal(x.s.hiddenArtworkCacheStats.hits, 1);
});
test("cache preserves original mural source mapping and subpixel cylindrical destinations", () => {
  const x = setup();
  x.paint();
  const calls = x.buffers[0].calls;
  for (let i = 0; i < 24; i++) {
    const a = calls[i] as number[];
    const u = i / 24;
    const expected = [
      ((100 - 20 + u * 40 - 20) / 350) * 768,
      ((200 - 100) / 500) * 256,
      (40 / 24 / 350) * 768,
      ((350 - 200 + 20 * 0.43) / 500) * 256,
    ];
    for (let k = 0; k < 4; k++)
      assert.ok(Math.abs(a[k + 1] - expected[k]) < 1e-10);
    assert.ok(
      Math.abs(a[5] - (20 + Math.sin((u - 0.5) * Math.PI) * 20)) < 1e-10,
    );
    assert.equal(a[6], 0);
  }
});
test("mural position/height changes miss, replacement image and factory invalidate cache", () => {
  const x = setup();
  x.paint();
  x.paint(101);
  x.paint(101, 349);
  assert.equal(x.s.hiddenArtworkCacheStats.entries, 3);
  x.s.setHiddenArtwork({} as CanvasImageSource, true);
  assert.equal(x.s.hiddenArtworkCacheStats.entries, 0);
  x.paint();
  x.s.setHiddenArtworkCanvasFactory(null);
  assert.equal(x.s.hiddenArtworkCacheStats.entries, 0);
  x.main.calls.length = 0;
  x.paint();
  assert.equal(x.main.calls.length, 24);
});
test("LRU is bounded to 128 entries and 16 MiB under continuous position/height changes", () => {
  const x = setup();
  for (let i = 0; i < 180; i++) x.paint(100 + i / 100, 350 + i / 10);
  assert.equal(x.s.hiddenArtworkCacheStats.entries, 128);
  assert.ok(x.s.hiddenArtworkCacheStats.bytes <= 16 * 1024 * 1024);
  const before = x.buffers.length;
  x.paint();
  assert.equal(x.buffers.length, before + 1);
  const large = setup();
  for (let i = 0; i < 30; i++) large.paint(100 + i, 8000);
  assert.ok(large.s.hiddenArtworkCacheStats.bytes <= 16 * 1024 * 1024);
  assert.ok(large.s.hiddenArtworkCacheStats.entries < 30);
});
test("unavailable or failing canvas factory falls back to original 24-strip paint", () => {
  for (const factory of [
    () => {
      throw Error("unsupported");
    },
    () => ({ width: 1, height: 1, getContext: () => null }),
  ]) {
    const x = setup();
    x.s.setHiddenArtworkCanvasFactory(factory);
    x.paint();
    assert.equal(x.main.calls.length, 24);
    x.paint();
    assert.equal(x.main.calls.length, 48);
    assert.equal(x.s.hiddenArtworkCacheStats.entries, 0);
  }
});
test("real canvas warm-cache benchmark and visual sampling comparison", async (t) => {
  let canvasModule;
  try {
    canvasModule = await import(
      process.env.TRICOLLECT_CANVAS_MODULE ?? "@napi-rs/canvas"
    );
  } catch {
    t.skip("optional native canvas is not installed");
    return;
  }
  const { createCanvas } = canvasModule;
  const texture = createCanvas(768, 256),
    tc = texture.getContext("2d");
  tc.fillStyle = "#e6b16c";
  tc.fillRect(0, 0, 768, 256);
  for (let x = 0; x < 768; x += 18) {
    tc.fillStyle = x % 36 ? "#3d9fb0" : "#e96b84";
    tc.fillRect(x, 0, 8, 256);
  }
  const make = (cached: boolean) => {
    const c = createCanvas(300, 400);
    const s = new Scene(c.getContext("2d") as any, {} as any, 300, 400);
    s.setHiddenArtwork(texture as any, true);
    if (cached)
      s.setHiddenArtworkCanvasFactory((w, h) => createCanvas(w, h) as any);
    return {
      c,
      s,
      paint: () => {
        (s as any).paintHiddenArtwork(
          c.getContext("2d"),
          100,
          100,
          300,
          20,
          20,
          280,
          60,
          360,
        );
      },
    };
  };
  const plain = make(false),
    cached = make(true);
  plain.paint();
  cached.paint();
  const a = plain.c.getContext("2d").getImageData(82, 101, 36, 198).data,
    b = cached.c.getContext("2d").getImageData(82, 101, 36, 198).data;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  const mean = sum / a.length;
  assert.ok(mean < 8, `mean pixel delta ${mean}`);
  const measure = (p: () => void) => {
    const start = performance.now();
    for (let i = 0; i < 100; i++) p();
    return (performance.now() - start) / 100;
  };
  t.diagnostic(
    JSON.stringify({
      uncachedMs: measure(plain.paint),
      cachedMs: measure(cached.paint),
      meanChannelDelta: mean,
      stats: cached.s.hiddenArtworkCacheStats,
    }),
  );
});
