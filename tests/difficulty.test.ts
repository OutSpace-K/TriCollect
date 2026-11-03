import { test } from "node:test";
import assert from "node:assert/strict";
import { createLevel } from "../src/core/generation";
import { take, invariant, faceVisible, clone } from "../src/core/rules";
import { UnavailableAd } from "../src/platform/ads";
import { Controller } from "../src/controller";
import { hash, valid, encode, decode, SAVE_KEY } from "../src/platform/storage";
import { hardSample, appendResult, readRecords } from "../src/platform/records";
import { writeFileSync } from "node:fs";

test("legacy boards retain exact identity and reload with undo; revisions cannot be relabelled", () => {
  const hashes = ["d22f7d4", "f39022b6", "e5758a97"];
  for (let preset = 0; preset < 3; preset++) {
    const l = createLevel(preset, 789, 1);
    assert.equal(hash(JSON.stringify(l.board)), hashes[preset]);
    const data = new Map<string, string>();
    const store = {
      get: (k: string) => data.get(k) ?? null,
      set: (k: string, v: string) => {
        data.set(k, v);
      },
    };
    const g = new Controller(() => 0, store, new UnavailableAd());
    g.start(preset, 789);
    const s = clone(g.state);
    delete s.generation;
    s.history = [clone(l.board)];
    s.board = take(l.board, l.witness[0], "legacy");
    s.undoAvailable = true;
    s.started = true;
    s.phase = "paused";
    assert.ok(valid(s));
    data.set(SAVE_KEY, encode(s));
    const restored = new Controller(() => 0, store, new UnavailableAd());
    assert.ok(restored.resume);
    restored.continueSaved();
    assert.deepEqual(restored.board, s.board);
    restored.begin();
    assert.ok(restored.canUndo);
    restored.undo();
    assert.deepEqual(restored.board, l.board);
    assert.ok(decode(encode(restored.state)));
    if (preset > 0) assert.equal(valid({ ...s, generation: 2 }), false);
    assert.equal(valid({ ...s, generation: 3 as 2 }), false);
  }
});

test("300 new layouts have visible legal no-ad paths and measured progressive tray pressure", () => {
  type Pressure = {
    revision: number;
    average: number;
    pressure: number;
    peak: number;
    distinct: number;
  };
  const rows: { preset: number; seed: number; values: Pressure[] }[] = [];
  for (let preset = 0; preset < 3; preset++)
    for (let seed = 1000; seed < 1100; seed++) {
      const values = [];
      for (const revision of [1, 2] as const) {
        const l = createLevel(preset, seed, revision);
        assert.equal(l.fallback, false);
        let b = l.board,
          total = 0,
          pressure = 0,
          peak = 0,
          distinct = 0;
        for (let i = 0; i < l.witness.length; i++) {
          assert.ok(faceVisible(b, l.views[i]).has(l.witness[i]));
          b = take(b, l.witness[i], `d-${i}`);
          assert.ok(invariant(b, l.witness.length));
          peak = Math.max(peak, b.tray.length);
          distinct = Math.max(
            distinct,
            new Set(b.tray.map((x) => x.type)).size,
          );
          total += b.tray.length;
          pressure += Number(b.tray.length >= 5);
        }
        assert.equal(b.status, "won");
        assert.ok(peak < 7);
        values.push({
          revision,
          average: total / l.witness.length,
          pressure,
          peak,
          distinct,
        });
      }
      if (preset === 0)
        assert.deepEqual(
          createLevel(preset, seed, 1),
          createLevel(preset, seed, 2),
        );
      rows.push({ preset, seed, values });
    }
  const metrics = [0, 1, 2].map((preset) => {
    const sample = rows.filter((r) => r.preset === preset);
    const means = [0, 1].map(
      (i) =>
        sample.reduce((n, r) => n + r.values[i].average, 0) / sample.length,
    );
    if (preset > 0) assert.ok(means[1] > means[0] + 0.2);
    return {
      preset,
      legacyMeanTray: means[0],
      newMeanTray: means[1],
      maxPendingColors: Math.max(...sample.map((r) => r.values[1].distinct)),
    };
  });
  assert.equal(metrics[2].maxPendingColors, 4);
  writeFileSync(
    "evidence/v0.1.24-difficulty.json",
    JSON.stringify(
      {
        seedsPerTier: 100,
        allLayoutsSolvable: true,
        metrics,
        rows,
        humanWinRateMeasured: false,
        targetHumanHardRate: 0.3,
      },
      null,
      2,
    ),
  );
});

test("local hard sample excludes old/advertised results and records free assistance without claiming a human rate", () => {
  const data = new Map<string, string>();
  const store = {
    get: (k: string) => data.get(k) ?? null,
    set: (k: string, v: string) => {
      data.set(k, v);
    },
  };
  assert.equal(hardSample([]).rate, null);
  const g = new Controller(() => 0, store, new UnavailableAd());
  g.start(2, 123);
  const s = {
    ...g.state,
    started: true,
    phase: "result" as const,
    finishedAt: 1,
    hintsUsed: 2,
    undosUsed: 1,
  };
  assert.ok(appendResult(store, s));
  assert.ok(appendResult(store, s));
  const entries = readRecords(store).entries;
  assert.equal(entries.length, 1);
  assert.equal(entries[0].hintsUsed, 2);
  assert.deepEqual(hardSample(entries), {
    completed: 1,
    wins: 0,
    rate: 0,
    excluded: 0,
    limit: 30,
  });
  assert.equal(
    hardSample([
      { ...entries[0], generation: undefined },
      { ...entries[0], rewardedAds: 1 },
    ]).completed,
    0,
  );
});
