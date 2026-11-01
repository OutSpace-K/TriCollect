"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key2, value) => key2 in obj ? __defProp(obj, key2, { enumerable: true, configurable: true, writable: true, value }) : obj[key2] = value;
  var __publicField = (obj, key2, value) => __defNormalProp(obj, typeof key2 !== "symbol" ? key2 + "" : key2, value);

  // src/platform/clock.ts
  async function calibrateClock(raw, wall = () => Date.now(), wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))) {
    let previous;
    for (let attempt = 0; attempt < 5; attempt++) {
      const w0 = wall(), r0 = raw();
      await wait(80);
      const elapsed = wall() - w0, delta = raw() - r0;
      const ratio = delta / elapsed;
      const unit = elapsed >= 40 && elapsed < 2e3 && Number.isFinite(delta) && delta > 0 ? ratio >= 0.5 && ratio <= 2 ? 1 : ratio >= 500 && ratio <= 2e3 ? 1e3 : void 0 : void 0;
      if (unit && previous === unit) {
        const origin = raw();
        let last = 0, progressedAt = wall();
        return {
          unitsPerMs: unit,
          now: () => {
            const value = (raw() - origin) / unit;
            if (!Number.isFinite(value) || value < last)
              throw Error("Monotonic clock unavailable");
            if (value > last) progressedAt = wall();
            else if (wall() - progressedAt > 1500)
              throw Error("Monotonic clock stopped");
            last = value;
            return value;
          }
        };
      }
      previous = unit;
    }
    throw Error("Clock calibration failed; no reliable progressing clock");
  }

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
  var VERSION = "0.1.3";
  var RULE = "tricollect-2-frontfaces";
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
    searchNodes: 12e3,
    searchMs: 40
  });
  var PRESETS = [
    { id: "learn", name: "\u521D\u89C1", side: 6, height: 3, types: 5, seed: 104729 },
    { id: "normal", name: "\u63A2\u7D22", side: 7, height: 3, types: 6, seed: 130363 },
    { id: "deep", name: "\u6DF1\u5165", side: 8, height: 3, types: 7, seed: 155921 }
  ];
  var FACES = [
    { name: "\u73CA\u745A\u9762", color: "#f1a48a", shell: "#773e37" },
    { name: "\u7FE1\u7FE0\u9762", color: "#91d9bd", shell: "#285c50" },
    { name: "\u661F\u84DD\u9762", color: "#a4bdf4", shell: "#344e77" }
  ];
  var PALETTE = [
    "#fb826f",
    "#6dcbb7",
    "#f3c667",
    "#9b9ee9",
    "#72bce5",
    "#e7a2cf",
    "#b8cf78"
  ];
  var SYMBOLS = ["\u25CF", "\u25C6", "\u25B2", "\u271A", "\u25A0", "\u2605", "\u2665"];

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
  function faceVisible(b, view) {
    if (!Number.isInteger(view) || view < 0 || view > 2) return /* @__PURE__ */ new Set();
    const first = /* @__PURE__ */ new Map();
    for (const t of b.tubes) {
      if (!t.balls.length) continue;
      const { lane, depth } = faceCoordinates(t, b.side, view);
      if (!first.has(lane) || depth < first.get(lane).depth)
        first.set(lane, { id: t.id, depth });
    }
    const external = exposed(b);
    return new Set(
      [...first.values()].filter((t) => external.has(t.id)).map((t) => t.id)
    );
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
      (t) => !Number.isInteger(t.q) || !Number.isInteger(t.r) || t.q < 0 || t.r < 0 || t.q + t.r >= b.side || t.id !== key(t.q, t.r) || !Array.isArray(t.balls)
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
          balls: Array.from({ length: p.height }, (_, i) => ({
            id: `${q},${r}:${i}`,
            type: 0
          }))
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
    const types = [];
    for (let g = 0; g < order.length / 3; g += 2) {
      const window = [g % p.types, g % p.types, g % p.types];
      if ((g + 1) * 3 < order.length)
        window.push((g + 1) % p.types, (g + 1) % p.types, (g + 1) % p.types);
      for (let i = window.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [window[i], window[j]] = [window[j], window[i]];
      }
      types.push(...window);
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
    var _a;
    const p = (_a = PRESETS[index]) != null ? _a : PRESETS[0];
    try {
      return generate(p, seed != null ? seed : p.seed);
    } catch (e) {
      const level = generate(p, p.seed);
      return { ...level, fallback: true };
    }
  }

  // src/core/solver.ts
  function solve(initial, now, maxNodes = CONFIG.searchNodes, maxMs = CONFIG.searchMs, firstVisible) {
    const start = now();
    let nodes = 0, exhausted = false;
    const seen = /* @__PURE__ */ new Set();
    function dfs(b, first = false) {
      if (b.status === "won") return [];
      if (b.status === "blocked") return null;
      if (++nodes > maxNodes || now() - start >= maxMs) {
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
      if (!Number.isInteger(s.hintsUsed) || s.hintsUsed < 0 || !Number.isInteger(s.undosUsed) || s.undosUsed < 0)
        return false;
      if (!Number.isInteger(s.sequence) || s.sequence < 0 || !Number.isInteger(s.view) || s.view < 0 || s.view > 2 || typeof s.sound !== "boolean" || !["ready", "paused", "blocked", "expired", "result"].includes(s.phase))
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
        (t) => t.balls.every(
          (b2, i) => {
            var _a, _b;
            return ((_b = (_a = original.tubes.find((x) => x.id === t.id)) == null ? void 0 : _a.balls[i]) == null ? void 0 : _b.id) === b2.id;
          }
        )
      );
      return check(s.board) && Array.isArray(s.history) && s.history.length <= all.length && s.history.every(check);
    } catch (e) {
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
    } catch (e) {
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
    } catch (e) {
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
        remaining: CONFIG.baseMs,
        added: 0,
        extensions: 0,
        rewards: [],
        sequence: 0,
        view: 0,
        hintsUsed: 0,
        undosUsed: 0,
        phase: "ready",
        sound: true
      };
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
    get locked() {
      return this.phase !== "active";
    }
    start(preset = 0, seed) {
      this.state = this.fresh(preset, seed != null ? seed : PRESETS[preset].seed);
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
        } catch (e) {
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
      if (!["active", "blocked"].includes(this.phase) || !this.state.history.length)
        return;
      this.state.undosUsed++;
      this.state.board = this.state.history.pop();
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
      if (this.phase === "ad") return;
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
    toggleSound() {
      this.state.sound = !this.state.sound;
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
      } catch (e) {
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
      if (this.phase === "home") return;
      this.state.phase = this.phase === "result" || this.board.status === "won" ? "result" : this.board.status === "blocked" ? "blocked" : this.state.remaining <= 0 ? "expired" : this.phase === "ready" || this.phase === "intro" ? "ready" : "paused";
      try {
        save(this.store, this.state);
        this.lastCheckpoint = this.now();
      } catch (e) {
        this.message = "\u5B58\u6863\u5199\u5165\u5931\u8D25\uFF0C\u672C\u5C40\u53EF\u7EE7\u7EED\uFF1B\u9000\u51FA\u53EF\u80FD\u4E22\u5931\u8FDB\u5EA6";
      }
    }
  };

  // src/render/scene.ts
  var Scene = class {
    constructor(ctx2, game, width2, height2) {
      this.ctx = ctx2;
      this.game = game;
      this.width = width2;
      this.height = height2;
      __publicField(this, "buttons", []);
      __publicField(this, "renderedIds", []);
      __publicField(this, "renderedFace", 0);
      __publicField(this, "page", 0);
      __publicField(this, "drawer", false);
      __publicField(this, "targets", []);
      __publicField(this, "bodies", []);
    }
    text(t, x, y, size = 14, color = "#d9ece7", align = "left") {
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
      this.rect(
        x,
        y,
        w,
        h,
        disabled ? "#233e42" : accent ? "#d4e7b6" : "#284c50"
      );
      this.text(
        label,
        x + w / 2,
        y + h / 2 + 5,
        14,
        disabled ? "#718b8b" : accent ? "#183b37" : "#eef7ed",
        "center"
      );
      this.buttons.push({ id, x, y, w, h, act, disabled });
    }
    ball(type, x, y, r, alpha = 1) {
      const c = this.ctx;
      c.save();
      try {
        c.globalAlpha = alpha;
        const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, 1, x, y, r);
        g.addColorStop(0, "#fff6dc");
        g.addColorStop(0.35, PALETTE[type]);
        g.addColorStop(1, PALETTE[type]);
        c.fillStyle = g;
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.fill();
        this.text(
          SYMBOLS[type],
          x,
          y + 4,
          Math.max(10, r * 0.85),
          "#24414a",
          "center"
        );
      } finally {
        c.restore();
      }
    }
    render() {
      const c = this.ctx, g = this.game, w = this.width, h = this.height;
      this.renderedIds = [];
      this.buttons = [];
      this.bodies = [];
      this.targets = [];
      c.clearRect(0, 0, w, h);
      const bg = c.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, "#102e36");
      bg.addColorStop(1, "#18444a");
      c.fillStyle = bg;
      c.fillRect(0, 0, w, h);
      if (g.phase === "home") {
        this.home();
        return;
      }
      this.text("TRICOLLECT", 22, 35, 13, "#a9c6bd");
      this.text("\u4E09\u9762\u7403\u4ED3", 22, 66, 26, "#f1f1df");
      this.text(
        PRESETS[g.state.preset].name + " \xB7 " + g.state.seed,
        22,
        88,
        11,
        "#9bbab7"
      );
      this.text(
        `${Math.ceil(g.state.remaining / 1e3 / 60) - (Math.ceil(g.state.remaining / 1e3) % 60 === 0 ? 0 : 1)}:${String(Math.ceil(g.state.remaining / 1e3) % 60).padStart(2, "0")}`,
        w - 24,
        46,
        28,
        g.state.remaining < 3e4 ? "#fb826f" : "#f1f1df",
        "right"
      );
      this.text(
        `${g.board.score} \u5206  \xB7  +${g.state.added / 1e3}\u79D2`,
        w - 24,
        71,
        12,
        "#a9c6bd",
        "right"
      );
      const hidden = ["paused", "ad", "expired", "blocked", "result"].includes(
        g.phase
      );
      if (hidden) {
        this.overlay();
        return;
      }
      const trayY = h - 143, boardBottom = trayY - 30;
      this.drawBoard(147, boardBottom);
      this.button(
        "pause",
        "\u6682\u505C",
        w - 77,
        88,
        55,
        34,
        () => {
          this.drawer = false;
          g.pause();
        },
        !["active", "resolving", "rotating"].includes(g.phase)
      );
      this.button(
        "select",
        "\u9009\u7403",
        22,
        100,
        55,
        34,
        () => {
          this.drawer = !this.drawer;
        },
        g.locked
      );
      this.text(
        "\u70B9\u51FB\u4EAE\u5708\u9876\u90E8\u7403 \xB7 \u6A2A\u6ED1\u5207\u9762",
        w / 2,
        boardBottom + 10,
        12,
        "#a9c6bd",
        "center"
      );
      this.text("\u4E09\u540C\u6D88\u9664", 22, trayY - 7, 12, "#a9c6bd");
      const cell = (w - 44) / 7;
      for (let i = 0; i < 7; i++) {
        this.rect(22 + i * cell, trayY, cell - 4, 43, "#0e2d34", 9);
        const ball = g.board.tray[i];
        if (ball)
          this.ball(ball.type, 22 + i * cell + (cell - 4) / 2, trayY + 21, 15);
      }
      const bw = (w - 65) / 4;
      this.button(
        "rotate-left",
        "\u21B6",
        22,
        trayY + 55,
        bw,
        44,
        () => {
          this.drawer = false;
          g.rotate(-1);
        },
        !g.canTurn
      );
      this.button(
        "rotate-right",
        "\u21B7",
        29 + bw,
        trayY + 55,
        bw,
        44,
        () => {
          this.drawer = false;
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
        g.locked || !g.state.history.length
      );
      this.button(
        "hint",
        "\u63D0\u793A",
        43 + bw * 3,
        trayY + 55,
        bw,
        44,
        () => {
          g.hintNow();
          if (g.hint && !this.targets.some((t) => t.id === g.hint)) {
            this.drawer = true;
            this.page = Math.floor(
              g.board.tubes.findIndex((t) => t.id === g.hint) / 10
            );
          }
        },
        g.locked
      );
      this.text(
        this.fit(g.message, Math.floor((w - 40) / 11)),
        w / 2,
        h - 20,
        11,
        "#c5d5c7",
        "center"
      );
      if (this.drawer && g.phase === "active") this.drawSelector(160);
      if (g.phase === "intro" || g.phase === "ready") {
        this.rect(
          18,
          Math.max(100, boardBottom - 103),
          w - 36,
          92,
          "#173b40",
          18
        );
        this.text(
          "\u53EA\u53D6\u9876\u90E8 \xB7 \u4E09\u540C\u6D88\u9664 \xB7 \u9010\u5C42\u63ED\u5F00",
          w / 2,
          boardBottom - 73,
          13,
          "#e9edda",
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
    drawSelector(y) {
      const g = this.game, w = this.width, c = this.ctx, tiles = g.board.tubes.filter((t) => g.visible.has(t.id)), pages = Math.ceil(tiles.length / 10);
      this.page = Math.min(this.page, pages - 1);
      this.rect(14, y, w - 28, 188, "#123139", 16);
      this.text("\u5F53\u524D\u6B63\u9762 \xB7 \u9876\u90E8\u7403", 26, y + 27, 14, "#d9ece7");
      this.button("close-select", "\u6536\u8D77", w - 80, y + 10, 52, 32, () => {
        this.drawer = false;
      });
      const e = g.visible, gap = 7, tw = (w - 52 - gap * 4) / 5;
      for (let i = 0; i < 10; i++) {
        const t = tiles[this.page * 10 + i];
        if (!t) continue;
        const x = 26 + i % 5 * (tw + gap), ty = y + 54 + Math.floor(i / 5) * 48, top = t.balls[t.balls.length - 1], allowed = e.has(t.id);
        this.button(
          "tube-" + t.id,
          "",
          x,
          ty,
          tw,
          42,
          () => {
            this.drawer = false;
            g.pick(t.id);
          },
          !allowed
        );
        if (top) {
          this.ball(top.type, x + tw * 0.65, ty + 21, 11, allowed ? 1 : 0.25);
          this.text(String(g.board.tubes.indexOf(t) + 1), x + 7, ty + 25, 11);
        } else this.text("\u2713", x + tw / 2, ty + 25, 12, "#759e91", "center");
        if (g.hint === t.id) {
          c.strokeStyle = "#f4d27e";
          c.strokeRect(x - 1, ty - 1, tw + 2, 44);
        }
      }
      this.button(
        "page",
        `\u6362\u9875 ${this.page + 1}/${pages}`,
        w / 2 - 55,
        y + 151,
        110,
        28,
        () => {
          this.page = (this.page + 1) % pages;
        },
        pages === 1
      );
    }
    fit(t, n) {
      return t.length > n ? t.slice(0, n - 1) + "\u2026" : t;
    }
    drawBoard(top, bottom) {
      const c = this.ctx, g = this.game, w = this.width, n = g.board.side;
      const view = g.presentationView, face = FACES[view];
      const visible = faceVisible(g.board, view);
      this.renderedFace = view;
      this.renderedIds = [...visible];
      const lane = (w - 32) / n, radius = Math.min(22, lane * 0.38);
      const height2 = Math.min(208, bottom - top - 65), by = top + (bottom - top + height2) / 2;
      const step = Math.min(49, (height2 - 35) / 3);
      const turning = g.phase === "rotating", progress = g.turnProgress;
      const squeeze = turning ? Math.max(0.035, Math.abs(Math.cos(Math.PI * progress))) : 1;
      this.text(
        `\u7B2C ${view + 1} \u9762 / 3 \xB7 ${face.name}`,
        w / 2,
        top + 13,
        15,
        face.color,
        "center"
      );
      this.text(
        `${g.board.tubes.filter((t) => t.balls.length).length} \u7BA1\u5F85\u6E05\u7A7A \xB7 \u524D\u7BA1\u6E05\u7A7A\u540E\u9732\u51FA\u540E\u7BA1`,
        w / 2,
        top + 34,
        11,
        "#a9c6bd",
        "center"
      );
      c.save();
      try {
        c.translate(
          w / 2 + (turning ? Math.sin(Math.PI * progress) * w * 0.1 * g.turnDirection * (progress < 0.5 ? -1 : 1) : 0),
          0
        );
        c.scale(squeeze, 1);
        c.translate(-w / 2, 0);
        this.rect(12, by + 9, w - 24, 18, face.shell, 8);
        for (const t of g.board.tubes.filter((t2) => visible.has(t2.id))) {
          const { lane: column, depth } = faceCoordinates(t, g.board.side, view);
          const x = 16 + lane * (column + 0.5), y = by - Math.min(depth, 5) * 4, ty = y - height2;
          this.rect(x - radius, ty, radius * 2, height2, face.shell, 12);
          this.rect(
            x - radius + 5,
            ty + 18,
            radius * 2 - 10,
            height2 - 29,
            "#112e35",
            7
          );
          c.strokeStyle = face.color;
          c.lineWidth = 1.2;
          c.beginPath();
          c.ellipse(x, ty + 5, radius, 5, 0, 0, Math.PI * 2);
          c.stroke();
          for (let j = 0; j < 4; j++) {
            c.beginPath();
            c.moveTo(x - radius + 1, ty + 26 + j * 36);
            c.lineTo(x - radius + 4, ty + 31 + j * 36);
            c.stroke();
            c.beginPath();
            c.moveTo(x + radius - 4, ty + 31 + j * 36);
            c.lineTo(x + radius - 1, ty + 26 + j * 36);
            c.stroke();
          }
          for (let i = 0; i < t.balls.length; i++) {
            const drop = g.phase === "intro" ? (1 - g.introProgress) * (145 - i * 30) : 0;
            this.ball(
              t.balls[i].type,
              x,
              y - 20 - i * step - drop,
              radius * 0.72
            );
          }
          const topY = y - 20 - (t.balls.length - 1) * step;
          c.strokeStyle = g.hint === t.id ? "#ffdc7f" : face.color;
          c.lineWidth = 2;
          c.beginPath();
          c.arc(x, topY, radius * 0.84, 0, Math.PI * 2);
          c.stroke();
          this.text(
            String(g.board.tubes.indexOf(t) + 1),
            x,
            ty - 8,
            11,
            face.color,
            "center"
          );
          if (!turning) {
            this.bodies.push({
              id: t.id,
              x: x - lane * 0.46,
              y: ty - 5,
              w: lane * 0.92,
              h: height2 + 8,
              topY
            });
            this.targets.push({ id: t.id, x, y: topY, r: radius * 0.84 });
          }
        }
        if (g.phase === "resolving") {
          const prev = g.state.history.at(-1);
          const t = prev == null ? void 0 : prev.tubes.find(
            (t2) => t2.balls.length > g.board.tubes.find((n2) => n2.id === t2.id).balls.length
          );
          if (t && prev && faceVisible(prev, view).has(t.id)) {
            const x = 16 + lane * (faceCoordinates(t, g.board.side, view).lane + 0.5), a = g.transitionProgress;
            this.ball(
              t.balls.at(-1).type,
              x + (w / 2 - x) * a,
              by - height2 / 2 + (this.height - 122 - by + height2 / 2) * a,
              radius * 0.72
            );
          }
        }
      } finally {
        c.restore();
      }
    }
    home() {
      const w = this.width, h = this.height;
      this.text("T R I C O L L E C T", w / 2, 76, 13, "#b1cbc0", "center");
      this.text("\u4E09\u9762\u7403\u4ED3", w / 2, 122, 38, "#f2f0db", "center");
      this.text("\u8F6C\u4E00\u4E2A\u89D2\u5EA6\uFF0C\u53D1\u73B0\u4E0B\u4E00\u7EC4\u3002", w / 2, 155, 14, "#adc8bd", "center");
      for (let i = 0; i < 5; i++) {
        const x = w / 2 + (i - 2) * 43, y2 = 230 + Math.abs(i - 2) * 14;
        this.rect(x - 17, y2 - 28, 34, 80, "#8ad1c31a");
        this.ball(i, x, y2, 14);
        this.ball((i + 2) % 5, x, y2 + 32, 14);
      }
      this.text(
        "\u53D6\u9876\u90E8\u7403\u653E\u5165\u4E03\u683C\u69FD\uFF0C\u51D1\u9F50\u4E09\u9897\u540C\u7C7B\u3002",
        w / 2,
        343,
        13,
        "#e2e8d6",
        "center"
      );
      this.text(
        "\u5916\u5C42\u6E05\u7A7A\u540E\uFF0C\u65B0\u7684\u7403\u4ED3\u9010\u6E10\u663E\u9732\u3002",
        w / 2,
        367,
        13,
        "#adc8bd",
        "center"
      );
      const y = Math.min(h - 260, 405);
      PRESETS.forEach(
        (p, i) => this.button(
          "start-" + i,
          `${p.name}  \xB7  ${p.side * (p.side + 1) / 2 * p.height} \u9897  \xB7  5 \u5206\u949F`,
          28,
          y + i * 53,
          w - 56,
          44,
          () => {
            this.page = 0;
            this.game.start(i);
          },
          false,
          i === 0
        )
      );
      if (this.game.resume)
        this.button(
          "resume",
          "\u7EE7\u7EED\u4E0A\u6B21\u7403\u4ED3",
          28,
          y + 166,
          w - 56,
          42,
          () => this.game.continueSaved()
        );
      if (this.game.message.includes("\u5B58\u6863"))
        this.text(
          this.fit(this.game.message, 26),
          w / 2,
          391,
          11,
          "#f3c667",
          "center"
        );
      this.text(
        "\u65E0\u5E7F\u544A\u53EF\u901A\u5173 \xB7 \u514D\u8D39\u64A4\u9500\u4E0E\u63D0\u793A",
        w / 2,
        h - 55,
        12,
        "#b7cdbb",
        "center"
      );
      this.text(
        `\u539F\u578B v${VERSION} \xB7 \u96BE\u5EA6\u4E0E\u65F6\u957F\u5F85\u8BD5\u73A9\u6821\u51C6`,
        w / 2,
        h - 32,
        11,
        "#739e98",
        "center"
      );
    }
    overlay() {
      const g = this.game, w = this.width, h = this.height, y = Math.max(138, h * 0.25);
      const title = g.phase === "result" ? g.board.status === "won" ? "\u7403\u4ED3\u6E05\u7A7A" : "\u672C\u5C40\u7ED3\u675F" : g.phase === "blocked" ? "\u6682\u5B58\u69FD\u5DF2\u6EE1" : g.phase === "expired" ? "\u65F6\u95F4\u7528\u5C3D" : g.phase === "ad" ? "\u6B63\u5728\u8BF7\u6C42\u5E7F\u544A" : "\u5DF2\u6682\u505C";
      this.rect(20, y - 30, w - 40, Math.min(460, h - y - 30), "#123139", 22);
      this.text(title, w / 2, y + 20, 30, "#f2f0db", "center");
      this.text(
        `${g.board.score} \u5206 \xB7 \u5DF2\u6D88\u9664 ${g.board.cleared.length} \u9897`,
        w / 2,
        y + 55,
        15,
        "#bdd3bf",
        "center"
      );
      this.text(
        `\u6709\u6548\u7528\u65F6 ${Math.ceil((CONFIG.baseMs + g.state.added - g.state.remaining) / 1e3)} \u79D2`,
        w / 2,
        y + 80,
        13,
        "#9dbab3",
        "center"
      );
      if (g.phase === "ad") {
        this.text(
          "\u8BA1\u65F6\u5DF2\u6682\u505C\uFF0C\u7B49\u5F85\u5E7F\u544A\u7ED3\u679C",
          w / 2,
          y + 145,
          14,
          "#d4e7b6",
          "center"
        );
        return;
      }
      this.text(
        `\u63D0\u793A ${g.state.hintsUsed} \xB7 \u64A4\u9500 ${g.state.undosUsed} \xB7 \u7EED\u65F6 ${g.state.extensions}`,
        w / 2,
        y + 102,
        11,
        "#9dbab3",
        "center"
      );
      let by = y + 125;
      const add = (id, label, fn, disabled = false) => {
        this.button(
          id,
          label,
          40,
          by,
          w - 80,
          44,
          fn,
          disabled,
          id === "continue"
        );
        by += 56;
      };
      if (g.phase === "paused") add("continue", "\u7EE7\u7EED\u6E38\u620F", () => g.begin());
      if (g.phase === "blocked")
        add(
          "undo-blocked",
          "\u514D\u8D39\u64A4\u9500\u4E00\u6B65",
          () => g.undo(),
          !g.state.history.length
        );
      if (g.phase === "expired") {
        add(
          "extend",
          g.ads.available ? `\u81EA\u613F\u770B\u5E7F\u544A +30\u79D2 (${g.state.extensions}/${CONFIG.maxExtensions})` : "\u5E7F\u544A\u672A\u914D\u7F6E \xB7 \u53EF\u76F4\u63A5\u7ED3\u675F",
          () => void g.extend(),
          !g.ads.available || g.state.extensions >= CONFIG.maxExtensions
        );
        this.text(g.ads.label, w / 2, by - 2, 11, "#94b2ac", "center");
        by += 8;
      }
      if (g.phase !== "result") add("end", "\u7ED3\u675F\u5E76\u4FDD\u7559\u672C\u5C40\u6210\u7EE9", () => g.end());
      else
        add(
          "again",
          "\u518D\u6765\u4E00\u5C40",
          () => g.start(g.state.preset, g.state.seed + 1 >>> 0)
        );
      add("home", "\u8FD4\u56DE\u9996\u9875", () => g.home());
      if (g.phase === "paused")
        add(
          "sound",
          g.state.sound ? "\u97F3\u6548\uFF1A\u5F00" : "\u97F3\u6548\uFF1A\u5173",
          () => g.toggleSound()
        );
      this.text(
        this.fit(g.message, Math.floor((w - 55) / 12)),
        w / 2,
        Math.min(h - 25, by + 15),
        12,
        "#bdd3bf",
        "center"
      );
    }
    tap(x, y) {
      const button = [...this.buttons].reverse().find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
      if (button) {
        if (!button.disabled) button.act();
        return;
      }
      if (this.game.locked || this.drawer) return;
      const body = [...this.bodies].reverse().find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
      if (body) {
        if (Math.abs(y - body.topY) <= body.w * 0.45) this.game.pick(body.id);
        else this.game.message = "\u53EA\u80FD\u53D6\u4EAE\u5708\u9876\u90E8\u7403\uFF1B\u906E\u6321\u65F6\u53EF\u70B9\u5DE6\u4E0A\u9009\u7403";
      }
    }
  };

  // src/platform/ads.ts
  var UnavailableAd = class {
    constructor() {
      __publicField(this, "available", false);
      __publicField(this, "label", "\u5E7F\u544A\u672A\u914D\u7F6E");
    }
    request() {
      return Promise.resolve("failed");
    }
  };

  // src/wechat.ts
  var canvas = wx.createCanvas();
  var info = wx.getWindowInfo();
  var width = info.windowWidth;
  var height = info.windowHeight;
  var dpr = Math.min(info.pixelRatio, 2);
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  var ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  var perf = wx.getPerformance();
  var audio = wx.createInnerAudioContext();
  audio.src = "assets/tap.wav";
  var ads = "" ? new WeChatAd(
    wx.createRewardedVideoAd({ adUnitId: "" })
  ) : new UnavailableAd();
  async function boot() {
    var _a, _b, _c, _d;
    ctx.fillStyle = "#102e36";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#e9edda";
    ctx.font = "16px sans-serif";
    ctx.fillText("\u6B63\u5728\u51C6\u5907\u7403\u4ED3\u2026", 24, 80);
    const clock = await calibrateClock(() => perf.now());
    console.info("TriCollect clock units/ms", clock.unitsPerMs);
    const game = new Controller(
      clock.now,
      {
        get: (k) => {
          const value = wx.getStorageSync(k);
          return typeof value === "string" ? value : null;
        },
        set: (k, v) => wx.setStorageSync(k, v)
      },
      ads,
      () => {
        audio.stop();
        audio.play();
      }
    );
    const top = Math.max((_b = (_a = info.safeArea) == null ? void 0 : _a.top) != null ? _b : 0, 24), bottom = Math.max(0, height - ((_d = (_c = info.safeArea) == null ? void 0 : _c.bottom) != null ? _d : height));
    const logicalHeight = Math.max(height - top - bottom, 660), factor = Math.min(1, (height - top - bottom) / logicalHeight);
    const scene = new Scene(ctx, game, width / factor, logicalHeight);
    let pointer = null;
    wx.onTouchStart((e) => {
      const t = e.touches[0];
      if (t) pointer = { x: t.clientX / factor, y: (t.clientY - top) / factor };
    });
    wx.onTouchCancel(() => pointer = null);
    wx.onTouchEnd((e) => {
      const t = e.changedTouches[0];
      if (!pointer || !t) return;
      const x = t.clientX / factor, y = (t.clientY - top) / factor, dx = x - pointer.x, dy = y - pointer.y;
      pointer = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy))
        game.rotate(dx > 0 ? 1 : -1);
      else if (Math.hypot(dx, dy) < 15) scene.tap(x, y);
    });
    wx.onHide(() => {
      pointer = null;
      game.hide();
      audio.stop();
    });
    wx.onShow(() => {
      pointer = null;
    });
    audio.onError(() => {
    });
    startFrames(
      requestAnimationFrame,
      () => {
        game.tick();
        ctx.save();
        try {
          ctx.translate(0, top);
          ctx.scale(factor, factor);
          scene.render();
        } finally {
          ctx.restore();
        }
      },
      (error) => game.interrupt(error)
    );
  }
  void boot().catch((error) => {
    console.error("TriCollect startup failed", error);
    ctx.fillStyle = "#102e36";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#e9edda";
    ctx.font = "16px sans-serif";
    ctx.fillText("\u65F6\u949F\u65E0\u6CD5\u6B63\u5E38\u8FD0\u884C\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u6E38\u620F", 20, 100);
  });
})();
