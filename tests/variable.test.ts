import { test } from "node:test";
import assert from "node:assert/strict";
import { Controller } from "../src/controller";
import { UnavailableAd } from "../src/platform/ads";
import { createLevel } from "../src/core/generation";
import { valid, encode, decode } from "../src/platform/storage";
import { faceVisible } from "../src/core/rules";
import { projection } from "../src/render/projection";
test("variable heights preserve identity and physical scale through undo/save and reject altered capacity/old rules", () => {
  for (const preset of [1, 2]) {
    let time = 0;
    const data = new Map<string, string>();
    const g = new Controller(
      () => time,
      {
        get: (k) => data.get(k) ?? null,
        set: (k, v) => {
          data.set(k, v);
        },
      },
      new UnavailableAd(),
    );
    g.start(preset);
    g.skipIntro();
    g.begin();
    const b = g.board,
      t = b.tubes.find((t) => faceVisible(b, 0).has(t.id) && t.capacity === 7)!;
    assert.ok(t);
    const ids = t.balls.map((b) => b.id);
    g.pick(t.id);
    time += 250;
    g.tick();
    assert.deepEqual(
      g.board.tubes.find((n) => n.id === t.id)!.balls.map((b) => b.id),
      ids.slice(0, -1),
    );
    assert.equal(g.board.tubes.find((n) => n.id === t.id)!.capacity, 7);
    g.undo();
    assert.deepEqual(
      g.board.tubes.find((n) => n.id === t.id)!.balls.map((b) => b.id),
      ids,
    );
    assert.ok(valid(g.state));
    assert.ok(decode(encode(g.state)));
    const altered = structuredClone(g.state);
    altered.board.tubes[0].capacity++;
    assert.equal(valid(altered), false);
    altered.rule = "tricollect-4-fixedslots-front";
    assert.equal(valid(altered), false);
    for (const width of [320, 390]) {
      const f = projection(b.side, width, 147, 487, 0, 7);
      assert.equal(f.step, 2 * f.ballRadius);
      assert.ok(f.step * 7 + 6 <= f.height);
      const before = f.point(t);
      b.tubes.filter((t) => t.capacity === 7).forEach((t) => (t.balls = []));
      const after = projection(
        b.side,
        width,
        147,
        487,
        0,
        Math.max(...b.tubes.map((t) => t.capacity)),
      ).point(t);
      assert.deepEqual(before, after);
    }
  }
});
test("complete witness records one genuine victory with correct cleared count and capacity", () => {
  let time = 0;
  const data = new Map<string, string>();
  const g = new Controller(
    () => time,
    {
      get: (k) => data.get(k) ?? null,
      set: (k, v) => {
        data.set(k, v);
      },
    },
    new UnavailableAd(),
  );
  g.start(1);
  g.skipIntro();
  g.begin();
  const l = createLevel(1);
  for (let i = 0; i < l.witness.length; i++) {
    while (g.state.view !== l.views[i]) {
      g.rotate(1);
      time += 250;
      g.tick();
    }
    g.pick(l.witness[i]);
    time += 250;
    g.tick();
  }
  assert.equal(g.phase, "result");
  assert.equal(g.records.entries.length, 1);
  const r = g.records.entries[0];
  assert.equal(r.outcome, "won");
  assert.equal(r.cleared, 126);
  assert.equal(r.total, 126);
  g.end();
  g.home();
  g.hide();
  assert.equal(g.records.entries.length, 1);
});
