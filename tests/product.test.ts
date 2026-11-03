import { test } from "node:test";
import assert from "node:assert/strict";
import { Controller } from "../src/controller";
import { createAdService } from "../src/platform/ads";
import { Scene } from "../src/render/scene";
function fixture() {
  let now = 0;
  const values = new Map<string, string>(),
    noop = () => {};
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
  const g = new Controller(
    () => now,
    {
      get: (k) => values.get(k) ?? null,
      set: (k, v) => {
        values.set(k, v);
      },
    },
    { available: false, label: "unconfigured", request: async () => "failed" },
  );
  const s = new Scene(ctx, g, 320, 660);
  s.render();
  const tap = (id: string) => {
    const b = s.buttons.find((b) => b.id === id);
    assert.ok(b, id);
    s.tap(b.x + b.w / 2, b.y + b.h / 2);
    s.render();
  };
  return {
    g,
    s,
    values,
    tap,
    advance: (ms: number) => {
      now += ms;
      g.tick();
      s.render();
    },
  };
}
test("three-step guide blocks underlying actions and persists acknowledgement without changing round", () => {
  const { g, s, tap, advance } = fixture();
  const session = g.state.session;
  tap("help");
  assert.equal(s.guideStep, 0);
  assert.equal(s.targets.length, 0);
  assert.ok(!s.buttons.some((b) => b.id === "start-menu"));
  tap("guide-next");
  tap("guide-next");
  assert.equal(s.guideStep, 2);
  tap("guide-next");
  assert.equal(g.guideSeen, true);
  assert.equal(g.state.session, session);
  assert.equal(g.phase, "home");
  g.start(1);
  g.skipIntro();
  s.render();
  const before = JSON.stringify(g.board),
    remaining = g.state.remaining;
  tap("guide-open");
  advance(20000);
  assert.equal(g.state.remaining, remaining);
  assert.equal(g.phase, "ready");
  assert.equal(s.targets.length, 0);
  assert.ok(!s.buttons.some((b) => b.id === "begin"));
  s.tap(100, 300);
  assert.equal(JSON.stringify(g.board), before);
  tap("home-dialog-close");
  assert.equal(s.guideOpen, false);
  tap("begin");
  assert.equal(g.phase, "active");
});
test("guide preference storage failure cannot stop game start or mutate save", () => {
  const values = new Map<string, string>();
  const g = new Controller(
    () => 0,
    {
      get: (k) => {
        if (k === "tricollect.guide.v1") throw Error("read");
        return values.get(k) ?? null;
      },
      set: (k, v) => {
        if (k === "tricollect.guide.v1") throw Error("write");
        values.set(k, v);
      },
    },
    { available: false, label: "none", request: async () => "failed" },
  );
  assert.equal(g.guideSeen, false);
  assert.doesNotThrow(() => g.acknowledgeGuide());
  g.start();
  g.skipIntro();
  g.begin();
  assert.equal(g.phase, "active");
});
test("finite victory confetti pauses in background and never changes score or timer", () => {
  const { g, s, advance } = fixture();
  g.start();
  g.skipIntro();
  g.begin();
  g.board.status = "won";
  g.phase = "result";
  s.render();
  const score = g.board.score,
    remaining = g.state.remaining;
  for (let i = 0; i < 10; i++) advance(50);
  assert.equal(s.celebrationMs, 500);
  s.setForeground(false);
  advance(10000);
  assert.equal(s.celebrationMs, 500);
  s.setForeground(true);
  advance(10000);
  assert.equal(s.celebrationMs, 500);
  for (let i = 0; i < 60; i++) advance(50);
  assert.equal(s.celebrationMs, 2600);
  advance(10000);
  assert.equal(s.celebrationMs, 2600);
  assert.equal(g.board.score, score);
  assert.equal(g.state.remaining, remaining);
});

test("unconfigured or failed ad creation stays explicitly unavailable and never throws at boot", async () => {
  let created = 0;
  const create = () => {
    created++;
    throw Error("platform unavailable");
  };
  const absent = createAdService("", create);
  assert.equal(created, 0);
  assert.equal(absent.available, false);
  assert.equal(absent.label, "广告未配置");
  const failed = createAdService("configured-test-id", create);
  assert.equal(created, 1);
  assert.equal(failed.available, false);
  assert.equal(failed.label, "广告暂不可用");
  assert.equal(await failed.request(), "failed");
});
