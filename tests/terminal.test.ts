import { createLevel } from "../src/core/generation";
import { take } from "../src/core/rules";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Controller } from "../src/controller";
import { UnavailableAd } from "../src/platform/ads";
import { SAVE_KEY, decode, encode } from "../src/platform/storage";
import { RECORDS_KEY, appendResult } from "../src/platform/records";
import { TERMINAL_KEY } from "../src/platform/terminal";
function setup() {
  const data = new Map<string, string>();
  let fail = (k: string, v: string) => false;
  const store = {
    get: (k: string) => data.get(k) ?? null,
    set: (k: string, v: string) => {
      if (fail(k, v)) throw Error("injected " + k);
      data.set(k, v);
    },
  };
  const make = () => new Controller(() => 0, store, new UnavailableAd());
  const g = make();
  g.start();
  g.skipIntro();
  g.begin();
  return { data, store, g, make, fail: (fn: typeof fail) => (fail = fn) };
}
for (const key of [SAVE_KEY, RECORDS_KEY, SAVE_KEY + ".backup", TERMINAL_KEY])
  test(`terminal transaction recovers ${key} write failure without revival or duplication`, () => {
    const x = setup(),
      session = x.g.state.session;
    x.fail((k) => k === key);
    x.g.end();
    assert.equal(x.g.phase, "result");
    assert.match(x.g.message, /保存失败/);
    for (let i = 0; i < 3; i++) {
      const r = x.make();
      assert.equal(r.resume, null);
      r.hide();
    }
    x.fail(() => false);
    const recovered = x.make();
    assert.equal(recovered.resume, null);
    assert.equal(
      recovered.records.entries.filter((r) => r.session === session).length,
      1,
    );
    assert.equal(recovered.records.entries[0].outcome, "lost");
    assert.equal(decode(x.data.get(SAVE_KEY)!)?.phase, "result");
    assert.equal(x.data.get(TERMINAL_KEY), "");
    recovered.start();
    assert.equal(recovered.phase, "intro");
    assert.notEqual(recovered.state.session, session);
  });
test("main plus records failure preserves journal; recovery orders never revive terminal", () => {
  for (const first of [SAVE_KEY, RECORDS_KEY]) {
    const x = setup();
    x.fail((k) => k === SAVE_KEY || k === RECORDS_KEY);
    x.g.end();
    assert.ok(x.data.get(TERMINAL_KEY));
    assert.equal(x.g.records.entries.length, 0);
    x.fail((k) => k === first);
    assert.equal(x.make().resume, null);
    x.fail(() => false);
    assert.equal(x.make().resume, null);
    assert.equal(x.make().records.entries.length, 1);
  }
});
test("all writes fail: no false result, retain in-memory terminal and reject leaving until durable", () => {
  const x = setup();
  x.fail(() => true);
  x.g.end();
  assert.equal(x.g.records.entries.length, 0);
  x.g.home();
  assert.equal(x.g.phase, "result");
  const id = x.g.state.session;
  x.g.start();
  assert.equal(x.g.state.session, id);
  assert.equal(x.g.phase, "result");
  x.fail(() => false);
  x.g.home();
  assert.equal(x.g.phase, "home");
  assert.equal(x.make().resume, null);
  assert.equal(x.make().records.entries.length, 1);
});
test("v013 legacy recorded lost + old active save is fenced, record is not deleted", () => {
  const x = setup();
  const active = x.data.get(SAVE_KEY)!;
  x.g.end();
  const before = x.data.get(RECORDS_KEY);
  x.data.set(SAVE_KEY, active);
  x.data.set(SAVE_KEY + ".backup", active);
  for (let i = 0; i < 3; i++) assert.equal(x.make().resume, null);
  assert.equal(x.data.get(RECORDS_KEY), before);
});
test("pending result cannot be overwritten by a new session; unreadable journal preserved", () => {
  const x = setup();
  x.fail((k) => k === RECORDS_KEY);
  x.g.end();
  const pending = x.data.get(TERMINAL_KEY);
  x.g.start(1);
  assert.equal(x.g.phase, "result");
  assert.equal(x.data.get(TERMINAL_KEY), pending);
  x.data.set(TERMINAL_KEY, "corrupt");
  x.fail(() => false);
  const r = x.make();
  r.start();
  assert.equal(r.phase, "home");
  assert.equal(r.resume, null);
  assert.equal(x.data.get(TERMINAL_KEY), "corrupt");
  assert.match(r.message, /保存失败/);
});
test("journal cleanup failure is idempotent and remains recoverable", () => {
  const x = setup();
  x.fail((k, v) => k === TERMINAL_KEY && !v);
  x.g.end();
  assert.ok(x.data.get(TERMINAL_KEY));
  assert.equal(x.make().resume, null);
  assert.equal(x.g.records.entries.length, 1);
  x.fail(() => false);
  assert.equal(x.make().records.entries.length, 1);
  assert.equal(x.data.get(TERMINAL_KEY), "");
});
test("verified legacy completed victory corrects conflicting lost entry without duplicate or downgrade", () => {
  const x = setup();
  x.g.end();
  const s = structuredClone(x.g.state);
  const level = createLevel(0);
  for (let i = 0; i < level.witness.length; i++)
    s.board = take(s.board, level.witness[i], `legacy-${i}`);
  x.data.set(SAVE_KEY, encode(s));
  const r = x.make();
  assert.equal(r.records.entries.length, 1);
  assert.equal(r.records.entries[0].outcome, "won");
  appendResult(x.store, x.g.state);
  assert.equal(r.records.entries[0].outcome, "won");
});

