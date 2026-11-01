import { test } from "node:test";
import assert from "node:assert/strict";
import { createLevel, generate } from "../src/core/generation";
import {
  exposed,
  faceVisible,
  available,
  take,
  replay,
  invariant,
  clone,
  type Board,
} from "../src/core/rules";
import { PRESETS, CONFIG, MECHANICAL } from "../src/config";
import { solve } from "../src/core/solver";
const initial = () => generate(MECHANICAL, MECHANICAL.seed).board;
test("10 tube mechanical layout has nine exposed boundaries and one locked center", () => {
  const b = initial();
  assert.equal(b.tubes.length, 10);
  assert.equal(exposed(b).size, 9);
  assert.ok(!exposed(b).has("1,1"));
  assert.equal(take(b, "1,1", "a"), b);
});
test("top only, one ball and one action, stable unique ID conservation", () => {
  const b = initial(),
    t = b.tubes[0],
    top = t.balls.at(-1);
  const n = take(b, t.id, "a");
  assert.deepEqual(n.tray, [top]);
  assert.equal(n.tubes[0].balls.length, 2);
  assert.equal(take(n, t.id, "a"), n);
  assert.ok(invariant(n, 30));
});
test("three same resolve before seventh-slot failure", () => {
  const b = initial();
  b.tray = [0, 0, 1, 1, 2, 2].map((type, i) => ({ id: "x" + i, type }));
  b.tubes[0].balls.at(-1)!.type = 0;
  const n = take(b, "0,0", "a");
  assert.equal(n.tray.length, 4);
  assert.equal(n.status, "playing");
  assert.equal(n.cleared.length, 3);
});
test("seven unmatched blocks eighth action", () => {
  const b = initial();
  b.tray = [0, 0, 1, 1, 2, 2].map((type, i) => ({ id: "x" + i, type }));
  b.tubes[0].balls.at(-1)!.type = 3;
  const n = take(b, "0,0", "a");
  assert.equal(n.status, "blocked");
  assert.equal(take(n, "0,0", "b"), n);
});
test("exterior flood exposes inner tube only after connected empty cell", () => {
  const b = initial();
  b.tubes.find((t) => t.id === "0,1")!.balls = [];
  assert.ok(exposed(b).has("1,1"));
});
test("sealed internal empty cell does not expose adjacent internal tubes", () => {
  const b = createLevel(2).board;
  b.tubes.find((t) => t.id === "2,1")!.balls = [];
  assert.ok(!exposed(b).has("1,2"));
});
test("all presets deterministic and witness wins without ads preserving every ball", () => {
  for (const p of PRESETS) {
    const l = generate(p, p.seed);
    assert.deepEqual(generate(p, p.seed), l);
    let b = l.board;
    for (let i = 0; i < l.witness.length; i++) {
      b = take(b, l.witness[i], "t" + i);
      assert.ok(invariant(b, l.witness.length));
    }
    assert.equal(b.status, "won");
    assert.equal(b.tray.length, 0);
    assert.equal(b.cleared.length, l.witness.length);
  }
});
test("solver budget returns unknown rather than no-solution", () =>
  assert.equal(solve(initial(), () => 0, 0, 40).status, "unknown"));
test("solver safe path independently replays from current partial state", () => {
  const l = createLevel(0);
  const b = replay(l.board, l.witness.slice(0, -6));
  const s = solve(b, () => 0, 10000, 40);
  assert.equal(s.status, "safe");
  if (s.status === "safe") assert.equal(replay(b, s.path).status, "won");
});
test("blocked state search is dead without mutating board", () => {
  const b = initial();
  b.status = "blocked";
  const before = clone(b);
  assert.equal(solve(b, () => 0).status, "dead");
  assert.deepEqual(b, before);
});
test("divisible color counts alone do not prove solvability: current state with no safe move", () => {
  const b = initial();
  b.tray = [0, 0, 1, 1, 2, 2].map((type, i) => ({ id: "tray-" + i, type }));
  const bottom = [0, 1, 2, 3, 3, ...Array(15).fill(4)];
  for (const t of b.tubes) {
    t.balls[0].type = bottom.pop()!;
    t.balls[1].type = bottom.pop()!;
    t.balls[2].type = 3;
  }
  const counts = Array(5).fill(0);
  for (const ball of [...b.tray, ...b.tubes.flatMap((t) => t.balls)])
    counts[ball.type]++;
  assert.ok(counts.every((n) => n % 3 === 0));
  assert.ok(invariant(b, 36));
  assert.equal(solve(b, () => 0).status, "dead");
});
test("60 adversarial deterministic walks maintain identity and tray invariants", () => {
  for (let seed = 1; seed <= 60; seed++) {
    let b = createLevel(seed % 3, seed).board;
    const count = b.tubes.flatMap((t) => t.balls).length;
    for (let i = 0; i < count && b.status === "playing"; i++) {
      const ids = [...exposed(b)];
      b = take(b, ids[(seed * 7 + i * 13) % ids.length], `walk-${i}`);
      assert.ok(invariant(b, count));
    }
  }
});

test("front faces hide deeper tubes and peeling reveals the same shared lattice", () => {
  const b = createLevel(0).board;
  for (let view = 0; view < 3; view++) {
    const before = faceVisible(b, view);
    assert.equal(before.size, 6);
    assert.ok(!before.has("1,1"));
  }
  const a = clone(b);
  a.tubes.find((t) => t.id === "1,0")!.balls = [];
  assert.ok(faceVisible(a, 0).has("1,1"));
  assert.ok(!faceVisible(a, 0).has("1,0"));
  assert.ok(!faceVisible(b, 0).has("0,1"));
  assert.ok(available(b).has("0,1"));
});
test("clearing the full outer boundary exposes inner pipes in all three views", () => {
  const b = createLevel(0).board;
  for (const t of b.tubes)
    if (t.q === 0 || t.r === 0 || t.q + t.r === b.side - 1) t.balls = [];
  for (let v = 0; v < 3; v++) {
    const visible = faceVisible(b, v);
    assert.equal(visible.size, 3);
    for (const id of visible) {
      const t = b.tubes.find((t) => t.id === id)!;
      assert.ok(t.q > 0 && t.r > 0 && t.q + t.r < b.side - 1);
    }
  }
});
