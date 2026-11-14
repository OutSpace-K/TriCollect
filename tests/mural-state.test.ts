import { test } from "node:test";
import assert from "node:assert/strict";
import { Controller } from "../src/controller";
import { UnavailableAd } from "../src/platform/ads";
import { faceVisible } from "../src/core/rules";
import { decode, encode, valid, SAVE_KEY } from "../src/platform/storage";
import {
  MURAL_VARIANTS,
  MURAL_RECENT_LIMIT,
  MURAL_RECENT_KEY,
  chooseMuralVariant,
  muralVariantFor,
  readMuralRecent,
  rememberMuralVariant,
} from "../src/platform/mural";
function storage() {
  const data = new Map<string, string>();
  const store = {
    get: (k: string) => data.get(k) ?? null,
    set: (k: string, v: string) => {
      data.set(k, v);
    },
  };
  return { store, data };
}
test("8192 effective mural IDs avoid recent 64 and immediate artwork even with constant entropy", () => {
  const { store } = storage();
  let recent: number[] = [];
  let previous: number | undefined;
  for (let i = 0; i < 400; i++) {
    const next = chooseMuralVariant(new Set(recent), () => 0, previous);
    assert.ok(next >= 0 && next < MURAL_VARIANTS);
    assert.ok(!recent.includes(next));
    if (previous !== undefined) assert.notEqual(next % 4, previous % 4);
    recent = rememberMuralVariant(store, recent, next);
    previous = next;
    assert.ok(recent.length <= MURAL_RECENT_LIMIT);
    assert.deepEqual(readMuralRecent(store), recent);
  }
});
test("mural sources tolerate invalid entropy, corruption and unavailable history storage", () => {
  for (const entropy of [
    () => NaN,
    () => 1,
    () => -1,
    () => {
      throw Error("offline");
    },
  ]) {
    const next = chooseMuralVariant(new Set([0, 4051]), entropy, 0);
    assert.ok(Number.isInteger(next) && next >= 0 && next < 8192);
    assert.notEqual(next % 4, 0);
  }
  const { store, data } = storage();
  for (const raw of ["not json", "[1,1]", "[8192]", "[null]", "{}"]) {
    data.set(MURAL_RECENT_KEY, raw);
    assert.deepEqual(readMuralRecent(store), []);
  }
  const broken = {
    get: () => {
      throw Error("unavailable");
    },
    set: () => {
      throw Error("quota");
    },
  };
  assert.deepEqual(readMuralRecent(broken), []);
  assert.deepEqual(rememberMuralVariant(broken, [1, 2], 3), [1, 2, 3]);
});
test("new rounds vary artwork independently while picks turns undo resume preserve it", () => {
  const { store } = storage();
  let clock = 0;
  let gameEntropyCalls = 0;
  const make = () =>
    new Controller(
      () => clock,
      store,
      new UnavailableAd(),
      () => {},
      () => {
        gameEntropyCalls++;
        return 0.25;
      },
      () => 0,
    );
  const g = make();
  g.start(1, 123);
  g.skipIntro();
  g.begin();
  const first = g.muralVariant,
    original = JSON.stringify(g.board);
  const t = g.board.tubes.find((t) =>
    faceVisible(g.board, g.state.view).has(t.id),
  )!;
  g.pick(t.id);
  clock += 300;
  g.tick();
  assert.equal(g.muralVariant, first);
  g.undo();
  assert.equal(g.muralVariant, first);
  assert.equal(JSON.stringify(g.board), original);
  g.rotate(1);
  clock += 300;
  g.tick();
  assert.equal(g.muralVariant, first);
  g.home();
  const resumed = make();
  assert.equal(resumed.resume?.muralVariant, first);
  resumed.continueSaved();
  assert.equal(resumed.muralVariant, first);
  resumed.start(1, 123);
  assert.notEqual(resumed.muralVariant, first);
  assert.notEqual(resumed.muralVariant % 4, first % 4);
  assert.equal(JSON.stringify(resumed.board), original);
  assert.equal(gameEntropyCalls, 0);
  assert.equal(
    decode(encode(resumed.state))?.muralVariant,
    resumed.muralVariant,
  );
});
test("old saves retain deterministic session-derived mural and invalid variants are rejected", () => {
  const { store, data } = storage();
  const g = new Controller(() => 0, store, new UnavailableAd());
  g.start(0);
  const old = structuredClone(g.state);
  delete old.muralVariant;
  assert.ok(valid(old));
  const expected = muralVariantFor(old);
  data.set(SAVE_KEY, encode(old));
  const resumed = new Controller(() => 0, store, new UnavailableAd());
  resumed.continueSaved();
  assert.equal(resumed.muralVariant, expected);
  resumed.state.view = 2;
  assert.equal(resumed.muralVariant, expected);
  const again = decode(encode(resumed.state))!;
  assert.equal(muralVariantFor(again), expected);
  for (const invalid of [-1, 8192, NaN, 0.5, "1", null]) {
    const bad = { ...old, muralVariant: invalid } as any;
    assert.equal(valid(bad), false);
  }
});
