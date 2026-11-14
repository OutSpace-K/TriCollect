import { test } from "node:test";
import assert from "node:assert/strict";
import { Controller } from "../src/controller";
import { NoAdsService } from "../src/platform/ads";
import { roundBaseMs } from "../src/config";
import {
  decode,
  encode,
  save,
  restore,
  valid,
  SAVE_KEY,
} from "../src/platform/storage";
import {
  appendResult,
  readRecords,
  RECORDS_KEY,
} from "../src/platform/records";
function setup() {
  const data = new Map<string, string>();
  const store = {
    get: (k: string) => data.get(k) ?? null,
    set: (k: string, v: string) => {
      data.set(k, v);
    },
  };
  const make = () => new Controller(() => 0, store, new NoAdsService());
  return { data, store, make };
}
test("new round budgets are difficulty-specific and remaining is bounded by saved budget plus granted time", () => {
  for (let preset = 0; preset < 3; preset++) {
    const x = setup(),
      g = x.make();
    g.start(preset);
    const s = structuredClone(g.state);
    s.baseMs = roundBaseMs(preset);
    s.remaining = s.baseMs;
    assert.equal(s.baseMs, [120000, 180000, 240000][preset]);
    assert.ok(valid(s));
    assert.equal(decode(encode(s))?.baseMs, s.baseMs);
    s.remaining++;
    assert.equal(valid(s), false);
    s.remaining--;
    s.extensions = 1;
    s.added = 30000;
    s.remaining += 30000;
    s.rewards.push({
      id: "extension",
      session: s.session,
      kind: "extend",
      state: "completed",
      redeemed: true,
    });
    assert.ok(valid(s));
    s.remaining++;
    assert.equal(valid(s), false);
    s.remaining--;
    for (const invalid of [
      0,
      -1,
      NaN,
      Infinity,
      120000.5,
      300001,
      "120000",
      null,
    ]) {
      assert.equal(valid({ ...s, baseMs: invalid } as any), false);
    }
    s.baseMs = roundBaseMs((preset + 1) % 3);
    assert.equal(valid(s), false);
  }
});
test("legacy saves restore original 300000 ms budget and exact remaining without resetting", () => {
  for (let preset = 0; preset < 3; preset++) {
    const x = setup(),
      g = x.make();
    g.start(preset);
    g.skipIntro();
    g.begin();
    const legacy = structuredClone(g.state);
    delete legacy.baseMs;
    legacy.remaining = 287654;
    legacy.phase = "paused";
    assert.ok(valid(legacy));
    save(x.store, legacy);
    const restored = restore(x.store).save!;
    assert.equal(restored.baseMs, undefined);
    assert.equal(restored.remaining, 287654);
    const resumed = x.make();
    resumed.continueSaved();
    assert.equal(resumed.state.remaining, 287654);
    assert.equal(resumed.state.baseMs, undefined);
    resumed.checkpoint();
    assert.equal(decode(x.data.get(SAVE_KEY)!)?.remaining, 287654);
    const explicit = { ...legacy, baseMs: 300000 };
    assert.ok(valid(explicit));
  }
});
test("new results calculate elapsed from their saved per-round budget including extensions", () => {
  for (let preset = 0; preset < 3; preset++) {
    const x = setup(),
      g = x.make();
    g.start(preset);
    const s = structuredClone(g.state);
    s.baseMs = roundBaseMs(preset);
    s.started = true;
    s.phase = "result";
    s.finishedAt = 1000;
    s.added = 30000;
    s.extensions = 1;
    s.remaining = s.baseMs + 30000 - 12345;
    s.rewards.push({
      id: "extension",
      session: s.session,
      kind: "extend",
      state: "completed",
      redeemed: true,
    });
    assert.ok(appendResult(x.store, s));
    const r = readRecords(x.store).entries[0];
    assert.equal(r.baseMs, s.baseMs);
    assert.equal(r.elapsedMs, 12345);
    assert.equal(r.addedMs, 30000);
  }
});
test("legacy results preserve old elapsed accounting and historical records remain readable", () => {
  const x = setup(),
    g = x.make();
  g.start(0);
  const s = structuredClone(g.state);
  delete s.baseMs;
  s.started = true;
  s.phase = "result";
  s.finishedAt = 1000;
  s.remaining = 230000;
  assert.ok(appendResult(x.store, s));
  const entry = readRecords(x.store).entries[0];
  assert.equal(entry.elapsedMs, 70000);
  assert.equal(entry.baseMs, 300000);
  const historical = { ...entry, elapsedMs: 350000, addedMs: 0 };
  delete historical.baseMs;
  x.data.set(RECORDS_KEY, JSON.stringify({ schema: 1, entries: [historical] }));
  assert.deepEqual(readRecords(x.store).entries, [historical]);
  const invalid = { ...historical, baseMs: 120000, elapsedMs: 120001 };
  x.data.set(RECORDS_KEY, JSON.stringify({ schema: 1, entries: [invalid] }));
  x.data.delete(RECORDS_KEY + ".backup");
  assert.equal(readRecords(x.store).available, false);
});