test("silent main write drop is detected and journal recovery preserves terminal", () => {
  const x = setup(),
    set = x.store.set;
  x.store.set = (k, v) => {
    if (k !== SAVE_KEY) set(k, v);
  };
  x.g.end();
  assert.match(x.g.message, /保存失败/);
  assert.equal(x.make().resume, null);
  assert.equal(x.g.records.entries.length, 1);
  x.store.set = set;
  assert.equal(x.make().resume, null);
  assert.equal(decode(x.data.get(SAVE_KEY)!)?.phase, "result");
});
test("write-then-throw uncertain main result is recovered once without rewriting outcome", () => {
  const x = setup(),
    set = x.store.set;
  x.store.set = (k, v) => {
    set(k, v);
    if (k === SAVE_KEY) throw Error("after write");
  };
  x.g.end();
  assert.equal(x.make().resume, null);
  assert.equal(x.g.records.entries.length, 1);
  x.store.set = set;
  assert.equal(x.make().records.entries.length, 1);
});
test("unreadable terminal journal blocks unsafe restore/new game without deleting storage", () => {
  const x = setup();
  x.g.end();
  const get = x.store.get;
  x.store.get = (k) => {
    if (k === TERMINAL_KEY) throw Error("read failed");
    return get(k);
  };
  const r = x.make();
  assert.equal(r.resume, null);
  r.start();
  assert.equal(r.phase, "home");
  assert.equal(r.records.entries.length, 1);
  x.store.get = get;
  assert.equal(x.make().records.entries.length, 1);
});

test("largest terminal snapshot fits quota without persisting unusable undo history", () => {
  const x = setup();
  x.g.start(2);
  x.g.skipIntro();
  x.g.begin();
  const l = createLevel(2);
  let board = l.board;
  for (let i = 0; i < l.witness.length; i++) {
    x.g.state.history.push(structuredClone(board));
    board = take(board, l.witness[i], `quota-${i}`);
  }
  x.g.state.board = board;
  const set = x.store.set;
  x.store.set = (k, v) => {
    if (
      (k === TERMINAL_KEY || k === SAVE_KEY || k === SAVE_KEY + ".tmp") &&
      v.length > 30000
    )
      throw Error("quota");
    set(k, v);
  };
  x.g.end();
  assert.equal(x.g.records.entries[0]?.outcome, "won");
  assert.equal(decode(x.data.get(SAVE_KEY)!)?.history.length, 0);
  assert.equal(x.data.get(TERMINAL_KEY), "");
  assert.equal(x.g.state.history.length, 216);
  assert.equal(x.make().resume, null);
  x.g.start();
  assert.equal(x.g.phase, "intro");
});

test("active persistence stores one usable undo without losing single-undo restore", () => {
  const x = setup();
  const l = createLevel(0);
  for (let i = 0; i < 9; i++) {
    x.g.state.view = l.views[i];
    x.g.state.history.push(structuredClone(x.g.board));
    x.g.state.board = take(x.g.board, l.witness[i], `active-${i}`);
    x.g.state.undoAvailable = true;
    x.g.state.sequence++;
    x.g.checkpoint();
  }
  assert.equal(x.g.state.history.length, 9);
  const saved = decode(x.data.get(SAVE_KEY)!);
  assert.equal(saved?.history.length, 1);
  const r = x.make();
  r.continueSaved();
  r.begin();
  const score = r.board.score;
  r.undo();
  assert.equal(r.canUndo, false);
  assert.ok(r.board.score <= score);
  r.undo();
  assert.equal(r.canUndo, false);
});
