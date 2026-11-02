"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key2, value) => key2 in obj ? __defProp(obj, key2, { enumerable: true, configurable: true, writable: true, value }) : obj[key2] = value;
  var __publicField = (obj, key2, value) => __defNormalProp(obj, typeof key2 !== "symbol" ? key2 + "" : key2, value);

  // src/platform/music.ts
  var Music = class {
    constructor(create) {
      this.create = create;
      __publicField(this, "player");
      __publicField(this, "unlocked", false);
      __publicField(this, "playing", false);
      __publicField(this, "failed", false);
      __publicField(this, "attempt", 0);
    }
    gesture(enabled, phase) {
      this.unlocked = true;
      this.update(enabled, phase);
    }
    update(enabled, phase) {
      const wanted = enabled && this.unlocked && ["intro", "ready", "active", "resolving", "rotating"].includes(phase);
      if (!wanted || this.failed) {
        this.suspend();
        return;
      }
      if (this.playing) return;
      try {
        if (!this.player) {
          this.player = this.create();
          this.player.onError?.(() => this.fail());
        }
        if (this.failed) return;
        this.playing = true;
        const attempt = ++this.attempt;
        const result = this.player.play();
        if (result && typeof result.then === "function")
          void result.catch(() => {
            if (this.playing && attempt === this.attempt) this.fail();
          });
      } catch {
        this.fail();
      }
    }
    suspend() {
      if (!this.playing) return;
      this.playing = false;
      this.attempt++;
      try {
        this.player?.pause();
      } catch {
      }
    }
    fail() {
      this.failed = true;
      this.suspend();
    }
  };

  // src/platform/frame.ts
  function startFrames(schedule, work, onError) {
    const frame = () => {
      schedule(frame);
      try {
        work();
      } catch (error) {
        onError(error);
      }
    };
    frame();
  }

  // src/config.ts
  var RULE = "tricollect-5-variable-height";
  var CONFIG = Object.freeze({
    baseMs: 3e5,
    capacity: 7,
    match: 3,
    matchScore: 100,
    tubeScore: 20,
    winScore: 500,
    extraMs: 3e4,
    maxExtensions: 2,
    animationMs: 240,
    rotateMs: 250,
    misclickMs: 280,
    searchNodes: 12e3,
    searchMs: 40
  });
  var PRESETS = [
    {
      id: "learn",
      name: "\u7B80\u5355",
      side: 6,
      height: 5,
      heights: [5],
      groups: 1,
      types: 5,
      seed: 104729
    },
    {
      id: "normal",
      name: "\u666E\u901A",
      side: 6,
      height: 7,
      heights: [5, 6, 7],
      groups: 2,
      types: 6,
      seed: 130363
    },
    {
      id: "deep",
      name: "\u56F0\u96BE",
      side: 8,
      height: 7,
      heights: [5, 6, 7],
      groups: 3,
      types: 7,
      seed: 155921
    }
  ];
  var FACES = [
    { name: "\u73CA\u745A\u9762", color: "#c44c30", shell: "#f4d4bf" },
    { name: "\u7FE1\u7FE0\u9762", color: "#237e68", shell: "#d8e6cb" },
    { name: "\u661F\u84DD\u9762", color: "#6552bc", shell: "#e4dcf0" }
  ];
  var PALETTE = [
    "#f34462",
    "#00bc98",
    "#ffbf26",
    "#7d60f0",
    "#16a9ef",
    "#e64fc2",
    "#8bc72d"
  ];
  var SYMBOLS = ["\u25CF", "\u25C6", "\u25B2", "\u271A", "\u25A0", "\u2605", "\u2665"];

  // src/platform/records.ts
  var RECORDS_KEY = "tricollect.records.v1";
  var RECORD_LIMIT = 30;
  function parse(raw) {
    if (!raw) return [];
    try {
      const v = JSON.parse(raw);
      if (v.schema !== 1 || !Array.isArray(v.entries) || v.entries.length > RECORD_LIMIT)
        return null;
      const a = v.entries;
      if (new Set(a.map((r) => r.session)).size !== a.length || a.some(
        (r) => typeof r.session !== "string" || !r.session || !Number.isFinite(r.endedAt) || r.endedAt < 0 || !Number.isInteger(r.preset) || !PRESETS[r.preset] || typeof r.difficulty !== "string" || !["won", "lost"].includes(r.outcome) || ![r.score, r.cleared, r.total, r.elapsedMs, r.addedMs].every(
          (n) => Number.isFinite(n) && n >= 0
        ) || r.total < 1 || r.cleared > r.total || r.elapsedMs > CONFIG.baseMs + CONFIG.extraMs * CONFIG.maxExtensions
      ))
        return null;
      return a;
    } catch {
      return null;
    }
  }
  function readRecords(store) {
    try {
      const raw = store.get(RECORDS_KEY), a = parse(raw);
      if (a) return { entries: a, available: true, recovered: false };
      const backupRaw = store.get(RECORDS_KEY + ".backup");
      const backup = backupRaw ? parse(backupRaw) : null;
      return {
        entries: backup ?? [],
        available: backup !== null,
        recovered: true
      };
    } catch {
      return { entries: [], available: false, recovered: false };
    }
  }
  function appendResult(store, s) {
    if (!s.started || s.phase !== "result" || s.finishedAt === void 0)
      return true;
    const loaded = readRecords(store);
    if (!loaded.available) return false;
    if (loaded.entries.some((r) => r.session === s.session)) return true;
    const entry = {
      session: s.session,
      endedAt: s.finishedAt,
      preset: s.preset,
      difficulty: PRESETS[s.preset].name,
      outcome: s.board.status === "won" ? "won" : "lost",
      score: s.board.score,
      cleared: s.board.cleared.length,
      total: s.board.tubes.reduce((n, t) => n + t.capacity, 0),
      elapsedMs: Math.max(0, CONFIG.baseMs + s.added - s.remaining),
      addedMs: s.added
    };
    const payload = JSON.stringify({
      schema: 1,
      entries: [entry, ...loaded.entries].slice(0, RECORD_LIMIT)
    });
    try {
      store.set(
        RECORDS_KEY + ".backup",
        JSON.stringify({ schema: 1, entries: loaded.entries })
      );
      store.set(RECORDS_KEY, payload);
      return store.get(RECORDS_KEY) === payload;
    } catch {
      return false;
    }
  }

  // src/core/rules.ts
  var DIRS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, -1],
    [-1, 1]
  ];
  var clone = (x) => JSON.parse(JSON.stringify(x));
  var key = (q, r) => `${q},${r}`;
  var boundary = (t, n) => t.q === 0 || t.r === 0 || t.q + t.r === n - 1;
  function exposed(b) {
    const lookup = new Map(b.tubes.map((t) => [key(t.q, t.r), t]));
    const empty = /* @__PURE__ */ new Set();
    const queue = b.tubes.filter((t) => !t.balls.length && boundary(t, b.side));
    for (const t of queue) empty.add(t.id);
    for (let i = 0; i < queue.length; i++)
      for (const [dq, dr] of DIRS) {
        const t = lookup.get(key(queue[i].q + dq, queue[i].r + dr));
        if (t && !t.balls.length && !empty.has(t.id)) {
          empty.add(t.id);
          queue.push(t);
        }
      }
    return new Set(
      b.tubes.filter(
        (t) => t.balls.length && (boundary(t, b.side) || DIRS.some(([dq, dr]) => empty.has(key(t.q + dq, t.r + dr))))
      ).map((t) => t.id)
    );
  }
  function faceCoordinates(t, side, view) {
    const axes = [t.q, t.r, side - 1 - t.q - t.r];
    return { lane: axes[view], depth: axes[(view + 1) % 3] };
  }
  function faceWindows(b, view) {
    const result = /* @__PURE__ */ new Map();
    if (!Number.isInteger(view) || view < 0 || view > 2) return result;
    const outside = exposed(b), covered = /* @__PURE__ */ new Set();
    const ordered = b.tubes.filter((t) => t.balls.length).sort(
      (a, c) => faceCoordinates(a, b.side, view).depth - faceCoordinates(c, b.side, view).depth
    );
    for (const t of ordered) {
      const { lane, depth } = faceCoordinates(t, b.side, view), center = 2 * lane + depth;
      const segments = [center - 1, center], windows = segments.filter((i) => !covered.has(i));
      if (windows.length === 2 && outside.has(t.id)) result.set(t.id, windows);
      for (const segment of segments) covered.add(segment);
    }
    return result;
  }
  function faceVisible(b, view) {
    return new Set(faceWindows(b, view).keys());
  }
  function available(b) {
    return new Set([0, 1, 2].flatMap((v) => [...faceVisible(b, v)]));
  }
  function take(b, tubeId, actionId) {
    if (b.status !== "playing" || b.applied.includes(actionId) || !available(b).has(tubeId))
      return b;
    const n = clone(b), t = n.tubes.find((t2) => t2.id === tubeId);
    const ball = t.balls.pop();
    n.tray.push(ball);
    const group = n.tray.filter((x) => x.type === ball.type);
    if (group.length === CONFIG.match) {
      n.cleared.push(...group);
      n.tray = n.tray.filter((x) => x.type !== ball.type);
      n.score += CONFIG.matchScore;
    }
    if (!t.balls.length) n.score += CONFIG.tubeScore;
    if (n.tubes.every((t2) => !t2.balls.length) && !n.tray.length) {
      n.status = "won";
      n.score += CONFIG.winScore;
    } else if (n.tray.length >= CONFIG.capacity) n.status = "blocked";
    n.applied.push(actionId);
    return n;
  }
  function invariant(b, expected) {
    if (!b || !Number.isInteger(b.side) || b.side < 4 || b.side > 8 || !Array.isArray(b.tubes) || !Array.isArray(b.tray) || !Array.isArray(b.cleared) || !Array.isArray(b.applied))
      return false;
    if (b.tubes.length !== b.side * (b.side + 1) / 2 || new Set(b.tubes.map((t) => t.id)).size !== b.tubes.length)
      return false;
    if (b.tubes.some(
      (t) => !Number.isInteger(t.q) || !Number.isInteger(t.r) || t.q < 0 || t.r < 0 || t.q + t.r >= b.side || t.id !== key(t.q, t.r) || !Array.isArray(t.balls) || !Number.isInteger(t.capacity) || t.capacity < 1 || t.capacity > 8 || t.balls.length > t.capacity
    ))
      return false;
    const all = [...b.tubes.flatMap((t) => t.balls), ...b.tray, ...b.cleared];
    if (all.length !== expected || new Set(all.map((x) => x.id)).size !== all.length || all.some(
      (x) => typeof x.id !== "string" || !Number.isInteger(x.type) || x.type < 0 || x.type > 6
    ))
      return false;
    if (b.tray.length > CONFIG.capacity || new Set(b.applied).size !== b.applied.length || b.applied.some((x) => typeof x !== "string"))
      return false;
    for (let type = 0; type < 7; type++)
      if (b.tray.filter((x) => x.type === type).length >= 3 || b.cleared.filter((x) => x.type === type).length % 3 !== 0)
        return false;
    const won = b.tubes.every((t) => !t.balls.length) && !b.tray.length;
    const expectedStatus = won ? "won" : b.tray.length === CONFIG.capacity ? "blocked" : "playing";
    return b.status === expectedStatus && b.score === b.cleared.length / 3 * CONFIG.matchScore + b.tubes.filter((t) => !t.balls.length).length * CONFIG.tubeScore + (won ? CONFIG.winScore : 0);
  }
  function replay(initial, path) {
    let b = clone(initial);
    for (let i = 0; i < path.length; i++) {
      let id = `replay-${i}`;
      while (b.applied.includes(id)) id += "-";
      const n = take(b, path[i], id);
      if (n === b) throw Error(`Illegal witness step ${i}`);
      b = n;
    }
    return b;
  }

  // src/core/generation.ts
  function random(seed) {
    let a = seed >>> 0;
    return () => {
      a += 1831565813;
      let t = a;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function generate(p, seed) {
    const rnd = random(seed), tubes = [];
    for (let q = 0; q < p.side; q++)
      for (let r = 0; r < p.side - q; r++)
        tubes.push({
          id: key(q, r),
          q,
          r,
          capacity: p.heights?.[tubes.length % p.heights.length] ?? p.height,
          balls: Array.from(
            { length: p.heights?.[tubes.length % p.heights.length] ?? p.height },
            (_, i) => ({
              id: `${q},${r}:${i}`,
              type: 0
            })
          )
        });
    const b = {
      side: p.side,
      tubes,
      tray: [],
      cleared: [],
      score: 0,
      status: "playing",
      applied: []
    };
    const scratch = JSON.parse(JSON.stringify(b)), order = [];
    while (scratch.tubes.some((t) => t.balls.length)) {
      const e = [...available(scratch)], selected = e[Math.floor(rnd() * e.length)];
      const t = scratch.tubes.find((t2) => t2.id === selected);
      order.push({
        tube: t.id,
        index: t.balls.length - 1,
        view: [0, 1, 2].find((v) => faceVisible(scratch, v).has(t.id))
      });
      t.balls.pop();
    }
    if (order.length % 3) throw Error("Total must be divisible by three");
    const types = [];
    const groups = p.groups ?? 2;
    for (let g = 0; g < order.length / 3; g += groups) {
      const window2 = [];
      for (let k = 0; k < groups && g + k < order.length / 3; k++)
        window2.push(...Array(3).fill((g + k) % p.types));
      for (let i = window2.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [window2[i], window2[j]] = [window2[j], window2[i]];
      }
      types.push(...window2);
    }
    order.forEach(
      (o, i) => b.tubes.find((t) => t.id === o.tube).balls[o.index].type = types[i]
    );
    const witness = order.map((o) => o.tube), end = replay(b, witness);
    if (end.status !== "won" || !invariant(end, order.length))
      throw Error("Witness validation failed");
    return {
      board: b,
      witness,
      views: order.map((o) => o.view),
      seed,
      preset: p.id,
      fallback: false
    };
  }
  function createLevel(index, seed) {
    const p = PRESETS[index] ?? PRESETS[0];
    try {
      return generate(p, seed ?? p.seed);
    } catch {
      const level = generate(p, p.seed);
      return { ...level, fallback: true };
    }
  }

  // src/core/solver.ts
  function solve(initial, now, maxNodes = CONFIG.searchNodes, maxMs = CONFIG.searchMs, firstVisible) {
    const start2 = now();
    let nodes = 0, exhausted = false;
    const seen = /* @__PURE__ */ new Set();
    function dfs(b, first = false) {
      if (b.status === "won") return [];
      if (b.status === "blocked") return null;
      if (++nodes > maxNodes || now() - start2 >= maxMs) {
        exhausted = true;
        return null;
      }
      const k = b.tubes.map((t) => t.balls.length).join(",") + "|" + b.tray.map((x) => x.type).sort().join(",");
      if (seen.has(k)) return null;
      seen.add(k);
      const ids = [...available(b)].filter((id) => !first || !firstVisible || firstVisible.has(id)).sort((a, c) => {
        const count = (id) => b.tray.filter(
          (x) => x.type === b.tubes.find((t) => t.id === id).balls.slice(-1)[0].type
        ).length;
        return count(c) - count(a);
      });
      for (const id of ids) {
        const path2 = dfs(take(b, id, `solver-${nodes}-${id}`));
        if (path2) return [id, ...path2];
        if (exhausted) return null;
      }
      return null;
    }
    const path = dfs(initial, true);
    if (path && replay(initial, path).status === "won")
      return { status: "safe", path, nodes };
    return { status: exhausted ? "unknown" : "dead", nodes };
  }

  // src/platform/storage.ts
  var SAVE_KEY = "tricollect.save.v1";
  function hash(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++)
      h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return (h >>> 0).toString(16);
  }
  var originals = /* @__PURE__ */ new Map();
  function originalFor(preset, seed) {
    const key2 = `${preset}:${seed}`;
    if (!originals.has(key2)) {
      if (originals.size >= 32) originals.delete(originals.keys().next().value);
      originals.set(key2, createLevel(preset, seed).board);
    }
    return originals.get(key2);
  }
  var lastStored = /* @__PURE__ */ new WeakMap();
  function valid(s) {
    try {
      if (s.schema !== 1 || s.rule !== RULE || typeof s.session !== "string" || !Number.isInteger(s.seed) || !Number.isInteger(s.preset) || !PRESETS[s.preset])
        return false;
      if (!Number.isFinite(s.remaining) || s.remaining < 0 || s.remaining > CONFIG.baseMs + CONFIG.extraMs * CONFIG.maxExtensions || !Number.isInteger(s.extensions) || s.extensions < 0 || s.extensions > CONFIG.maxExtensions || s.added !== s.extensions * CONFIG.extraMs)
        return false;
      if (!Number.isInteger(s.hintsUsed) || s.hintsUsed < 0 || s.undoAvailable !== void 0 && typeof s.undoAvailable !== "boolean" || !Number.isInteger(s.undosUsed) || s.undosUsed < 0)
        return false;
      if (!Number.isInteger(s.sequence) || s.sequence < 0 || !Number.isInteger(s.view) || s.view < 0 || s.view > 2 || typeof s.sound !== "boolean" || s.started !== void 0 && typeof s.started !== "boolean" || s.finishedAt !== void 0 && (!Number.isFinite(s.finishedAt) || s.finishedAt < 0) || !["ready", "paused", "blocked", "expired", "result"].includes(s.phase))
        return false;
      if (!Array.isArray(s.rewards) || new Set(s.rewards.map((r) => r.id)).size !== s.rewards.length || s.rewards.some(
        (r) => r.session !== s.session || typeof r.id !== "string" || !["requested", "completed", "cancelled", "failed"].includes(
          r.state
        ) || typeof r.redeemed !== "boolean" || r.redeemed !== (r.state === "completed")
      ))
        return false;
      if (s.rewards.filter((r) => r.redeemed).length !== s.extensions)
        return false;
      const original = originalFor(s.preset, s.seed), all = original.tubes.flatMap((t) => t.balls), identities = new Map(all.map((b) => [b.id, b.type]));
      const check = (b) => invariant(b, all.length) && b.side === original.side && [...b.tubes.flatMap((t) => t.balls), ...b.tray, ...b.cleared].every(
        (b2) => identities.get(b2.id) === b2.type
      ) && b.tubes.every(
        (t) => t.capacity === original.tubes.find((x) => x.id === t.id)?.capacity && t.balls.every(
          (b2, i) => original.tubes.find((x) => x.id === t.id)?.balls[i]?.id === b2.id
        )
      );
      return check(s.board) && Array.isArray(s.history) && s.history.length <= all.length && s.history.every(check);
    } catch {
      return false;
    }
  }
  function encode(s) {
    const payload = JSON.stringify(s);
    return JSON.stringify({ checksum: hash(payload), payload });
  }
  function decode(raw) {
    try {
      if (!raw) return null;
      const e = JSON.parse(raw);
      if (typeof e.payload !== "string" || hash(e.payload) !== e.checksum)
        return null;
      const s = JSON.parse(e.payload);
      return valid(s) ? s : null;
    } catch {
      return null;
    }
  }
  function save(store, s) {
    const encoded = encode(s);
    if (!valid(s)) throw Error("Refusing invalid save");
    store.set(SAVE_KEY + ".tmp", encoded);
    if (store.get(SAVE_KEY + ".tmp") !== encoded)
      throw Error("Storage readback failed");
    const previous = store.get(SAVE_KEY);
    if (previous && (previous === lastStored.get(store) || decode(previous)))
      store.set(SAVE_KEY + ".backup", previous);
    store.set(SAVE_KEY, encoded);
    lastStored.set(store, encoded);
  }
  function restore(store) {
    try {
      const raw = store.get(SAVE_KEY), s = decode(raw);
      if (s) return { save: s, message: "\u5DF2\u627E\u5230\u672A\u5B8C\u6210\u7684\u4E00\u5C40" };
      const backup = decode(store.get(SAVE_KEY + ".backup"));
      return {
        save: backup,
        message: backup ? "\u4E3B\u5B58\u6863\u635F\u574F\uFF0C\u5DF2\u6062\u590D\u4E0A\u4E00\u6709\u6548\u8BB0\u5F55" : raw ? "\u5B58\u6863\u635F\u574F\u6216\u7248\u672C\u4E0D\u517C\u5BB9\uFF0C\u8BF7\u91CD\u65B0\u5F00\u59CB" : ""
      };
    } catch {
      return { save: null, message: "\u672C\u5730\u5B58\u50A8\u4E0D\u53EF\u7528\uFF0C\u672C\u6B21\u53EF\u7EE7\u7EED\u6E38\u73A9" };
    }
  }

  // src/controller.ts
  var Controller = class {
    constructor(now, store, ads2, playSound = () => {
    }) {
      this.now = now;
      this.store = store;
      this.ads = ads2;
      this.playSound = playSound;
      __publicField(this, "phase", "home");
      __publicField(this, "state");
      __publicField(this, "message", "\u65CB\u8F6C\u7403\u4ED3 \xB7 \u6536\u96C6\u4E09\u540C \xB7 \u63ED\u5F00\u5185\u5C42");
      __publicField(this, "hint", null);
      __publicField(this, "resume", null);
      __publicField(this, "introProgress", 0);
      __publicField(this, "rotation", 0);
      __publicField(this, "turnFrom", 0);
      __publicField(this, "turnTo", 0);
      __publicField(this, "turnDirection", 1);
      __publicField(this, "pendingTurns", 0);
      __publicField(this, "turnStart", 0);
      __publicField(this, "last", 0);
      __publicField(this, "until", 0);
      __publicField(this, "animationStart", 0);
      __publicField(this, "after", "active");
      __publicField(this, "lastCheckpoint", 0);
      this.state = this.fresh(0, PRESETS[0].seed);
      const loaded = restore(store);
      this.resume = loaded.save && loaded.save.phase !== "result" ? loaded.save : null;
      if (loaded.message) this.message = loaded.message;
      if (loaded.save?.phase === "result" && loaded.save.finishedAt !== void 0)
        appendResult(store, loaded.save);
    }
    fresh(preset, seed) {
      const level = createLevel(preset, seed);
      return {
        schema: 1,
        rule: RULE,
        session: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        seed: level.seed,
        preset,
        board: level.board,
        history: [],
        undoAvailable: false,
        remaining: CONFIG.baseMs,
        added: 0,
        extensions: 0,
        rewards: [],
        sequence: 0,
        view: 0,
        hintsUsed: 0,
        undosUsed: 0,
        phase: "ready",
        sound: this.soundPreference()
      };
    }
    get records() {
      return readRecords(this.store);
    }
    get board() {
      return this.state.board;
    }
    get transitionProgress() {
      return Math.min(
        1,
        Math.max(0, (this.now() - this.animationStart) / CONFIG.animationMs)
      );
    }
    get turnProgress() {
      return this.phase === "rotating" ? Math.min(
        1,
        Math.max(0, (this.now() - this.turnStart) / CONFIG.rotateMs)
      ) : 1;
    }
    get presentationView() {
      return this.phase === "rotating" ? this.turnProgress < 0.5 ? this.turnFrom : this.turnTo : this.state.view;
    }
    get visible() {
      return faceVisible(this.board, this.state.view);
    }
    get canTurn() {
      return this.phase === "active" || this.phase === "rotating";
    }
    get canUndo() {
      return this.state.history.length > 0 && this.state.undoAvailable !== false;
    }
    get locked() {
      return this.phase !== "active";
    }
    start(preset = 0, seed) {
      this.state = this.fresh(preset, seed ?? PRESETS[preset].seed);
      this.resume = null;
      this.pendingTurns = 0;
      this.phase = "intro";
      this.animationStart = this.now();
      this.until = this.animationStart + 950;
      this.rotation = 0;
      this.hint = null;
      this.message = "\u7403\u4ED3\u51C6\u5907\u4E2D";
      this.checkpoint();
    }
    continueSaved() {
      if (!this.resume) return;
      this.state = clone(this.resume);
      this.state.sound = this.soundPreference(this.state.sound);
      this.resume = null;
      this.phase = this.state.phase === "ready" ? "ready" : this.state.board.status === "blocked" ? "blocked" : this.state.remaining <= 0 ? "expired" : "paused";
      for (const r of this.state.rewards)
        if (r.state === "requested") r.state = "failed";
      this.rotation = this.state.view * Math.PI * 2 / 3;
      this.message = "\u5DF2\u6062\u590D\u3002\u4E3B\u52A8\u7EE7\u7EED\u540E\u624D\u5F00\u59CB\u8BA1\u65F6\u3002";
    }
    skipIntro() {
      if (this.phase === "intro") {
        this.phase = "ready";
        this.introProgress = 1;
      }
    }
    begin() {
      if (this.phase !== "ready" && this.phase !== "paused") return;
      this.phase = this.board.status === "blocked" ? "blocked" : this.state.remaining <= 0 ? "expired" : "active";
      this.state.started = true;
      this.last = this.now();
      this.message = "\u53D6\u9876\u90E8\u7403\uFF0C\u4E09\u9897\u540C\u7C7B\u81EA\u52A8\u6D88\u9664";
      this.checkpoint();
    }
    tick() {
      if (!["active", "resolving", "rotating", "intro"].includes(this.phase))
        return;
      const now = this.now();
      if (this.phase === "active") {
        this.state.remaining = Math.max(
          0,
          this.state.remaining - Math.max(0, now - this.last)
        );
        this.last = now;
        if (this.state.remaining === 0) {
          this.phase = "expired";
          this.message = "\u65F6\u95F4\u7528\u5C3D\uFF0C\u53EF\u4EE5\u7ED3\u675F\u6216\u81EA\u613F\u7EED\u65F6";
          this.checkpoint();
        } else if (now - this.lastCheckpoint > 1e3) this.checkpoint();
      }
      if (this.phase === "intro") {
        this.introProgress = Math.min(1, (now - this.animationStart) / 950);
        if (now >= this.until) this.skipIntro();
      }
      if (this.phase === "rotating" && now - this.turnStart >= CONFIG.rotateMs) {
        if (this.pendingTurns) {
          const direction = Math.sign(this.pendingTurns);
          this.pendingTurns -= direction;
          this.turnFrom = this.turnTo;
          this.turnTo = (this.turnTo + direction + 3) % 3;
          this.turnDirection = direction;
          this.turnStart = now;
        } else {
          this.phase = "active";
          this.rotation = this.state.view * Math.PI * 2 / 3;
          this.last = now;
          this.checkpoint();
        }
      }
      if (this.phase === "resolving" && now >= this.until) {
        this.phase = this.after;
        this.last = now;
        this.rotation = this.state.view * Math.PI * 2 / 3;
        this.checkpoint();
      }
    }
    pick(id) {
      this.tick();
      if (this.phase !== "active") return;
      if (!this.visible.has(id)) {
        this.message = "\u8BE5\u7BA1\u4E0D\u5728\u5F53\u524D\u6B63\u9762\uFF0C\u8BF7\u65CB\u8F6C\u540E\u518D\u53D6\u7403";
        return;
      }
      const before = this.board;
      const after = take(
        before,
        id,
        `${this.state.session}:${++this.state.sequence}`
      );
      if (after === before) {
        this.message = "\u5148\u6E05\u7A7A\u5916\u4FA7\u5BB9\u5668\uFF0C\u53EA\u80FD\u53D6\u9876\u90E8\u7403";
        return;
      }
      this.state.history.push(clone(before));
      this.state.undoAvailable = true;
      this.state.board = after;
      this.hint = null;
      this.message = after.cleared.length > before.cleared.length ? "\u4E09\u540C\u6536\u96C6\u6210\u529F +100" : "\u5DF2\u653E\u5165\u6682\u5B58\u69FD";
      this.after = after.status === "won" ? "result" : after.status === "blocked" ? "blocked" : "active";
      this.phase = "resolving";
      this.animationStart = this.now();
      this.until = this.animationStart + CONFIG.animationMs;
      this.checkpoint();
      if (this.state.sound) {
        try {
          this.playSound();
        } catch (error) {
          console.warn("TriCollect audio unavailable", error);
        }
      }
    }
    rotate(direction) {
      this.tick();
      if (!this.canTurn || direction !== 1 && direction !== -1) return;
      direction = -direction;
      const from = this.state.view;
      this.state.view = (from + direction + 3) % 3;
      if (this.phase === "rotating")
        this.pendingTurns = (this.pendingTurns + direction) % 3;
      else {
        this.turnFrom = from;
        this.turnTo = this.state.view;
        this.turnDirection = direction;
        this.pendingTurns = 0;
        this.turnStart = this.now();
        this.phase = "rotating";
      }
      this.hint = null;
      this.checkpoint();
    }
    interrupt(error) {
      console.error("TriCollect frame interrupted", error);
      this.pendingTurns = 0;
      this.rotation = this.state.view * Math.PI * 2 / 3;
      if (this.phase !== "home" && this.phase !== "result" && this.phase !== "ad") {
        this.pendingTurns = 0;
        this.phase = this.board.status === "won" ? "result" : "paused";
        this.state.phase = this.board.status === "won" ? "result" : "paused";
        try {
          save(this.store, this.state);
        } catch {
        }
      }
      this.message = "\u8FD0\u884C\u6682\u65F6\u4E2D\u65AD\uFF0C\u5DF2\u6682\u505C\uFF1B\u53EF\u7EE7\u7EED\u6216\u8FD4\u56DE\u9996\u9875";
    }
    pause() {
      this.tick();
      if (["active", "resolving", "rotating"].includes(this.phase)) {
        this.pendingTurns = 0;
        this.phase = this.board.status === "won" ? "result" : "paused";
        this.rotation = this.state.view * Math.PI * 2 / 3;
        this.checkpoint();
      }
    }
    hide() {
      if (this.phase === "home") return;
      this.tick();
      if (this.phase === "intro") this.skipIntro();
      if (this.phase !== "ad") this.pause();
      this.checkpoint();
    }
    undo() {
      this.tick();
      if (!["active", "blocked"].includes(this.phase) || !this.canUndo) return;
      this.state.undosUsed++;
      this.state.board = this.state.history.pop();
      this.state.undoAvailable = false;
      this.phase = "active";
      this.last = this.now();
      this.hint = null;
      this.message = "\u5DF2\u64A4\u9500\uFF1B\u5DF2\u7528\u65F6\u95F4\u4E0D\u4F1A\u8FD4\u8FD8";
      this.checkpoint();
    }
    hintNow() {
      this.tick();
      if (this.phase !== "active") return;
      const result = solve(
        this.board,
        this.now,
        CONFIG.searchNodes,
        CONFIG.searchMs,
        this.visible
      );
      this.tick();
      if (this.phase !== "active") return;
      if (result.status === "safe") this.state.hintsUsed++;
      this.hint = result.status === "safe" ? result.path[0] : null;
      this.message = result.status === "safe" ? "\u5F53\u524D\u9762\u4EAE\u6846\u7BA1\u4F4D\u6709\u5DF2\u9A8C\u8BC1\u7684\u540E\u7EED\u89E3" : result.status === "unknown" ? "\u9884\u7B97\u5185\u5C1A\u672A\u786E\u5B9A\uFF0C\u53EF\u5C1D\u8BD5\u64A4\u9500\u6216\u7EE7\u7EED\u89C2\u5BDF" : "\u5F53\u524D\u9762\u6682\u65E0\u53EF\u9760\u8DEF\u7EBF\uFF0C\u53EF\u65CB\u8F6C\u540E\u518D\u63D0\u793A";
    }
    end() {
      if (this.phase === "ad" || this.phase === "home") return;
      this.tick();
      this.phase = "result";
      this.hint = null;
      this.checkpoint();
    }
    home() {
      if (this.phase === "ad" || this.phase === "home") return;
      this.pause();
      this.checkpoint();
      this.resume = this.phase === "result" ? null : clone(this.state);
      this.phase = "home";
    }
    soundPreference(fallback = true) {
      try {
        const value = this.store.get("tricollect.sound.v1");
        return value === null ? fallback : value !== "off";
      } catch {
        return fallback;
      }
    }
    toggleSound() {
      this.state.sound = !this.state.sound;
      try {
        this.store.set("tricollect.sound.v1", this.state.sound ? "on" : "off");
      } catch {
      }
      this.checkpoint();
    }
    async extend() {
      this.tick();
      if (this.phase !== "expired" || this.state.extensions >= CONFIG.maxExtensions || !this.ads.available)
        return;
      const session = this.state.session, id = `${session}:reward:${++this.state.sequence}`;
      this.state.rewards.push({
        id,
        session,
        state: "requested",
        redeemed: false
      });
      this.phase = "ad";
      this.message = "\u5E7F\u544A\u8BF7\u6C42\u4E2D\uFF0C\u68CB\u76D8\u548C\u8BA1\u65F6\u5DF2\u6682\u505C";
      this.checkpoint();
      let outcome;
      try {
        outcome = await this.ads.request();
      } catch {
        outcome = "failed";
      }
      this.reward(session, id, outcome);
    }
    reward(session, id, outcome) {
      const r = this.state.rewards.find((r2) => r2.id === id);
      if (session !== this.state.session || this.phase !== "ad" || !r || r.state !== "requested")
        return;
      r.state = outcome;
      if (outcome === "completed" && !r.redeemed) {
        r.redeemed = true;
        this.state.extensions++;
        this.state.added += CONFIG.extraMs;
        this.state.remaining += CONFIG.extraMs;
        this.phase = "paused";
        this.message = "\u5DF2\u589E\u52A0 30 \u79D2\uFF0C\u70B9\u51FB\u7EE7\u7EED";
      } else {
        this.phase = "expired";
        this.message = outcome === "cancelled" ? "\u672A\u5B8C\u6210\u89C2\u770B\uFF0C\u6CA1\u6709\u53D1\u653E\u5956\u52B1" : "\u5E7F\u544A\u4E0D\u53EF\u7528\uFF0C\u539F\u5C40\u5DF2\u4FDD\u7559";
      }
      this.checkpoint();
    }
    checkpoint() {
      var _a;
      if (this.phase === "home") return;
      this.state.phase = this.phase === "result" || this.board.status === "won" ? "result" : this.board.status === "blocked" ? "blocked" : this.state.remaining <= 0 ? "expired" : this.phase === "ready" || this.phase === "intro" ? "ready" : "paused";
      if (this.state.phase === "result" && this.state.started)
        (_a = this.state).finishedAt ?? (_a.finishedAt = Date.now());
      try {
        save(this.store, this.state);
        this.lastCheckpoint = this.now();
      } catch {
        this.message = "\u5B58\u6863\u5199\u5165\u5931\u8D25\uFF0C\u672C\u5C40\u53EF\u7EE7\u7EED\uFF1B\u9000\u51FA\u53EF\u80FD\u4E22\u5931\u8FDB\u5EA6";
      }
      if (!appendResult(this.store, this.state))
        this.message = "\u672C\u673A\u6218\u7EE9\u4FDD\u5B58\u5931\u8D25\uFF0C\u672C\u5C40\u4ECD\u53EF\u7ED3\u675F";
    }
  };

  // src/render/projection.ts
  function worldPosition(t, side) {
    const edge = side - 1;
    return {
      x: t.q + t.r / 2 - edge / 2,
      z: (t.r - edge / 3) * Math.sqrt(3) / 2
    };
  }
  function rotateWorld(p, angle) {
    return {
      x: p.x * Math.cos(angle) + p.z * Math.sin(angle),
      z: -p.x * Math.sin(angle) + p.z * Math.cos(angle)
    };
  }
  function projection(side, width, top, bottom, angle, maxCapacity = 5) {
    const edge = side - 1;
    const lane = (width - 32) / (2 * edge / Math.sqrt(3) + 1), radius = lane / 2;
    const originalDepth = Math.min(108, edge * 18, (bottom - top) * 0.24);
    const depthSpace = originalDepth * 0.62;
    const zScale = depthSpace / (edge * Math.sqrt(3) / 2), extent = depthSpace * 2 / 3;
    const maxHeight = Math.min(220, bottom - top - 48 - originalDepth * 4 / 3);
    const ballRadius = Math.min(
      radius * 0.78,
      (maxHeight - 20) / (maxCapacity * 2)
    ), step = ballRadius * 2, height = step * maxCapacity + 20;
    const axis = {
      x: width / 2,
      y: top + 30 + height + extent + Math.max(0, (bottom - top - 48 - height - extent * 2) / 2)
    };
    const point = (t) => {
      const p = rotateWorld(worldPosition(t, side), angle);
      return { x: axis.x + p.x * lane, y: axis.y - p.z * zScale, depth: p.z };
    };
    return { axis, lane, radius, height, step, ballRadius, zScale, point };
  }

  // src/render/scene.ts
  var Scene = class {
    constructor(ctx2, game2, width, height) {
      this.ctx = ctx2;
      this.game = game2;
      this.width = width;
      this.height = height;
      __publicField(this, "buttons", []);
      __publicField(this, "homePanel", null);
      __publicField(this, "recordPage", 0);
      __publicField(this, "mascotTime", 0);
      __publicField(this, "misclickFeedback", null);
      __publicField(this, "backgroundLoaded", false);
      __publicField(this, "background", null);
      __publicField(this, "playBackground", null);
      __publicField(this, "playBackgroundLoaded", false);
      __publicField(this, "renderedIds", []);
      __publicField(this, "ghostPositions", []);
      __publicField(this, "ballPositions", []);
      __publicField(this, "flightOrigin", null);
      __publicField(this, "rotationAxis", { x: 0, y: 0 });
      __publicField(this, "decorativeTray", null);
      __publicField(this, "projectionScale", { x: 1, z: 1 });
      __publicField(this, "visibleBalls", []);
      __publicField(this, "tubeLayout", []);
      __publicField(this, "silhouetteIds", []);
      __publicField(this, "rearOpenings", []);
      __publicField(this, "renderedFace", 0);
      __publicField(this, "targets", []);
      __publicField(this, "bodies", []);
    }
    get backgroundKind() {
      return this.game.phase === "home" ? this.background ? "home" : "fallback" : this.playBackground ? "play" : this.background ? "home" : "fallback";
    }
    get currentBackground() {
      return this.game.phase === "home" ? this.background : this.playBackground ?? this.background;
    }
    setPlayBackground(image) {
      this.playBackground = image;
      this.playBackgroundLoaded = true;
    }
    setBackground(image) {
      this.background = image;
      this.backgroundLoaded = true;
    }
    text(t, x, y, size = 14, color = "#284b40", align = "left") {
      const c = this.ctx;
      c.font = `${size >= 24 ? "600" : "400"} ${size}px sans-serif`;
      c.fillStyle = color;
      c.textAlign = align;
      c.fillText(t, x, y);
    }
    rect(x, y, w, h, color, r = 12) {
      const c = this.ctx;
      c.beginPath();
      c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + h, r);
      c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r);
      c.arcTo(x, y, x + w, y, r);
      c.closePath();
      c.fillStyle = color;
      c.fill();
    }
    button(id, label, x, y, w, h, act, disabled = false, accent = false) {
      const primary = accent || id === "hint" || id === "again";
      const fill = disabled ? "#b5bdb0" : primary ? "#f5a340" : "#278b71";
      this.rect(x - 2, y - 2, w + 4, h + 10, "#355447", 16);
      this.rect(
        x,
        y + 5,
        w,
        h,
        disabled ? "#8a9587" : primary ? "#a95f27" : "#1b5749",
        14
      );
      this.rect(x, y, w, h, fill, 14);
      this.rect(
        x + 5,
        y + 3,
        w - 10,
        Math.min(10, h / 4),
        disabled ? "#ffffff08" : "#ffffff30",
        7
      );
      this.text(
        label,
        x + w / 2,
        y + h / 2 + 5,
        id.startsWith("rotate") ? 24 : 15,
        disabled ? "#4f5c50" : primary ? "#3b2b1d" : "#ffffff",
        "center"
      );
      this.buttons.push({ id, x, y, w, h, act, disabled });
    }
    ball(type, x, y, r, alpha = 1) {
      const c = this.ctx;
      c.save();
      try {
        c.globalAlpha = alpha;
        c.fillStyle = "#344b3550";
        c.beginPath();
        c.ellipse(
          x + r * 0.22,
          y + r * 0.86,
          r * 0.88,
          r * 0.23,
          0,
          0,
          Math.PI * 2
        );
        c.fill();
        const shade = (mix) => {
          const rgb = PALETTE[type].slice(1).match(/../g).map((n) => parseInt(n, 16));
          return "#" + rgb.map(
            (v) => Math.round(mix > 0 ? v + (255 - v) * mix : v * (1 + mix)).toString(16).padStart(2, "0")
          ).join("");
        };
        const gradient = c.createRadialGradient(
          x - r * 0.32,
          y - r * 0.38,
          r * 0.05,
          x,
          y,
          r
        );
        gradient.addColorStop(0, shade(0.34));
        gradient.addColorStop(0.3, shade(0.08));
        gradient.addColorStop(0.5, PALETTE[type]);
        gradient.addColorStop(0.78, shade(-0.12));
        gradient.addColorStop(1, shade(-0.6));
        c.fillStyle = gradient;
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.fill();
        const glint = c.createRadialGradient(
          x - r * 0.31,
          y - r * 0.4,
          0,
          x - r * 0.31,
          y - r * 0.4,
          r * 0.29
        );
        glint.addColorStop(0, "#ffffffdc");
        glint.addColorStop(0.3, "#ffffff60");
        glint.addColorStop(1, "#ffffff00");
        c.fillStyle = glint;
        c.beginPath();
        c.ellipse(
          x - r * 0.31,
          y - r * 0.4,
          r * 0.29,
          r * 0.23,
          -0.5,
          0,
          Math.PI * 2
        );
        c.fill();
        c.fillStyle = "#fffffff2";
        c.beginPath();
        c.ellipse(
          x - r * 0.3,
          y - r * 0.38,
          r * 0.19,
          r * 0.085,
          -0.55,
          0,
          Math.PI * 2
        );
        c.fill();
        c.fillStyle = "#d4eaff44";
        c.beginPath();
        c.ellipse(
          x + r * 0.35,
          y + r * 0.42,
          r * 0.23,
          r * 0.075,
          -0.62,
          0,
          Math.PI * 2
        );
        c.fill();
        this.text(
          SYMBOLS[type],
          x,
          y + r * 0.34,
          Math.max(7, r * 0.51),
          "#302447a8",
          "center"
        );
      } finally {
        c.restore();
      }
    }
    shadowBall(x, y, r) {
      const c = this.ctx;
      c.fillStyle = "#63574a22";
      c.beginPath();
      c.ellipse(
        x + r * 0.22,
        y + r * 0.86,
        r * 0.88,
        r * 0.23,
        0,
        0,
        Math.PI * 2
      );
      c.fill();
      const shade = c.createRadialGradient(
        x - r * 0.35,
        y - r * 0.4,
        r * 0.06,
        x,
        y,
        r
      );
      shade.addColorStop(0, "#a7c9dd");
      shade.addColorStop(0.28, "#344d73");
      shade.addColorStop(0.72, "#192942");
      shade.addColorStop(1, "#080f23");
      c.fillStyle = shade;
      c.strokeStyle = "#789db7";
      c.lineWidth = 1.1;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
    chamberPath(x, top, y, r) {
      const c = this.ctx, neck = r * 0.86, shoulder = Math.min(20, (y - top) * 0.15);
      c.beginPath();
      c.moveTo(x - neck, top);
      c.lineTo(x + neck, top);
      c.lineTo(x + neck, top + 6);
      c.bezierCurveTo(x + neck, top + 11, x + r, top + 11, x + r, top + shoulder);
      c.lineTo(x + r, y - 7);
      c.quadraticCurveTo(x + r, y + 2, x + r * 0.72, y + 2);
      c.lineTo(x - r * 0.72, y + 2);
      c.quadraticCurveTo(x - r, y + 2, x - r, y - 7);
      c.lineTo(x - r, top + shoulder);
      c.bezierCurveTo(x - r, top + 11, x - neck, top + 11, x - neck, top + 6);
      c.lineTo(x - neck, top);
      c.closePath();
    }
    transmittedBackdrop(x, y, w, h) {
      const c = this.ctx;
      c.fillStyle = "#dbe6cf";
      c.fillRect(x, y, w, h);
      if (this.currentBackground) {
        const scale = Math.max(this.width / 600, this.height / 1040), left = (this.width - 600 * scale) / 2, top = (this.height - 1040 * scale) / 2;
        c.drawImage(
          this.currentBackground,
          (x - left) / scale,
          (y - top) / scale,
          w / scale,
          h / scale,
          x,
          y,
          w,
          h
        );
      }
    }
    drawMisclick() {
      const f = this.misclickFeedback;
      if (!f) return;
      const p = (this.game.now() - f.started) / CONFIG.misclickMs;
      if (p >= 1 || p < 0) {
        this.misclickFeedback = null;
        return;
      }
      const c = this.ctx, r = 12 + 20 * p;
      c.save();
      try {
        c.globalAlpha = Math.sin(Math.PI * p) * 0.55;
        const glow = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
        glow.addColorStop(0, "#ffffff");
        glow.addColorStop(0.22, "#b1fff0");
        glow.addColorStop(1, "#68dfdf00");
        c.fillStyle = glow;
        c.beginPath();
        c.arc(f.x, f.y, r, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = "#d7fff8";
        c.lineWidth = 1.2;
        c.beginPath();
        c.moveTo(f.x - 7, f.y);
        c.lineTo(f.x + 7, f.y);
        c.moveTo(f.x, f.y - 7);
        c.lineTo(f.x, f.y + 7);
        c.stroke();
      } finally {
        c.restore();
      }
    }
    render() {
      const c = this.ctx, g = this.game, w = this.width, h = this.height;
      if (this.misclickFeedback && (g.phase !== "active" || this.misclickFeedback.session !== g.state.session || this.misclickFeedback.view !== g.state.view))
        this.misclickFeedback = null;
      this.decorativeTray = null;
      this.renderedIds = [];
      this.ghostPositions = [];
      this.ballPositions = [];
      this.flightOrigin = null;
      this.visibleBalls = [];
      this.tubeLayout = [];
      this.silhouetteIds = [];
      this.rearOpenings = [];
      this.buttons = [];
      this.bodies = [];
      this.targets = [];
      c.clearRect(0, 0, w, h);
      const bg = c.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, "#e2ebd5");
      bg.addColorStop(1, "#a8c6a6");
      c.fillStyle = bg;
      c.fillRect(0, 0, w, h);
      if (this.currentBackground) {
        const scale = Math.max(w / 600, h / 1040);
        c.drawImage(
          this.currentBackground,
          (w - 600 * scale) / 2,
          (h - 1040 * scale) / 2,
          600 * scale,
          1040 * scale
        );
      }
      this.button(
        "sound-toggle",
        g.state.sound ? "\u58F0\u97F3\u5F00" : "\u9759\u97F3",
        w - 78,
        18,
        60,
        34,
        () => g.toggleSound()
      );
      if (g.phase === "home") {
        this.home();
        return;
      }
      this.homePanel = null;
      this.rect(16, 16, 116, 51, "#697d61", 16);
      this.rect(19, 19, 110, 45, "#fffbed", 13);
      const secs = Math.ceil(g.state.remaining / 1e3);
      this.text(
        `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`,
        74,
        51,
        29,
        g.state.remaining < 3e4 ? "#bd3b30" : "#294d3c",
        "center"
      );
      const total = g.board.tubes.reduce((n, t) => n + t.capacity, 0);
      const progress = g.board.cleared.length / total;
      this.text(`\u6E05\u7A7A ${g.board.cleared.length}/${total}`, 20, 91, 13, "#294d3c");
      this.rect(20, 101, w - 40, 9, "#a6b49a", 5);
      if (progress > 0)
        this.rect(20, 101, Math.max(9, (w - 40) * progress), 9, "#278b71", 5);
      const hidden = ["paused", "ad", "expired", "blocked", "result"].includes(
        g.phase
      );
      if (hidden) {
        this.overlay();
        return;
      }
      const trayY = h - 143, boardBottom = trayY - 30;
      this.drawBoard(147, boardBottom);
      this.drawMisclick();
      this.button(
        "pause",
        "\u6682\u505C",
        w - 146,
        18,
        60,
        34,
        () => {
          g.pause();
        },
        !["active", "resolving", "rotating"].includes(g.phase)
      );
      this.rect(14, trayY - 1, w - 28, 63, "#314c3229", 17);
      this.rect(14, trayY - 8, w - 28, 60, "#59735b", 17);
      this.rect(17, trayY - 9, w - 34, 56, "#fdfcf0", 14);
      this.rect(20, trayY - 6, w - 40, 5, "#ffffff", 3);
      const cell = (w - 44) / 7;
      for (let i = 0; i < 7; i++) {
        const x = 22 + i * cell;
        this.rect(x, trayY + 1, cell - 4, 43, "#ffffff", 13);
        const well = c.createLinearGradient(x, trayY, x + cell, trayY + 42);
        well.addColorStop(0, "#5e745e");
        well.addColorStop(0.2, "#94a68a");
        well.addColorStop(0.78, "#d4ddc1");
        well.addColorStop(1, "#e6ecd6");
        this.rect(x, trayY, cell - 4, 40, "#afbea0", 12);
        c.fillStyle = well;
        c.fill();
        const ball = g.board.tray[i];
        if (ball) this.ball(ball.type, x + (cell - 4) / 2, trayY + 21, 15);
      }
      const bw = (w - 65) / 4;
      this.button(
        "rotate-left",
        "\u2190",
        22,
        trayY + 55,
        bw,
        44,
        () => {
          g.rotate(-1);
        },
        !g.canTurn
      );
      this.button(
        "rotate-right",
        "\u2192",
        29 + bw,
        trayY + 55,
        bw,
        44,
        () => {
          g.rotate(1);
        },
        !g.canTurn
      );
      this.button(
        "undo",
        "\u64A4\u9500",
        36 + bw * 2,
        trayY + 55,
        bw,
        44,
        () => g.undo(),
        g.locked || !g.canUndo
      );
      this.button(
        "hint",
        "\u63D0\u793A",
        43 + bw * 3,
        trayY + 55,
        bw,
        44,
        () => g.hintNow(),
        g.locked
      );
      const notice = /失败|中断|预算|暂无/.test(g.message) ? g.message.includes("\u9884\u7B97") ? "\u6682\u672A\u627E\u5230\u63D0\u793A\uFF0C\u8BD5\u8BD5\u8F6C\u9762" : g.message.includes("\u6682\u65E0") ? "\u6362\u4E00\u9762\u518D\u8BD5\u8BD5" : g.message : "";
      if (notice)
        this.text(
          this.fit(notice, Math.floor((w - 40) / 11)),
          w / 2,
          h - 16,
          11,
          "#8b3e26",
          "center"
        );
      if (g.phase === "intro" || g.phase === "ready") {
        this.rect(
          18,
          Math.max(100, boardBottom - 103),
          w - 36,
          92,
          "#fffbed",
          18
        );
        this.text(
          "\u70B9\u9876\u7403 \xB7 \u4E09\u9897\u540C\u8272\u6D88\u9664",
          w / 2,
          boardBottom - 73,
          13,
          "#294d3c",
          "center"
        );
        this.button(
          "begin",
          g.phase === "intro" ? "\u8DF3\u8FC7\u5F00\u573A" : "\u5F00\u59CB \xB7 05:00",
          w / 2 - 90,
          boardBottom - 58,
          180,
          42,
          () => g.phase === "intro" ? g.skipIntro() : g.begin(),
          false,
          true
        );
      }
    }
    fit(t, n) {
      return t.length > n ? t.slice(0, n - 1) + "\u2026" : t;
    }
    drawBoard(top, bottom) {
      const c = this.ctx, g = this.game, w = this.width, n = g.board.side;
      const view = g.presentationView, face = FACES[view], turning = g.phase === "rotating", p = g.turnProgress;
      const ease = p * p * (3 - 2 * p);
      const angle = (turning ? g.turnFrom + g.turnDirection * ease : g.state.view) * Math.PI * 2 / 3;
      const layout = projection(
        n,
        w,
        top,
        bottom,
        angle,
        Math.max(...g.board.tubes.map((t) => t.capacity))
      );
      const { radius, step, ballRadius, point, axis } = layout;
      this.rotationAxis = axis;
      this.projectionScale = { x: layout.lane, z: layout.zScale };
      const visible = turning ? /* @__PURE__ */ new Set() : faceVisible(g.board, view);
      this.renderedFace = view;
      this.renderedIds = [...visible];
      for (let i = 0; i < 3; i++) {
        this.rect(
          w / 2 - 35 + i * 26,
          top - 20,
          18,
          6,
          i === view ? "#cf7835" : "#9bad90",
          3
        );
      }
      const ordered = g.board.tubes.filter((t) => t.balls.length).map((t) => ({ t, ...point(t) })).sort((a, b) => b.depth - a.depth);
      this.tubeLayout = ordered.map((t) => ({
        id: t.t.id,
        x: t.x,
        y: t.y,
        r: radius,
        depth: faceCoordinates(t.t, n, view).depth
      }));
      this.silhouetteIds = ordered.filter((p2) => !visible.has(p2.t.id)).map((p2) => p2.t.id);
      const corners = [
        { q: 0, r: 0 },
        { q: n - 1, r: 0 },
        { q: 0, r: n - 1 }
      ].map(point);
      const ratio = layout.zScale / layout.lane, padding = radius + 4;
      this.decorativeTray = {
        corners: corners.map((p2) => ({ x: p2.x, y: p2.y })),
        frontY: Math.max(...corners.map((p2) => p2.y)) + padding * ratio + 13,
        axis: { ...axis },
        thickness: 9
      };
      const dish = (offset, color, inset = 0) => {
        c.save();
        try {
          c.translate(0, axis.y + offset);
          c.scale(1, ratio);
          c.lineJoin = "round";
          c.beginPath();
          corners.forEach(
            (p2, i) => i ? c.lineTo(p2.x, (p2.y - axis.y) / ratio) : c.moveTo(p2.x, (p2.y - axis.y) / ratio)
          );
          c.closePath();
          c.fillStyle = color;
          c.strokeStyle = color;
          c.lineWidth = 2 * (padding - inset);
          c.stroke();
          c.fill();
        } finally {
          c.restore();
        }
      };
      dish(22, "#263e2933");
      dish(14, "#805737");
      dish(3, "#e0b273");
      dish(1, "#b28b59", 3.5);
      const opening = Math.min(
        9,
        Math.max(4, radius * layout.zScale / layout.lane)
      );
      c.fillStyle = "#263b3244";
      for (const item of ordered) {
        c.beginPath();
        c.ellipse(
          item.x + radius * 0.6,
          item.y + 7,
          radius * 1.3,
          opening * 0.9,
          0.18,
          0,
          Math.PI * 2
        );
        c.fill();
      }
      for (const item of ordered) {
        const { t, x, y } = item, height = t.capacity * step + 20, ty = y - height, front = visible.has(t.id);
        c.save();
        try {
          this.chamberPath(x, ty, y, radius);
          c.clip();
          this.transmittedBackdrop(x - radius, ty, radius * 2, height);
          const glass = c.createLinearGradient(x - radius, 0, x + radius, 0);
          glass.addColorStop(0, "#557a6677");
          glass.addColorStop(0.09, "#ffffeed0");
          glass.addColorStop(0.19, "#f5fff520");
          glass.addColorStop(0.65, "#ffffff08");
          glass.addColorStop(0.85, "#aacdb822");
          glass.addColorStop(1, "#54736177");
          c.fillStyle = glass;
          c.fillRect(x - radius, ty, radius * 2, height);
          c.strokeStyle = "#ffffffd9";
          c.lineWidth = 1.3;
          c.beginPath();
          c.moveTo(x - radius * 0.78, ty + 12);
          c.quadraticCurveTo(
            x - radius * 0.92,
            ty + height * 0.48,
            x - radius * 0.76,
            y - 12
          );
          c.stroke();
          c.strokeStyle = face.color + "66";
          c.lineWidth = 1;
          c.beginPath();
          c.moveTo(x + radius * 0.83, ty + 10);
          c.lineTo(x + radius * 0.83, y - 12);
          c.stroke();
        } finally {
          c.restore();
        }
        c.strokeStyle = "#698571aa";
        c.lineWidth = 1;
        this.chamberPath(x, ty, y, radius);
        c.stroke();
        const rim = c.createLinearGradient(
          x - radius,
          ty - opening,
          x + radius,
          ty + opening
        );
        rim.addColorStop(0, "#f6ffff");
        rim.addColorStop(0.22, "#e4edda");
        rim.addColorStop(0.6, "#b0c2ae");
        rim.addColorStop(1, "#6f8b76");
        c.fillStyle = rim;
        c.beginPath();
        c.ellipse(x, ty + 4, radius * 0.98, opening, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = "#c4d8b977";
        c.fillRect(x - radius * 0.86, ty + 1, radius * 1.72, 7);
        c.fillStyle = rim;
        c.beginPath();
        c.ellipse(x, ty - 1, radius * 0.98, opening, 0, 0, Math.PI * 2);
        c.fill();
        const well = c.createLinearGradient(x, ty - opening, x, ty + opening);
        well.addColorStop(0, "#4d6958");
        well.addColorStop(0.5, "#a1b59a");
        well.addColorStop(1, "#e8f5e8");
        c.fillStyle = well;
        c.beginPath();
        c.ellipse(x, ty - 1, radius * 0.8, opening * 0.57, 0, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = "#ffffffd9";
        c.lineWidth = 1.2;
        c.beginPath();
        c.ellipse(
          x - radius * 0.04,
          ty - 2,
          radius * 0.91,
          opening * 0.72,
          0,
          Math.PI,
          Math.PI * 1.9
        );
        c.stroke();
        const foot = c.createLinearGradient(x - radius, y - 7, x + radius, y + 4);
        foot.addColorStop(0, "#f7ffffc9");
        foot.addColorStop(0.35, "#c9d9ba77");
        foot.addColorStop(1, "#809b7eaa");
        c.fillStyle = foot;
        c.beginPath();
        c.ellipse(x, y - 2, radius, opening * 0.8, 0, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = "#f2ffffbb";
        c.lineWidth = 1;
        c.beginPath();
        c.ellipse(x, y - 3, radius * 0.82, opening * 0.46, 0, 0, Math.PI);
        c.stroke();
        if (!front)
          this.rearOpenings.push({
            id: t.id,
            x,
            y: ty - 1,
            rx: radius * 0.98,
            ry: opening
          });
        const previous = g.phase === "resolving" ? g.state.history.at(-1)?.tubes.find((old) => old.id === t.id) : void 0;
        const visibleCountBase = previous && previous.balls.length > t.balls.length ? previous.balls.length : t.balls.length;
        const first = Math.max(0, visibleCountBase - 3), shown = t.balls.slice(first);
        if (front)
          this.visibleBalls.push({ tube: t.id, ids: shown.map((b) => b.id) });
        for (let i = 0; i < t.balls.length; i++) {
          const by = y - ballRadius - 6 - i * step;
          const position = {
            id: t.balls[i].id,
            tube: t.id,
            slot: i,
            x,
            y: by,
            r: ballRadius
          };
          if (front && i >= first) {
            this.ballPositions.push(position);
            const drop = g.phase === "intro" ? (1 - g.introProgress) * (150 - i * 14) : 0;
            this.ball(t.balls[i].type, x, by - drop, ballRadius);
          } else {
            this.ghostPositions.push(position);
            this.shadowBall(x, by, ballRadius);
          }
        }
        c.save();
        try {
          this.chamberPath(x, ty, y, radius);
          c.clip();
          c.fillStyle = "#ffffff0b";
          c.beginPath();
          c.moveTo(x - radius, ty + height * 0.16);
          c.lineTo(x + radius, ty + height * 0.34);
          c.lineTo(x + radius, ty + height * 0.4);
          c.lineTo(x - radius, ty + height * 0.22);
          c.closePath();
          c.fill();
        } finally {
          c.restore();
        }
        c.strokeStyle = "#ffffff75";
        c.lineWidth = Math.max(1.4, radius * 0.14);
        c.beginPath();
        c.moveTo(x - radius * 0.7, ty + 16);
        c.bezierCurveTo(
          x - radius * 0.83,
          ty + height * 0.3,
          x - radius * 0.78,
          ty + height * 0.55,
          x - radius * 0.66,
          y - 12
        );
        c.stroke();
        const topY = y - ballRadius - 6 - (t.balls.length - 1) * step;
        this.bodies.push({
          id: t.id,
          x: x - radius,
          y: ty - opening,
          w: radius * 2,
          h: height + opening,
          topY
        });
        if (!front) continue;
        const hitRadius = Math.min(radius * 0.77, step * 0.48);
        if (g.hint === t.id)
          this.text(
            "\u2726",
            x + ballRadius * 0.65,
            topY - ballRadius * 0.65,
            13,
            "#3849b2",
            "center"
          );
        this.targets.push({ id: t.id, x, y: topY, r: hitRadius });
      }
      if (g.phase === "resolving") {
        const prev = g.state.history.at(-1), t = prev?.tubes.find(
          (t2) => t2.balls.length > g.board.tubes.find((n2) => n2.id === t2.id).balls.length
        );
        if (t && prev && faceVisible(prev, view).has(t.id)) {
          const from = point(t), a = g.transitionProgress, ball = t.balls.at(-1);
          const sy = from.y - ballRadius - 6 - (t.balls.length - 1) * step;
          this.flightOrigin = { id: ball.id, x: from.x, y: sy };
          this.ball(
            ball.type,
            from.x + (w / 2 - from.x) * a,
            sy + (this.height - 122 - sy) * a,
            ballRadius
          );
        }
      }
    }
    homeTitle() {
      const glyphs = [
        [
          [
            [0, 8],
            [20, 8]
          ],
          [
            [8, 0],
            [0, 23],
            [21, 23]
          ],
          [
            [0, 33],
            [23, 33]
          ],
          [
            [12, 12],
            [12, 50]
          ],
          [
            [28, 14],
            [55, 14]
          ],
          [
            [25, 25],
            [59, 25]
          ],
          [
            [44, 5],
            [37, 34],
            [55, 34],
            [41, 47]
          ],
          [
            [39, 41],
            [46, 48]
          ]
        ],
        [
          [
            [31, 0],
            [5, 26]
          ],
          [
            [31, 0],
            [57, 26]
          ],
          [
            [31, 20],
            [31, 52]
          ]
        ],
        [
          [
            [0, 8],
            [21, 8]
          ],
          [
            [0, 24],
            [21, 24]
          ],
          [
            [0, 45],
            [23, 43]
          ],
          [
            [11, 8],
            [11, 45]
          ],
          [
            [32, 13],
            [61, 13]
          ],
          [
            [46, 0],
            [46, 52],
            [41, 56]
          ],
          [
            [54, 2],
            [59, 6]
          ],
          [
            [29, 24],
            [37, 31]
          ],
          [
            [37, 35],
            [26, 43]
          ],
          [
            [61, 23],
            [54, 31]
          ],
          [
            [49, 25],
            [62, 46]
          ]
        ]
      ];
      const c = this.ctx, scale = Math.min(1.12, (this.width - 70) / 226);
      c.save();
      try {
        c.translate(this.width / 2 - 106 * scale, 88);
        c.scale(scale, scale);
        glyphs.forEach((paths, i) => {
          c.save();
          try {
            c.translate(i * 76, i === 1 ? 8 : 0);
            c.rotate(i === 0 ? -0.08 : i === 2 ? 0.08 : 0);
            c.lineCap = "round";
            c.lineJoin = "round";
            for (const [offset, width, color] of [
              [4, 16, "#47624a"],
              [0, 16, "#fff9dc"],
              [0, 9, i === 2 ? "#f48a24" : "#238a61"],
              [-1, 3, i === 2 ? "#ffd865" : "#86e9a3"]
            ]) {
              c.strokeStyle = color;
              c.lineWidth = width;
              for (const path of paths) {
                c.beginPath();
                path.forEach(
                  ([x, y], j) => j ? c.lineTo(x, y + offset) : c.moveTo(x, y + offset)
                );
                c.stroke();
              }
            }
          } finally {
            c.restore();
          }
        });
      } finally {
        c.restore();
      }
    }
    homeDialog() {
      const w = this.width, h = this.height, c = this.ctx;
      this.buttons = [];
      c.fillStyle = "#233c4288";
      c.fillRect(0, 0, w, h);
      this.rect(14, 76, w - 28, h - 128, "#fff9e8", 22);
      this.text(
        this.homePanel === "records" ? "\u672C\u673A\u6218\u7EE9" : "\u600E\u4E48\u73A9",
        w / 2,
        116,
        25,
        "#294d3c",
        "center"
      );
      if (this.homePanel === "records") {
        const records = this.game.records, pages = Math.max(1, Math.ceil(records.entries.length / 4));
        this.recordPage = Math.min(this.recordPage, pages - 1);
        this.text("\u4EC5\u672C\u673A \xB7 \u6700\u8FD130\u5C40", w / 2, 145, 12, "#617366", "center");
        if (!records.available)
          this.text("\u8BB0\u5F55\u6682\u65F6\u65E0\u6CD5\u8BFB\u53D6", w / 2, 208, 16, "#8b3e26", "center");
        else if (!records.entries.length)
          this.text(
            "\u5B8C\u6210\u7B2C\u4E00\u5C40\uFF0C\u7559\u4E0B\u6218\u7EE9\u5427",
            w / 2,
            208,
            16,
            "#617366",
            "center"
          );
        records.entries.slice(this.recordPage * 4, this.recordPage * 4 + 4).forEach((r, i) => {
          const y = 182 + i * 78, date = new Date(r.endedAt);
          this.rect(26, y, w - 52, 66, "#e6edda", 12);
          this.text(
            `${r.difficulty} \xB7 ${r.outcome === "won" ? "\u901A\u5173" : "\u672A\u901A\u5173"}`,
            38,
            y + 24,
            16,
            "#294d3c"
          );
          this.text(
            `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
            w - 38,
            y + 24,
            12,
            "#617366",
            "right"
          );
          this.text(
            `${r.score}\u5206  \xB7  ${r.cleared}/${r.total}\u9897  \xB7  ${Math.round(r.elapsedMs / 1e3)}\u79D2`,
            38,
            y + 49,
            13,
            "#617366"
          );
        });
        if (pages > 1) {
          this.button(
            "records-prev",
            "\u4E0A\u4E00\u9875",
            28,
            h - 151,
            100,
            36,
            () => this.recordPage--,
            this.recordPage === 0
          );
          this.button(
            "records-next",
            "\u4E0B\u4E00\u9875",
            w - 128,
            h - 151,
            100,
            36,
            () => this.recordPage++,
            this.recordPage === pages - 1
          );
        }
      } else {
        [
          "\u70B9\u6B63\u9762\u6700\u4E0A\u7403\uFF0C\u4E09\u4E2A\u540C\u7C7B\u6D88\u9664",
          "\u5DE6\u53F3\u8F6C\u52A8\uFF0C\u6E05\u7A7A\u5916\u5C42\u770B\u91CC\u9762",
          "\u64A4\u9500\u4E00\u6B65\uFF1B\u6BCF\u5C40\u6709\u6548\u65F6\u95F45\u5206\u949F",
          "\u7B80\u5355 105\u9897 / 5\u7C7B / 5\u5C42",
          "\u666E\u901A 126\u9897 / 6\u7C7B / 5\u20137\u5C42",
          "\u56F0\u96BE 216\u9897 / 7\u7C7B / 5\u20137\u5C42"
        ].forEach(
          (t, i) => this.text(t, w / 2, 182 + i * 40, 14, "#294d3c", "center")
        );
      }
      this.button(
        "home-dialog-close",
        "\u8FD4\u56DE",
        28,
        h - 100,
        w - 56,
        40,
        () => this.homePanel = null
      );
    }
    home() {
      const w = this.width, h = this.height;
      this.homeTitle();
      this.button("records", "\u6218\u7EE9", 18, 18, 60, 34, () => {
        this.homePanel = "records";
        this.recordPage = 0;
      });
      this.button("help", "\u73A9\u6CD5", 88, 18, 60, 34, () => {
        this.homePanel = "help";
      });
      try {
        const t = this.game.now();
        if (Number.isFinite(t)) this.mascotTime = t;
      } catch {
      }
      const c = this.ctx;
      c.save();
      try {
        c.translate(w / 2, 264);
        c.scale(1.2, 1.2);
        c.translate(-w / 2, -264);
        for (const [dy, rx, ry, color] of [
          [19, 114, 27, "#263e2933"],
          [10, 108, 31, "#805737"],
          [0, 108, 31, "#dfb879"],
          [-2, 99, 25, "#b99863"]
        ]) {
          c.beginPath();
          c.ellipse(w / 2, 333 + dy, rx, ry, 0, 0, Math.PI * 2);
          c.fillStyle = color;
          c.fill();
        }
        for (let i = 0; i < 3; i++) {
          const x = w / 2 + (i - 1) * 44, top = 204 + Math.abs(i - 1) * 10, bottom = top + 112;
          this.chamberPath(x, top, bottom, 20);
          const glass = c.createLinearGradient(x - 23, top, x + 23, bottom);
          glass.addColorStop(0, "#fffefecc");
          glass.addColorStop(0.22, "#c9f4f54d");
          glass.addColorStop(0.76, "#ffffff18");
          glass.addColorStop(1, "#9ba9c078");
          c.fillStyle = glass;
          c.fill();
          c.strokeStyle = "#a8aaaab0";
          c.lineWidth = 1;
          c.stroke();
          for (let j = 0; j < 3; j++)
            this.ball((i * 2 + j) % 7, x, top + 22 + j * 32, 16);
          c.fillStyle = "#bdcdb0";
          c.beginPath();
          c.ellipse(x, bottom, 23, 4, 0, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = "#e3ebd8";
          c.beginPath();
          c.ellipse(x, top, 22, 4, 0, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = "#95ac90";
          c.beginPath();
          c.ellipse(x, top, 18, 2.3, 0, 0, Math.PI * 2);
          c.fill();
          c.strokeStyle = "#ffffffe0";
          c.beginPath();
          c.moveTo(x - 19, top + 8);
          c.lineTo(x - 19, bottom - 8);
          c.stroke();
        }
      } finally {
        c.restore();
      }
      const mx = w / 2, my = 400 + Math.sin(this.mascotTime / 650) * 5;
      this.ball(3, mx, my, 23);
      for (const dx of [-7, 7]) {
        c.fillStyle = "#fff";
        c.beginPath();
        c.ellipse(
          mx + dx,
          my - 3,
          5,
          Math.sin(this.mascotTime / 1900) > 0.985 ? 1 : 7,
          0,
          0,
          Math.PI * 2
        );
        c.fill();
        c.fillStyle = "#25384e";
        c.beginPath();
        c.arc(mx + dx + 1, my - 2, 2.5, 0, Math.PI * 2);
        c.fill();
      }
      const y = Math.min(h - 180, 455);
      this.button(
        "start-0",
        "\u5F00\u59CB \xB7 \u7B80\u5355",
        28,
        y,
        w - 56,
        58,
        () => this.game.start(0),
        false,
        true
      );
      this.button("start-1", "\u666E\u901A", 18, 266, 58, 48, () => this.game.start(1));
      this.button(
        "start-2",
        "\u56F0\u96BE",
        w - 76,
        266,
        58,
        48,
        () => this.game.start(2)
      );
      if (this.game.resume)
        this.button(
          "resume",
          "\u7EE7\u7EED\u4E0A\u6B21",
          28,
          y + 80,
          w - 56,
          40,
          () => this.game.continueSaved()
        );
      if (this.homePanel) {
        this.homeDialog();
        return;
      }
      if (this.game.message.includes("\u5B58\u6863"))
        this.text(
          this.fit(this.game.message, 24),
          w / 2,
          h - 18,
          11,
          "#ffdc41",
          "center"
        );
    }
    overlay() {
      const g = this.game, w = this.width, h = this.height;
      const won = g.phase === "result" && g.board.status === "won";
      const y = Math.max(142, h * 0.23), cardH = g.phase === "expired" ? 366 : 340;
      this.ctx.fillStyle = "#263d3266";
      this.ctx.fillRect(0, 120, w, h - 120);
      this.rect(20, y + 8, w - 40, cardH, "#334c3540", 26);
      this.rect(18, y - 2, w - 36, cardH, "#94764d", 26);
      this.rect(22, y + 2, w - 44, cardH - 8, "#fffbed", 22);
      this.rect(w / 2 - 38, y - 30, 76, 64, won ? "#f4b443" : "#9dcc9a", 20);
      this.text(
        won ? "\u2605" : g.phase === "paused" ? "\u2161" : "!",
        w / 2,
        y + 16,
        36,
        "#294d3c",
        "center"
      );
      const title = g.phase === "result" ? won ? "\u6F02\u4EAE\uFF01\u5168\u6E05\u7A7A" : "\u4E0B\u6B21\u518D\u6311\u6218" : g.phase === "blocked" ? "\u69FD\u4F4D\u6EE1\u4E86" : g.phase === "expired" ? "\u65F6\u95F4\u5230" : g.phase === "ad" ? "\u5E7F\u544A\u52A0\u8F7D\u4E2D" : "\u4F11\u606F\u4E00\u4E0B";
      this.text(title, w / 2, y + 75, 27, "#294d3c", "center");
      if (g.phase === "result") {
        this.text(String(g.board.score), w / 2, y + 124, 36, "#be6425", "center");
        this.text(
          `\u6D88\u9664 ${g.board.cleared.length} \u9897`,
          w / 2,
          y + 149,
          13,
          "#5c7059",
          "center"
        );
      } else
        this.text(
          g.phase === "paused" ? "\u51C6\u5907\u597D\u4E86\u5C31\u7EE7\u7EED" : g.phase === "blocked" ? "\u64A4\u9500\u4E00\u6B65\uFF0C\u518D\u60F3\u60F3" : g.phase === "ad" ? "\u8BA1\u65F6\u5DF2\u6682\u505C" : "\u5DEE\u4E00\u70B9\uFF01\u518D\u8BD5\u4E00\u6B21",
          w / 2,
          y + 117,
          14,
          "#5c7059",
          "center"
        );
      if (g.phase === "ad") return;
      let by = y + 170;
      const add = (id, label, fn, disabled = false) => {
        this.button(
          id,
          label,
          40,
          by,
          w - 80,
          42,
          fn,
          disabled,
          ["continue", "again", "undo-blocked"].includes(id)
        );
        by += 55;
      };
      if (g.phase === "paused") add("continue", "\u7EE7\u7EED\u6E38\u620F", () => g.begin());
      if (g.phase === "blocked")
        add("undo-blocked", "\u64A4\u9500\u4E00\u6B65", () => g.undo(), !g.canUndo);
      if (g.phase === "expired") {
        add(
          "extend",
          g.ads.available ? "\u770B\u5E7F\u544A +30\u79D2" : "\u5E7F\u544A\u672A\u914D\u7F6E",
          () => void g.extend(),
          !g.ads.available || g.state.extensions >= CONFIG.maxExtensions
        );
        this.text(g.ads.label, w / 2, by - 2, 10, "#5c7059", "center");
        by += 8;
      }
      if (g.phase !== "result") add("end", "\u7ED3\u675F\u672C\u5C40", () => g.end());
      else
        add(
          "again",
          "\u518D\u6765\u4E00\u5C40",
          () => g.start(g.state.preset, g.state.seed + 1 >>> 0)
        );
      add("home", "\u8FD4\u56DE\u9996\u9875", () => g.home());
      if (/失败|中断|取消|未完成/.test(g.message))
        this.text(
          this.fit(g.message, Math.floor((w - 55) / 12)),
          w / 2,
          Math.min(h - 20, by + 21),
          12,
          "#8b3e26",
          "center"
        );
    }
    tap(x, y) {
      const button = [...this.buttons].reverse().find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
      if (button) {
        if (!button.disabled) button.act();
        return;
      }
      if (this.game.locked) return;
      const target = [...this.targets].reverse().find((t) => Math.hypot(x - t.x, y - t.y) <= t.r);
      if (target) {
        this.misclickFeedback = null;
        this.game.pick(target.id);
        return;
      }
      const body = [...this.bodies].reverse().find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
      if (body) {
        this.misclickFeedback = {
          x,
          y,
          started: this.game.now(),
          session: this.game.state.session,
          view: this.game.state.view
        };
        this.game.message = "\u53EA\u80FD\u53D6\u6B63\u9762\u8231\u5185\u6700\u4E0A\u65B9\u7684\u7403";
      }
    }
  };

  // src/platform/mock-ad.ts
  var MockAd = class {
    constructor() {
      __publicField(this, "available", true);
      __publicField(this, "label", "\u5F00\u53D1\u6A21\u62DF\uFF08\u65E0\u771F\u5B9E\u5E7F\u544A\uFF09");
    }
    request() {
      return Promise.resolve(
        window.confirm(
          "\u5F00\u53D1\u6A21\u62DF\u5E7F\u544A\uFF1A\u786E\u5B9A = \u6A21\u62DF\u5B8C\u6210\uFF1B\u53D6\u6D88 = \u672A\u5B8C\u6210\u3002\u4E0D\u4F1A\u5C55\u793A\u771F\u5B9E\u5E7F\u544A\u3002"
        ) ? "completed" : "cancelled"
      );
    }
  };

  // src/browser.ts
  var canvas = document.querySelector("canvas");
  var ctx = canvas.getContext("2d");
  var audio;
  var ads = new MockAd();
  var game = new Controller(
    () => performance.now(),
    {
      get: (k) => localStorage.getItem(k),
      set: (k, v) => localStorage.setItem(k, v)
    },
    {
      get available() {
        return ads.available;
      },
      get label() {
        return ads.label;
      },
      request() {
        music.suspend();
        return ads.request();
      }
    },
    () => {
      try {
        audio ?? (audio = new AudioContext());
        void audio.resume();
        const o = audio.createOscillator(), gain = audio.createGain();
        o.connect(gain);
        gain.connect(audio.destination);
        o.frequency.value = 650;
        gain.gain.setValueAtTime(0.05, audio.currentTime);
        gain.gain.exponentialRampToValueAtTime(1e-3, audio.currentTime + 0.1);
        o.start();
        o.stop(audio.currentTime + 0.1);
      } catch {
      }
    }
  );
  var music = new Music(() => {
    const player = new Audio("assets/ambience.wav");
    player.loop = true;
    player.volume = 0.22;
    return player;
  });
  var scene = new Scene(ctx, game, 390, 844);
  for (const file of ["background.png", "play-background.png"]) {
    try {
      const image = new Image();
      image.onload = () => file === "background.png" ? scene.setBackground(image) : scene.setPlayBackground(image);
      image.onerror = () => {
      };
      image.src = "assets/" + file;
    } catch {
    }
  }
  function resize() {
    const w = Math.min(innerWidth, 500), h = Math.max(innerHeight, 660), dpr = Math.min(devicePixelRatio, 2);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scene.width = w;
    scene.height = h;
  }
  resize();
  addEventListener("resize", resize);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      music.suspend();
      game.hide();
    }
  });
  addEventListener("pagehide", () => {
    music.suspend();
    game.hide();
  });
  var start = null;
  canvas.addEventListener("pointerdown", (e) => {
    start = { x: e.offsetX, y: e.offsetY };
  });
  canvas.addEventListener("pointercancel", () => start = null);
  canvas.addEventListener("pointerup", (e) => {
    if (!start) return;
    const dx = e.offsetX - start.x, dy = e.offsetY - start.y;
    start = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy))
      game.rotate(dx > 0 ? 1 : -1);
    else if (Math.hypot(dx, dy) < 15) scene.tap(e.offsetX, e.offsetY);
    music.gesture(game.state.sound, game.phase);
  });
  startFrames(
    requestAnimationFrame,
    () => {
      game.tick();
      music.update(game.state.sound, game.phase);
      scene.render();
    },
    (error) => {
      music.suspend();
      game.interrupt(error);
    }
  );
  Object.assign(window, { tri: { game, scene, createLevel } });
})();
