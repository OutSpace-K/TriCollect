import { test } from "node:test";
import assert from "node:assert/strict";
import { Controller } from "../src/controller";
import { UnavailableAd } from "../src/platform/ads";
import {
  appendResult,
  readRecords,
  RECORDS_KEY,
} from "../src/platform/records";
function setup() {
  let time = 0;
  const data = new Map<string, string>();
  const store = {
    get: (k: string) => data.get(k) ?? null,
    set: (k: string, v: string) => {
      data.set(k, v);
    },
  };
  const make = () => new Controller(() => time, store, new UnavailableAd());
  return { data, store, make, advance: (ms: number) => (time += ms) };
}
test("only finished started games become local results; home/restart never duplicate", () => {
  const x = setup(),
    g = x.make();
  g.hide();
  assert.equal(g.records.entries.length, 0);
  g.start();
  g.skipIntro();
  g.end();
  assert.equal(g.records.entries.length, 0);
  g.start(1);
  g.skipIntro();
  g.begin();
  x.advance(12345);
  g.tick();
  g.pause();
  assert.equal(g.records.entries.length, 0);
  g.end();
  const first = g.records.entries[0];
  assert.equal(first.total, 126);
  assert.equal(first.difficulty, "普通");
  assert.equal(first.outcome, "lost");
  assert.equal(first.elapsedMs, 12345);
  g.home();
  g.hide();
  x.make().hide();
  assert.deepEqual(readRecords(x.store).entries, [first]);
});
test("records reconcile once, cap at 30, and preserve prior valid backup on corruption", () => {
  const x = setup(),
    g = x.make();
  g.start();
  g.skipIntro();
  g.begin();
  g.end();
  const s = structuredClone(g.state);
  for (let i = 0; i < 36; i++) {
    s.session = "record-" + i;
    s.finishedAt = 1000 + i;
    assert.equal(appendResult(x.store, s), true);
  }
  assert.equal(readRecords(x.store).entries.length, 30);
  assert.equal(readRecords(x.store).entries[0].session, "record-35");
  appendResult(x.store, s);
  assert.equal(readRecords(x.store).entries.length, 30);
  x.data.set(RECORDS_KEY, "broken");
  assert.equal(readRecords(x.store).recovered, true);
  assert.equal(readRecords(x.store).entries[0].session, "record-34");
  x.data.delete(RECORDS_KEY + ".backup");
  assert.equal(readRecords(x.store).available, false);
  assert.equal(appendResult(x.store, s), false);
  assert.equal(x.data.get(RECORDS_KEY), "broken");
});
test("record storage failure cannot prevent ending the game", () => {
  const x = setup(),
    g = x.make();
  g.start();
  g.skipIntro();
  g.begin();
  const set = x.store.set;
  x.store.set = (k, v) => {
    if (k.startsWith(RECORDS_KEY)) throw Error("full");
    set(k, v);
  };
  assert.doesNotThrow(() => g.end());
  assert.equal(g.phase, "result");
  assert.match(g.message, /战绩保存失败/);
});
