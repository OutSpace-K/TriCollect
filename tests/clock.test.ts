import { test } from "node:test";
import assert from "node:assert/strict";
import { calibrateClock } from "../src/platform/clock";
import { Controller } from "../src/controller";
import { UnavailableAd } from "../src/platform/ads";
import { writeFileSync } from "node:fs";
for (const units of [1, 1000])
  test(`clock calibration normalizes ${units} units/ms and rejects runtime freeze`, async () => {
    let time = 0;
    const clock = await calibrateClock(
      () => time * units,
      () => time,
      async (ms) => {
        time += ms;
      },
    );
    assert.equal(clock.unitsPerMs, units);
    time += 10000;
    assert.equal(clock.now(), 10000);
  });
test("frozen, invalid or ambiguous startup clock is rejected rather than starting a locked round", async () => {
  for (const raw of [() => 0, () => NaN, () => Infinity]) {
    let wall = 0;
    await assert.rejects(
      calibrateClock(
        raw,
        () => wall,
        async (ms) => {
          wall += ms;
        },
      ),
    );
  }
});
test("runtime frozen clock signals interruption without substituting wall-clock game time", async () => {
  let raw = 0,
    wall = 0;
  const c = await calibrateClock(
    () => raw,
    () => wall,
    async (ms) => {
      raw += ms;
      wall += ms;
    },
  );
  c.now();
  wall += 1600;
  assert.throws(() => c.now(), /stopped/);
});
test("independent real-time 10-second measurement in both clock unit modes", async () => {
  const results = await Promise.all(
    [1, 1000].map(async (units) => {
      const clock = await calibrateClock(() => performance.now() * units);
      const store = new Map<string, string>();
      const g = new Controller(
        clock.now,
        {
          get: (k) => store.get(k) ?? null,
          set: (k, v) => {
            store.set(k, v);
          },
        },
        new UnavailableAd(),
      );
      g.start();
      g.skipIntro();
      g.begin();
      const start = performance.now(),
        before = g.state.remaining;
      await new Promise((r) => setTimeout(r, 10000));
      g.tick();
      const observed = performance.now() - start,
        charged = before - g.state.remaining;
      assert.ok(observed >= 9900);
      assert.ok(
        Math.abs(charged - observed) < 100,
        `${units}: charged=${charged}, elapsed=${observed}`,
      );
      g.pause();
      const paused = g.state.remaining;
      await new Promise((r) => setTimeout(r, 100));
      g.tick();
      assert.equal(g.state.remaining, paused);
      return {
        unitsPerMs: units,
        elapsedMs: observed,
        chargedMs: charged,
        pausePreserved: true,
      };
    }),
  );
  writeFileSync(
    "evidence/v0.1.22-clock-realtime.json",
    JSON.stringify(
      {
        scope:
          "Real host monotonic time, both wx unit semantics simulated; not actual WeChat device",
        results,
      },
      null,
      2,
    ),
  );
});
