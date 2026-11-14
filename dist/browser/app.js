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
      __publicField(this, "foreground", true);
      __publicField(this, "interrupted", false);
      __publicField(this, "wanted", false);
      __publicField(this, "playing", false);
      __publicField(this, "pending", false);
      __publicField(this, "failed", false);
      __publicField(this, "attempt", 0);
    }
    gesture(enabled, phase) {
      if (this.pending) this.suspend();
      this.failed = false;
      this.update(enabled, phase);
    }
    update(enabled, phase) {
      this.wanted = enabled && this.foreground && !this.interrupted && ["home", "intro", "ready", "active", "resolving", "rotating"].includes(
        phase
      );
      if (!this.wanted || this.failed) {
        this.suspend();
        return;
      }
      if (this.playing || this.pending) return;
      try {
        if (!this.player) {
          this.player = this.create();
          this.player.onError?.(() => this.fail());
          this.player.onPlay?.(() => {
            if (!this.wanted || this.failed || !this.pending && !this.playing) {
              this.pausePlayer();
              return;
            }
            this.pending = false;
            this.playing = true;
          });
          const stopped = () => {
            if (!this.playing || this.player?.paused === false) return;
            this.playing = false;
            this.failed = true;
          };
          this.player.onPause?.(stopped);
          this.player.onStop?.(stopped);
        }
        if (this.failed) return;
        this.pending = true;
        const attempt = ++this.attempt;
        const result = this.player.play();
        if (result && typeof result.then === "function") {
          void result.then(
            () => {
              if (attempt !== this.attempt) return;
              this.pending = false;
              this.playing = true;
            },
            () => {
              if (attempt === this.attempt) this.fail();
            }
          );
        } else if (!this.player.onPlay) {
          this.pending = false;
          this.playing = true;
        }
      } catch {
        this.fail();
      }
    }
    setForeground(value) {
      this.foreground = value;
      if (!value) this.suspend();
    }
    setInterrupted(value) {
      this.interrupted = value;
      if (value) this.suspend();
      else this.failed = false;
    }
    suspend() {
      this.wanted = false;
      if (!this.playing && !this.pending) return;
      this.playing = false;
      this.pending = false;
      this.attempt++;
      this.pausePlayer();
    }
    pausePlayer() {
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

  // src/platform/gesture.ts
  function gesture(dx, dy) {
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy))
      return dx > 0 ? "right" : "left";
    return Math.hypot(dx, dy) <= 18 ? "tap" : null;
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

  // src/platform/mural.ts
  var MURAL_VARIANTS = 8192;
  var MURAL_RECENT_LIMIT = 64;
  var MURAL_RECENT_KEY = "tricollect.mural.recent.v1";
  function isMuralVariant(value) {
    return Number.isInteger(value) && value >= 0 && value < MURAL_VARIANTS;
  }
  function muralVariantFor(state) {
    if (state.muralVariant !== void 0) return state.muralVariant;
    let hash2 = 2166136261;
    for (const ch of `${state.session}:${state.seed}:${state.preset}`)
      hash2 = Math.imul(hash2 ^ ch.charCodeAt(0), 16777619);
    return (hash2 >>> 0) % MURAL_VARIANTS;
  }
  function readMuralRecent(store) {
    try {
      const parsed = JSON.parse(store.get(MURAL_RECENT_KEY) ?? "[]");
      if (!Array.isArray(parsed) || parsed.length > MURAL_RECENT_LIMIT || !parsed.every(isMuralVariant) || new Set(parsed).size !== parsed.length)
        return [];
      return parsed;
    } catch {
      return [];
    }
  }
  function chooseMuralVariant(excluded, entropy = Math.random, previousVariant) {
    const allowed = (candidate2) => !excluded.has(candidate2) && (previousVariant === void 0 || candidate2 % 4 !== previousVariant % 4);
    let candidate = (Date.now() >>> 0) % MURAL_VARIANTS;
    for (let attempt = 0; attempt < 16; attempt++) {
      let sample = NaN;
      try {
        sample = entropy();
      } catch {
      }
      if (!Number.isFinite(sample) || sample < 0 || sample >= 1) break;
      candidate = Math.floor(sample * MURAL_VARIANTS);
      if (allowed(candidate)) return candidate;
    }
    for (let i = 0; i < MURAL_VARIANTS; i++) {
      if (allowed(candidate)) return candidate;
      candidate = (candidate + 4051) % MURAL_VARIANTS;
    }
    throw Error("No available mural composition");
  }
  function rememberMuralVariant(store, recent, variant) {
    const next = [...recent.filter((v) => v !== variant), variant].slice(
      -MURAL_RECENT_LIMIT
    );
    try {
      store.set(MURAL_RECENT_KEY, JSON.stringify(next));
    } catch {
    }
    return next;
  }

  // src/config.ts
  var RULE = "tricollect-5-variable-height";
  var CONFIG = Object.freeze({
    // Legacy save duration; new rounds use roundBaseMs(preset).
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
  function roundBaseMs(preset) {
    return [12e4, 18e4, 24e4][preset] ?? 12e4;
  }
  var PRESETS = [
    {
      id: "learn",
      name: "\u7B80\u5355",
      side: 6,
      height: 5,
      heights: [5],
      groups: 1,
      challengeGroups: 1,
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
      challengeGroups: 3,
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
      challengeGroups: 4,
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
    "#ff3b3b",
    "#ff990c",
    "#ffbf26",
    "#7d60f0",
    "#16a9ef",
    "#e64fc2",
    "#8bc72d"
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
    if (n.tubes.every((t2) => !t2.balls.length) && !n.tray.length && !n.pocket?.length) {
      n.status = "won";
      n.score += CONFIG.winScore;
    } else if (n.tray.length >= CONFIG.capacity) n.status = "blocked";
    n.applied.push(actionId);
    return n;
  }
  function lift(b, actionId) {
    if (b.status === "won" || !b.tray.length || b.pocket?.length || b.applied.includes(actionId))
      return b;
    const n = clone(b);
    n.pocket = [n.tray.pop()];
    n.status = "playing";
    n.applied.push(actionId);
    return n;
  }
  var RETURN_POCKET = "@return-pocket";
  function returnPocket(b, actionId) {
    if (b.status !== "playing" || !b.pocket?.length || b.applied.includes(actionId))
      return b;
    const n = clone(b), ball = n.pocket.pop();
    n.tray.push(ball);
    const group = n.tray.filter((x) => x.type === ball.type);
    if (group.length === CONFIG.match) {
      n.cleared.push(...group);
      n.tray = n.tray.filter((x) => x.type !== ball.type);
      n.score += CONFIG.matchScore;
    }
    if (n.tubes.every((t) => !t.balls.length) && !n.tray.length) {
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
    const all = [
      ...b.tubes.flatMap((t) => t.balls),
      ...b.tray,
      ...b.cleared,
      ...b.pocket ?? []
    ];
    if (all.length !== expected || new Set(all.map((x) => x.id)).size !== all.length || all.some(
      (x) => typeof x.id !== "string" || !Number.isInteger(x.type) || x.type < 0 || x.type > 6
    ))
      return false;
    if (b.pocket !== void 0 && (!Array.isArray(b.pocket) || b.pocket.length > 1) || b.tray.length > CONFIG.capacity || new Set(b.applied).size !== b.applied.length || b.applied.some((x) => typeof x !== "string"))
      return false;
    for (let type = 0; type < 7; type++)
      if (b.tray.filter((x) => x.type === type).length >= 3 || b.cleared.filter((x) => x.type === type).length % 3 !== 0)
        return false;
    const won = b.tubes.every((t) => !t.balls.length) && !b.tray.length && !b.pocket?.length;
    const expectedStatus = won ? "won" : b.tray.length === CONFIG.capacity ? "blocked" : "playing";
    return b.status === expectedStatus && b.score === b.cleared.length / 3 * CONFIG.matchScore + b.tubes.filter((t) => !t.balls.length).length * CONFIG.tubeScore + (won ? CONFIG.winScore : 0);
  }
  function replay(initial, path) {
    let b = clone(initial);
    for (let i = 0; i < path.length; i++) {
      let id = `replay-${i}`;
      while (b.applied.includes(id)) id += "-";
      const n = path[i] === RETURN_POCKET ? returnPocket(b, id) : take(b, path[i], id);
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
  function generate(p, seed, revision = 2) {
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
    const groups = (revision === 2 ? p.challengeGroups : p.groups) ?? p.groups ?? 2;
    for (let g = 0; g < order.length / 3; g += groups) {
      const window2 = [];
      for (let k = 0; k < groups && g + k < order.length / 3; k++)
        window2.push(...Array(3).fill((g + k) % p.types));
      for (let i = window2.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [window2[i], window2[j]] = [window2[j], window2[i]];
      }
      if (groups <= 3) types.push(...window2);
      else {
        const waiting = /* @__PURE__ */ new Map();
        const emit = (type) => {
          window2.splice(window2.indexOf(type), 1);
          waiting.set(type, ((waiting.get(type) ?? 0) + 1) % 3);
          types.push(type);
        };
        for (const type of new Set(window2)) emit(type);
        while (window2.length) {
          const size = [...waiting.values()].reduce((a, b2) => a + b2, 0);
          const choices = [...new Set(window2)].filter(
            (type) => size < 6 || waiting.get(type) === 2
          );
          if (!choices.length) throw Error("No safe assignment");
          emit(choices[Math.floor(rnd() * choices.length)]);
        }
      }
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
  function createLevel(index, seed, revision = 2) {
    const p = PRESETS[index] ?? PRESETS[0];
    try {
      return generate(p, seed ?? p.seed, revision);
    } catch {
      const level = generate(p, p.seed, revision);
      return { ...level, fallback: true };
    }
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
  function originalFor(preset, seed, generation) {
    const key2 = `${generation}:${preset}:${seed}`;
    if (!originals.has(key2)) {
      if (originals.size >= 32) originals.delete(originals.keys().next().value);
      originals.set(key2, createLevel(preset, seed, generation).board);
    }
    return originals.get(key2);
  }
  var lastStored = /* @__PURE__ */ new WeakMap();
  function valid(s) {
    try {
      if (s.schema !== 1 || s.generation !== void 0 && s.generation !== 1 && s.generation !== 2 || s.rule !== RULE || typeof s.session !== "string" || !Number.isInteger(s.seed) || s.muralVariant !== void 0 && !isMuralVariant(s.muralVariant) || !Number.isInteger(s.preset) || !PRESETS[s.preset])
        return false;
      if (s.baseMs !== void 0 && s.baseMs !== roundBaseMs(s.preset) && s.baseMs !== CONFIG.baseMs || !Number.isFinite(s.remaining) || s.remaining < 0 || s.remaining > (s.baseMs ?? CONFIG.baseMs) + s.added || !Number.isInteger(s.extensions) || s.extensions < 0 || s.extensions > CONFIG.maxExtensions || s.added !== s.extensions * CONFIG.extraMs)
        return false;
      if (!Number.isInteger(s.hintsUsed) || s.hintsUsed < 0 || s.undoAvailable !== void 0 && typeof s.undoAvailable !== "boolean" || !Number.isInteger(s.undosUsed) || s.undosUsed < 0)
        return false;
      if (!Number.isInteger(s.sequence) || s.sequence < 0 || !Number.isInteger(s.view) || s.view < 0 || s.view > 2 || typeof s.sound !== "boolean" || s.started !== void 0 && typeof s.started !== "boolean" || s.finishedAt !== void 0 && (!Number.isFinite(s.finishedAt) || s.finishedAt < 0) || !["ready", "paused", "blocked", "expired", "result"].includes(s.phase))
        return false;
      if (!Array.isArray(s.rewards) || new Set(s.rewards.map((r) => r.id)).size !== s.rewards.length || s.rewards.some(
        (r) => r.kind !== void 0 && !["extend", "lift"].includes(r.kind) || r.session !== s.session || typeof r.id !== "string" || !["requested", "completed", "cancelled", "failed"].includes(
          r.state
        ) || typeof r.redeemed !== "boolean" || r.redeemed !== (r.state === "completed")
      ))
        return false;
      if (s.rewards.filter((r) => r.redeemed && r.kind !== "lift").length !== s.extensions || s.rewards.filter((r) => r.redeemed && r.kind === "lift").length > 1)
        return false;
      const original = originalFor(s.preset, s.seed, s.generation ?? 1), all = original.tubes.flatMap((t) => t.balls), identities = new Map(all.map((b) => [b.id, b.type]));
      const check = (b) => invariant(b, all.length) && (!b.pocket?.length || s.rewards.some((r) => r.kind === "lift" && r.redeemed)) && b.side === original.side && [
        ...b.tubes.flatMap((t) => t.balls),
        ...b.tray,
        ...b.cleared,
        ...b.pocket ?? []
      ].every((b2) => identities.get(b2.id) === b2.type) && b.tubes.every(
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
    if (!valid(s)) throw Error("Refusing invalid save");
    const encoded = encode({
      ...s,
      history: s.phase === "result" ? [] : s.history.slice(-1)
    });
    store.set(SAVE_KEY + ".tmp", encoded);
    if (store.get(SAVE_KEY + ".tmp") !== encoded)
      throw Error("Storage readback failed");
    const previous = store.get(SAVE_KEY);
    if (previous && (previous === lastStored.get(store) || decode(previous)))
      store.set(SAVE_KEY + ".backup", previous);
    store.set(SAVE_KEY, encoded);
    if (store.get(SAVE_KEY) !== encoded)
      throw Error("Main storage readback failed");
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
        ) || r.generation !== void 0 && r.generation !== 1 && r.generation !== 2 || [r.hintsUsed, r.undosUsed, r.rewardedAds].some(
          (n) => n !== void 0 && (!Number.isInteger(n) || n < 0)
        ) || r.total < 1 || r.cleared > r.total || r.baseMs !== void 0 && r.baseMs !== roundBaseMs(r.preset) && r.baseMs !== CONFIG.baseMs || r.elapsedMs > (r.baseMs === void 0 ? CONFIG.baseMs + CONFIG.extraMs * CONFIG.maxExtensions : r.baseMs + r.addedMs)
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
  function appendResult(store, s, correctVictory = false) {
    if (!s.started || s.phase !== "result" || s.finishedAt === void 0)
      return true;
    const loaded = readRecords(store);
    if (!loaded.available) return false;
    const existing = loaded.entries.find((r) => r.session === s.session);
    if (existing && !(correctVictory && existing.outcome === "lost" && s.board.status === "won"))
      return true;
    const entry = {
      session: s.session,
      endedAt: s.finishedAt,
      preset: s.preset,
      difficulty: PRESETS[s.preset].name,
      outcome: s.board.status === "won" ? "won" : "lost",
      score: s.board.score,
      cleared: s.board.cleared.length,
      total: s.board.tubes.reduce((n, t) => n + t.capacity, 0),
      baseMs: s.baseMs ?? CONFIG.baseMs,
      elapsedMs: Math.max(0, (s.baseMs ?? CONFIG.baseMs) + s.added - s.remaining),
      addedMs: s.added,
      generation: s.generation ?? 1,
      hintsUsed: s.hintsUsed,
      undosUsed: s.undosUsed,
      rewardedAds: s.rewards.filter((r) => r.redeemed).length
    };
    const payload = JSON.stringify({
      schema: 1,
      entries: existing ? loaded.entries.map((r) => r.session === s.session ? entry : r) : [entry, ...loaded.entries].slice(0, RECORD_LIMIT)
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

  // src/platform/terminal.ts
  var TERMINAL_KEY = "tricollect.terminal.v1";
  function pendingTerminal(store) {
    const raw = store.get(TERMINAL_KEY);
    if (!raw) return null;
    const s = decode(raw);
    if (!s || s.phase !== "result" || !s.started || s.finishedAt === void 0)
      throw Error("Unreadable terminal journal");
    return s;
  }
  function commitTerminal(store, s) {
    if (!valid(s) || s.phase !== "result" || !s.started || s.finishedAt === void 0)
      return { durable: false, complete: false };
    try {
      const pending = pendingTerminal(store);
      if (pending && pending.session !== s.session)
        return { durable: false, complete: false };
    } catch {
      return { durable: false, complete: false };
    }
    s = { ...s, history: [], undoAvailable: false };
    let durable = false, journal = false, main = false;
    try {
      const encoded = encode(s);
      store.set(TERMINAL_KEY, encoded);
      journal = store.get(TERMINAL_KEY) === encoded;
      durable = journal;
    } catch {
    }
    try {
      save(store, s);
      main = true;
      durable = true;
    } catch {
    }
    const recorded = durable && appendResult(store, s, true);
    let complete = main && recorded;
    if (complete) {
      try {
        store.set(TERMINAL_KEY, "");
        complete = !store.get(TERMINAL_KEY);
      } catch {
        complete = false;
      }
    }
    return { durable, complete };
  }
  function drainTerminal(store) {
    try {
      const s = pendingTerminal(store);
      return !s || commitTerminal(store, s).complete;
    } catch {
      return false;
    }
  }

  // src/core/seed.ts
  function nextSeed(excluded, entropy = Math.random) {
    let value = NaN;
    try {
      value = entropy();
    } catch {
    }
    let seed = Number.isFinite(value) && value >= 0 && value < 1 ? Math.floor(value * 4294967296) >>> 0 : Date.now() >>> 0;
    while (excluded.has(seed)) seed = seed + 1 >>> 0;
    return seed;
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
      const k = b.tubes.map((t) => t.balls.length).join(",") + "|" + [...b.tray, ...(b.pocket ?? []).map((x) => ({ ...x, type: x.type + 10 }))].map((x) => x.type).sort().join(",");
      if (seen.has(k)) return null;
      seen.add(k);
      const ids = [...available(b)].filter((id) => !first || !firstVisible || firstVisible.has(id)).sort((a, c) => {
        const count = (id) => b.tray.filter(
          (x) => x.type === b.tubes.find((t) => t.id === id).balls.slice(-1)[0].type
        ).length;
        return count(c) - count(a);
      });
      if (b.pocket?.length) ids.unshift(RETURN_POCKET);
      for (const id of ids) {
        const path2 = dfs(
          id === RETURN_POCKET ? returnPocket(b, `solver-${nodes}-${id}`) : take(b, id, `solver-${nodes}-${id}`)
        );
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

  // src/controller.ts
  var Controller = class {
    constructor(now, store, ads2, playSound = () => {
    }, seedEntropy = Math.random, muralEntropy = Math.random) {
      this.now = now;
      this.store = store;
      this.ads = ads2;
      this.playSound = playSound;
      this.seedEntropy = seedEntropy;
      this.muralEntropy = muralEntropy;
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
      __publicField(this, "terminalDurable", false);
      __publicField(this, "recentHomeSeeds", /* @__PURE__ */ new Set());
      __publicField(this, "recentMuralVariants", []);
      this.recentMuralVariants = readMuralRecent(store);
      this.state = this.fresh(0, PRESETS[0].seed);
      const drained = drainTerminal(store);
      const loaded = restore(store);
      const records = readRecords(store);
      const settled = loaded.save && records.entries.some((r) => r.session === loaded.save.session);
      this.resume = drained && records.available && loaded.save && loaded.save.phase !== "result" && !settled ? loaded.save : null;
      if (loaded.message) this.message = loaded.message;
      if (!drained || !records.available)
        this.message = "\u7EC8\u5C40\u5B58\u6863\u6216\u6218\u7EE9\u4FDD\u5B58\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5";
      if (loaded.save?.phase === "result" && loaded.save.started && loaded.save.finishedAt !== void 0) {
        const result = commitTerminal(store, loaded.save);
        if (!result.complete) this.message = "\u7EC8\u5C40\u5B58\u6863\u6216\u6218\u7EE9\u4FDD\u5B58\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5";
      }
    }
    fresh(preset, seed) {
      const level = createLevel(preset, seed);
      return {
        schema: 1,
        generation: 2,
        rule: RULE,
        session: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        seed: level.seed,
        muralVariant: 0,
        preset,
        board: level.board,
        history: [],
        undoAvailable: false,
        baseMs: roundBaseMs(preset),
        remaining: roundBaseMs(preset),
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
    get muralVariant() {
      return muralVariantFor(this.state);
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
    get guideSeen() {
      try {
        return this.store.get("tricollect.guide.v1") === "seen";
      } catch {
        return false;
      }
    }
    acknowledgeGuide() {
      try {
        this.store.set("tricollect.guide.v1", "seen");
      } catch {
      }
    }
    startRandom(preset = 0) {
      this.start(preset, void 0, true);
    }
    start(preset = 0, seed, randomize = false) {
      if (this.phase === "ad") return;
      if (this.state.phase === "result" && this.state.started) {
        this.checkpoint();
        if (!this.terminalDurable) return;
      }
      if (!drainTerminal(this.store)) {
        this.message = "\u7EC8\u5C40\u5B58\u6863\u6216\u6218\u7EE9\u4FDD\u5B58\u5931\u8D25\uFF0C\u65B0\u5C40\u6682\u672A\u5F00\u59CB";
        return;
      }
      const saved = restore(this.store).save;
      if (saved?.phase === "result" && saved.started && saved.finishedAt !== void 0 && !commitTerminal(this.store, saved).complete) {
        this.message = "\u7EC8\u5C40\u5B58\u6863\u6216\u6218\u7EE9\u4FDD\u5B58\u5931\u8D25\uFF0C\u65B0\u5C40\u6682\u672A\u5F00\u59CB";
        return;
      }
      let fresh;
      if (randomize) {
        const excluded = new Set(
          [this.state.seed, this.resume?.seed, saved?.seed].filter(
            (v) => v !== void 0
          )
        );
        for (const previous of this.recentHomeSeeds) excluded.add(previous);
        for (let attempt = 0; attempt < 8 && !fresh; attempt++) {
          const candidate = nextSeed(excluded, this.seedEntropy);
          try {
            const generated = this.fresh(preset, candidate);
            if (!excluded.has(generated.seed)) fresh = generated;
          } catch {
          }
          excluded.add(candidate);
        }
        if (!fresh) {
          this.message = "\u65B0\u5C40\u751F\u6210\u5931\u8D25\uFF0C\u539F\u5C40\u5DF2\u4FDD\u7559\uFF0C\u8BF7\u91CD\u8BD5";
          return;
        }
      } else fresh = this.fresh(preset, seed ?? PRESETS[preset].seed);
      const excludedMurals = new Set(this.recentMuralVariants);
      excludedMurals.add(this.muralVariant);
      if (this.resume) excludedMurals.add(muralVariantFor(this.resume));
      if (saved) excludedMurals.add(muralVariantFor(saved));
      fresh.muralVariant = chooseMuralVariant(
        excludedMurals,
        this.muralEntropy,
        this.recentMuralVariants.at(-1) ?? (saved ? muralVariantFor(saved) : this.muralVariant)
      );
      this.recentMuralVariants = rememberMuralVariant(
        this.store,
        this.recentMuralVariants,
        fresh.muralVariant
      );
      this.terminalDurable = false;
      this.state = fresh;
      if (randomize) {
        this.recentHomeSeeds.add(fresh.seed);
        if (this.recentHomeSeeds.size > 256)
          this.recentHomeSeeds.delete(
            this.recentHomeSeeds.values().next().value
          );
      }
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
      this.message = result.status === "safe" ? this.hint === RETURN_POCKET ? "\u8BF7\u5148\u514D\u8D39\u653E\u56DE\u5BC4\u5B58\u7403" : "\u5F53\u524D\u9762\u4EAE\u6846\u7BA1\u4F4D\u6709\u5DF2\u9A8C\u8BC1\u7684\u540E\u7EED\u89E3" : result.status === "unknown" ? "\u9884\u7B97\u5185\u5C1A\u672A\u786E\u5B9A\uFF0C\u53EF\u5C1D\u8BD5\u64A4\u9500\u6216\u7EE7\u7EED\u89C2\u5BDF" : "\u5F53\u524D\u9762\u6682\u65E0\u53EF\u9760\u8DEF\u7EBF\uFF0C\u53EF\u65CB\u8F6C\u540E\u518D\u63D0\u793A";
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
      if (this.phase === "result" && this.state.started && !this.terminalDurable)
        return;
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
    get canLift() {
      return ["active", "blocked"].includes(this.phase) && this.board.tray.length > 0 && !this.board.pocket?.length && !this.state.rewards.some((r) => r.kind === "lift" && r.redeemed);
    }
    async liftBall() {
      this.tick();
      if (!this.canLift || !this.ads.free && !this.ads.available) return;
      if (this.ads.free) {
        const session2 = this.state.session;
        const id2 = `${session2}:assist:${++this.state.sequence}`;
        const after = lift(this.board, id2);
        if (after === this.board) return;
        this.state.rewards.push({
          id: id2,
          session: session2,
          kind: "lift",
          state: "completed",
          redeemed: true
        });
        this.state.board = after;
        this.state.history = [];
        this.state.undoAvailable = false;
        this.phase = "paused";
        this.hint = null;
        this.message = "\u672B\u7403\u5DF2\u514D\u8D39\u5BC4\u5B58\uFF0C\u70B9\u51FB\u7EE7\u7EED\u540E\u53EF\u653E\u56DE\uFF08\u6BCF\u5C40\u4E00\u6B21\uFF09";
        this.checkpoint();
        return;
      }
      const session = this.state.session, id = `${session}:reward:${++this.state.sequence}`;
      this.state.rewards.push({
        id,
        session,
        kind: "lift",
        state: "requested",
        redeemed: false
      });
      this.phase = "ad";
      this.message = "\u5B8C\u6574\u89C2\u770B\u540E\u79FB\u51FA\u672B\u7403\uFF1B\u4E4B\u540E\u53EF\u514D\u8D39\u653E\u56DE\uFF0C\u6BCF\u5C40\u4E00\u6B21";
      this.checkpoint();
      let outcome;
      try {
        outcome = await this.ads.request();
      } catch {
        outcome = "failed";
      }
      this.reward(session, id, outcome);
    }
    returnBall() {
      this.tick();
      if (this.phase !== "active") return;
      const before = this.board;
      const after = returnPocket(
        before,
        `${this.state.session}:${++this.state.sequence}`
      );
      if (before === after) return;
      this.state.history.push(clone(before));
      this.state.undoAvailable = true;
      this.state.board = after;
      this.phase = after.status === "won" ? "result" : after.status === "blocked" ? "blocked" : "active";
      this.last = this.now();
      this.hint = null;
      this.message = "\u5BC4\u5B58\u7403\u5DF2\u514D\u8D39\u653E\u56DE";
      this.checkpoint();
    }
    async extend() {
      this.tick();
      if (this.phase !== "expired" || this.state.extensions >= CONFIG.maxExtensions || !this.ads.free && !this.ads.available)
        return;
      if (this.ads.free) {
        const session2 = this.state.session;
        const id2 = `${session2}:assist:${++this.state.sequence}`;
        this.state.rewards.push({
          id: id2,
          session: session2,
          kind: "extend",
          state: "completed",
          redeemed: true
        });
        this.state.extensions++;
        this.state.added += CONFIG.extraMs;
        this.state.remaining += CONFIG.extraMs;
        this.phase = "paused";
        this.message = `\u5DF2\u514D\u8D39\u589E\u52A0 30 \u79D2\uFF0C\u70B9\u51FB\u7EE7\u7EED\uFF08${this.state.extensions}/${CONFIG.maxExtensions}\uFF09`;
        this.checkpoint();
        return;
      }
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
      if (r.kind === "lift") {
        if (outcome === "completed") {
          const after = lift(this.board, id);
          if (after === this.board) {
            r.state = "failed";
          } else {
            r.redeemed = true;
            this.state.board = after;
            this.state.history = [];
            this.state.undoAvailable = false;
          }
        }
        this.phase = this.board.status === "blocked" ? "blocked" : "paused";
        this.message = r.redeemed ? "\u672B\u7403\u5DF2\u5BC4\u5B58\uFF0C\u7EE7\u7EED\u540E\u53EF\u514D\u8D39\u653E\u56DE" : outcome === "cancelled" ? "\u672A\u5B8C\u6210\u89C2\u770B\uFF0C\u6CA1\u6709\u53D1\u653E\u5956\u52B1" : "\u5E7F\u544A\u5931\u8D25\uFF0C\u539F\u5C40\u5DF2\u4FDD\u7559";
        this.checkpoint();
        return;
      }
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
      if (this.state.phase === "result" && this.state.started) {
        const result = commitTerminal(this.store, this.state);
        this.terminalDurable = result.durable;
        if (!result.complete)
          this.message = "\u7EC8\u5C40\u5B58\u6863\u6216\u6218\u7EE9\u4FDD\u5B58\u5931\u8D25\uFF1B\u4FDD\u7559\u7EC8\u5C40\uFF0C\u6062\u590D\u540E\u91CD\u8BD5";
        return;
      }
      try {
        save(this.store, this.state);
        this.lastCheckpoint = this.now();
      } catch {
        this.message = "\u5B58\u6863\u5199\u5165\u5931\u8D25\uFF0C\u672C\u5C40\u53EF\u7EE7\u7EED\uFF1B\u9000\u51FA\u53EF\u80FD\u4E22\u5931\u8FDB\u5EA6";
      }
    }
  };

  // src/render/mural.ts
  var MURAL_VARIANTS2 = 8192;
  function muralRecipe(value) {
    let n = Math.max(0, Math.min(MURAL_VARIANTS2 - 1, Math.floor(value)));
    const base = n % 4;
    n = Math.floor(n / 4);
    const crop = n % 16;
    n = Math.floor(n / 16);
    const zoom = n % 8;
    n = Math.floor(n / 8);
    const mirror = !!(n % 2);
    n = Math.floor(n / 2);
    return { base, crop, zoom: 1.04 + zoom * 0.04, mirror, tint: n % 8 };
  }
  function composeMural(image, variant, factory) {
    const recipe = muralRecipe(variant), canvas2 = factory(768, 256);
    canvas2.width = 768;
    canvas2.height = 256;
    const c = canvas2.getContext("2d");
    if (!c) throw new Error("Mural canvas unavailable");
    const sw = 768 / recipe.zoom, sh = 256 / recipe.zoom;
    c.save();
    if (recipe.mirror) {
      c.translate(768, 0);
      c.scale(-1, 1);
    }
    c.drawImage(
      image,
      (768 - sw) * recipe.crop / 15,
      (256 - sh) / 2,
      sw,
      sh,
      0,
      0,
      768,
      256
    );
    c.restore();
    const tints = [
      "#fff4e416",
      "#f5dce81a",
      "#e4f3ee1a",
      "#e1effa1a",
      "#f8ebd51c",
      "#ece5fa1c",
      "#dcefea1c",
      "#ffe8da1c"
    ];
    c.fillStyle = tints[recipe.tint];
    c.fillRect(0, 0, 768, 256);
    c.fillStyle = "#fff8ee14";
    c.fillRect(0, 0, 768, 256);
    return canvas2;
  }

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
  function projectionFrame(side, width, top, bottom, angle, maxCapacity = 5) {
    const edge = side - 1;
    const lane = (width - 20) / (2 * edge / Math.sqrt(3) + 1), radius = lane / 2;
    const originalDepth = Math.min(108, edge * 18, (bottom - top) * 0.24);
    const depthSpace = originalDepth * 0.52;
    const zScale = depthSpace / (edge * Math.sqrt(3) / 2), extent = depthSpace * 2 / 3;
    const maxHeight = Math.min(380, bottom - top - 24 - depthSpace * 4 / 3);
    const ballRadius = Math.min(
      radius * 0.96,
      (maxHeight - 20) / (maxCapacity * 2)
    ), step = ballRadius * 1.94, height = step * maxCapacity + 20;
    const axis = {
      x: width / 2,
      y: top + 14 + height + extent + Math.max(0, (bottom - top - 24 - height - extent * 2) / 2)
    };
    const worldExtent = edge / Math.sqrt(3);
    const ellipseRadiusX = worldExtent * lane + radius + 4;
    const curve = (screenX) => Math.sqrt(Math.max(0, 1 - (screenX / ellipseRadiusX) ** 2));
    const frontHalfSpan = edge * lane / 2;
    const referenceSagRatio = 37 / 397;
    let arcDepth = frontHalfSpan * 2 * referenceSagRatio / (1 - curve(frontHalfSpan));
    let meanCurve = 0, count = 0;
    for (let q = 0; q <= edge; q++)
      for (let r = 0; r <= edge - q; r++) {
        const p = rotateWorld(worldPosition({ q, r }, side), angle);
        meanCurve += curve(p.x * lane);
        count++;
      }
    meanCurve /= count;
    const offsets = (bend) => {
      let min = Infinity, max = -Infinity;
      for (let q = 0; q <= edge; q++)
        for (let r = 0; r <= edge - q; r++) {
          const p = rotateWorld(worldPosition({ q, r }, side), angle);
          const offset = -p.z * zScale + bend * (curve(p.x * lane) - meanCurve);
          min = Math.min(min, offset);
          max = Math.max(max, offset);
        }
      return { min, max };
    };
    let fit = offsets(arcDepth);
    if (fit.max - fit.min > bottom - top - height) {
      let lo = 0, hi = arcDepth;
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2, trial = offsets(mid);
        if (trial.max - trial.min <= bottom - top - height) lo = mid;
        else hi = mid;
      }
      arcDepth = lo;
      fit = offsets(arcDepth);
    }
    const minOffset = fit.min, maxOffset = fit.max;
    axis.y = Math.max(
      top + height - minOffset,
      Math.min(bottom - maxOffset, axis.y)
    );
    const trayCurve = {
      x: axis.x,
      y: axis.y + depthSpace / 3 - arcDepth * meanCurve,
      rx: ellipseRadiusX,
      ry: arcDepth
    };
    const point = (t) => {
      const p = rotateWorld(worldPosition(t, side), angle);
      const bow = arcDepth * (curve(p.x * lane) - meanCurve);
      return {
        x: axis.x + p.x * lane,
        y: axis.y - p.z * zScale + bow,
        depth: p.z
      };
    };
    const traySurfaceY = axis.y;
    const traySurfaceRy = arcDepth;
    return {
      axis,
      lane,
      radius,
      height,
      step,
      ballRadius,
      zScale,
      arcDepth,
      trayCurve,
      traySurfaceY,
      traySurfaceRy,
      point
    };
  }
  var stablePlatterCache = /* @__PURE__ */ new Map();
  function restingSurface(frame, side) {
    const { radius, point, trayCurve } = frame;
    const ellipseRadiusX = trayCurve.rx, edge = side - 1;
    const curve = (x) => Math.sqrt(Math.max(0, 1 - (x / ellipseRadiusX) ** 2));
    const footRy = radius * 0.3 + Math.max(1.5, radius * 0.08) / 2;
    const samples = [];
    for (let q = 0; q <= edge; q++)
      for (let r = 0; r <= edge - q; r++) {
        const p = point({ q, r });
        samples.push({ y: p.y + 5, c: curve(p.x - trayCurve.x) });
        for (let sample = 0; sample < 16; sample++) {
          const a = sample * Math.PI * 2 / 16;
          samples.push({
            y: p.y - 2 + (footRy + 2) * Math.sin(a),
            c: curve(p.x + (radius + 2) * Math.cos(a) - trayCurve.x)
          });
        }
      }
    let lowY = Infinity, highY = -Infinity;
    for (const p of samples) {
      lowY = Math.min(lowY, p.y);
      highY = Math.max(highY, p.y);
    }
    const requiredRadius = (cy) => {
      let ry = 0;
      for (const p of samples) ry = Math.max(ry, Math.abs(p.y - cy) / p.c);
      return ry;
    };
    for (let i = 0; i < 28; i++) {
      const left = (lowY * 2 + highY) / 3, right = (lowY + highY * 2) / 3;
      if (requiredRadius(left) < requiredRadius(right)) highY = right;
      else lowY = left;
    }
    const minFitY = (lowY + highY) / 2;
    const traySurfaceRy = Math.max(
      requiredRadius(minFitY) + 0.1,
      ellipseRadiusX * 84 / 380
    );
    let traySurfaceY = -Infinity;
    for (const p of samples)
      traySurfaceY = Math.max(traySurfaceY, p.y - traySurfaceRy * p.c);
    return { y: traySurfaceY, ry: traySurfaceRy };
  }
  function projection(side, width, top, bottom, angle, maxCapacity = 5) {
    const frame = projectionFrame(side, width, top, bottom, angle, maxCapacity);
    const key2 = [side, width, top, bottom, maxCapacity].join(":");
    let surface = stablePlatterCache.get(key2);
    if (!surface) {
      surface = restingSurface(
        projectionFrame(side, width, top, bottom, 0, maxCapacity),
        side
      );
      if (stablePlatterCache.size >= 32)
        stablePlatterCache.delete(stablePlatterCache.keys().next().value);
      stablePlatterCache.set(key2, surface);
    }
    const fixed = surface, rx = frame.trayCurve.rx;
    const phase = (angle % (Math.PI * 2 / 3) + Math.PI * 2 / 3) % (Math.PI * 2 / 3);
    const atRest = Math.min(phase, Math.PI * 2 / 3 - phase) < 1e-9;
    const footRy = frame.radius * 0.3 + Math.max(1.5, frame.radius * 0.08) / 2;
    const point = (t) => {
      const p = frame.point(t);
      if (atRest) return p;
      const dx = p.x - frame.axis.x, dy = p.y - 2 - fixed.y;
      const fits = (scale) => {
        for (let k = 0; k < 32; k++) {
          const a = k * Math.PI / 16;
          const u = (dx * scale + (frame.radius + 0.5) * Math.cos(a)) / rx;
          const v = (dy * scale + (footRy + 0.5) * Math.sin(a)) / fixed.ry;
          if (u * u + v * v > 1) return false;
        }
        return true;
      };
      if (fits(1)) return p;
      let lo = 0, hi = 1;
      for (let i = 0; i < 22; i++) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) lo = mid;
        else hi = mid;
      }
      return { ...p, x: frame.axis.x + dx * lo, y: fixed.y + 2 + dy * lo };
    };
    return { ...frame, traySurfaceY: fixed.y, traySurfaceRy: fixed.ry, point };
  }

  // src/render/scene.ts
  var Scene = class {
    constructor(ctx2, game2, width, height, displayScale = 1) {
      this.ctx = ctx2;
      this.game = game2;
      this.width = width;
      this.height = height;
      this.displayScale = displayScale;
      __publicField(this, "buttons", []);
      __publicField(this, "homePanel", null);
      __publicField(this, "recordPage", 0);
      __publicField(this, "toolDialog", null);
      __publicField(this, "guideOpen", false);
      __publicField(this, "guideStep", 0);
      __publicField(this, "celebrationMs", 0);
      __publicField(this, "celebrationSession", "");
      __publicField(this, "celebrationLast", null);
      __publicField(this, "mascotTime", 0);
      __publicField(this, "foreground", true);
      __publicField(this, "decorationLast", null);
      __publicField(this, "selectedDifficulty", 0);
      __publicField(this, "boardInputAfter", 0);
      __publicField(this, "trackObjects", []);
      __publicField(this, "misclickFeedback", null);
      __publicField(this, "tubeGlass", null);
      __publicField(this, "tubeGlassRear", null);
      __publicField(this, "hiddenStyle", "current");
      __publicField(this, "muralImages", []);
      __publicField(this, "preparedMural", -1);
      __publicField(this, "hiddenArtworkCanvasFactory", null);
      __publicField(this, "hiddenArtworkRasterScale", 2);
      __publicField(this, "hiddenArtworkCache", /* @__PURE__ */ new Map());
      __publicField(this, "hiddenArtworkCacheBytes", 0);
      __publicField(this, "hiddenArtworkCacheHits", 0);
      __publicField(this, "hiddenArtworkCacheMisses", 0);
      __publicField(this, "hiddenArtwork", null);
      __publicField(this, "hiddenMural", false);
      __publicField(this, "turntable", null);
      __publicField(this, "ballAtlas", null);
      __publicField(this, "homeLogo", null);
      __publicField(this, "homeHero", null);
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
      __publicField(this, "hiddenSurfaces", []);
      __publicField(this, "capStates", []);
      __publicField(this, "titleAngle", 0);
      __publicField(this, "homeGroupOffset", 16);
      __publicField(this, "targets", []);
      __publicField(this, "bodies", []);
    }
    get decorationTime() {
      return this.mascotTime;
    }
    setForeground(value) {
      this.foreground = value;
      this.decorationLast = null;
      this.celebrationLast = null;
    }
    animateHome() {
      try {
        const now = this.game.now();
        if (!Number.isFinite(now)) return;
        if (this.foreground && !this.homePanel && this.decorationLast !== null)
          this.mascotTime += Math.max(0, Math.min(64, now - this.decorationLast));
        this.decorationLast = now;
      } catch {
        this.decorationLast = null;
      }
    }
    setTubeGlass(image) {
      this.tubeGlass = image;
    }
    setTubeGlassRear(image) {
      this.tubeGlassRear = image;
    }
    glassWall(x, top, bottom, radius, rear = 0) {
      if (!this.tubeGlass) return;
      const c = this.ctx, material = this.tubeGlass;
      const drawMaterial = () => {
        const sw = 166, sh = 603, cap = 64, foot = 50;
        const scale = radius * 2 / sw, end = radius * 0.6;
        const yy = top - end / 2, total = bottom + 2 - yy;
        c.drawImage(material, 0, 0, sw, cap, x - radius, yy, radius * 2, end);
        c.save();
        try {
          c.beginPath();
          c.rect(
            x - radius,
            yy + end,
            radius * 0.14,
            Math.max(1, total - end - 4 - radius * 0.13)
          );
          c.rect(
            x + radius * 0.86,
            yy + end,
            radius * 0.14,
            Math.max(1, total - end - 4 - radius * 0.13)
          );
          c.clip();
          c.drawImage(
            material,
            0,
            cap,
            sw,
            sh - cap - foot,
            x - radius,
            yy + end,
            radius * 2,
            Math.max(1, total - end - 4 - radius * 0.13)
          );
        } finally {
          c.restore();
        }
        c.beginPath();
        c.ellipse(
          x,
          top,
          radius * 0.88,
          radius * 0.22,
          0,
          Math.PI * 1.05,
          Math.PI * 1.75
        );
        c.strokeStyle = "#ffffffff";
        c.lineWidth = Math.max(1.2, radius * 0.08);
        c.stroke();
        const glint = c.createLinearGradient(
          0,
          top + end * 0.65,
          0,
          top + radius * 0.85
        );
        glint.addColorStop(0, "#ffffffff");
        glint.addColorStop(0.45, "#ffffffd8");
        glint.addColorStop(1, "#ffffff00");
        c.beginPath();
        c.moveTo(x - radius * 0.73, top + end * 0.7);
        c.quadraticCurveTo(
          x - radius * 0.83,
          top + radius * 0.52,
          x - radius * 0.73,
          Math.min(bottom - radius, top + radius * 0.85)
        );
        c.strokeStyle = glint;
        c.lineWidth = Math.max(1.7, radius * 0.15);
        c.stroke();
        const sideY = bottom - 2 - radius * 0.13;
        const contour = (inset, lift2) => {
          const rx = radius - inset;
          c.beginPath();
          c.moveTo(x - rx, sideY - radius * 0.36);
          c.lineTo(x - rx, sideY);
          c.ellipse(x, sideY, rx, radius * 0.43 - lift2, 0, Math.PI, 0, true);
          c.lineTo(x + rx, sideY - radius * 0.36);
        };
        contour(radius * 0.02, 0);
        c.strokeStyle = "#302832c0";
        c.lineWidth = 0.8;
        c.stroke();
        contour(radius * 0.07, radius * 0.075);
        const heelReflection = c.createLinearGradient(
          x - radius,
          0,
          x + radius,
          0
        );
        heelReflection.addColorStop(0, "#f5ffff10");
        heelReflection.addColorStop(0.12, "#ffffffee");
        heelReflection.addColorStop(0.35, "#f5ffff00");
        heelReflection.addColorStop(0.68, "#f5ffff00");
        heelReflection.addColorStop(0.9, "#f5ffff00");
        heelReflection.addColorStop(1, "#f5ffff00");
        c.strokeStyle = heelReflection;
        c.lineWidth = Math.max(1.3, radius * 0.1);
        c.stroke();
      };
      c.save();
      try {
        if (rear) {
          if (this.tubeGlassRear) {
            const band = rear < 0.35 ? 0 : rear < 0.78 ? 1 : 2;
            const scale = radius * 2 / 166, pad = 12 * scale;
            const topEnd = radius * 0.6, footEnd = 64 * scale;
            const yy = top - topEnd / 2, total = bottom + 2 - yy;
            const sx = band * 95, dx = x - radius - pad, dw = radius * 2 + pad * 2;
            c.drawImage(
              this.tubeGlassRear,
              sx,
              0,
              95,
              38,
              dx,
              yy - pad,
              dw,
              topEnd + pad
            );
            c.save();
            try {
              c.beginPath();
              c.rect(
                dx,
                yy + topEnd,
                radius * 0.14 + pad * 2,
                Math.max(1, total - topEnd - footEnd)
              );
              c.rect(
                x + radius * 0.86 - pad,
                yy + topEnd,
                radius * 0.14 + pad * 2,
                Math.max(1, total - topEnd - footEnd)
              );
              c.clip();
              c.drawImage(
                this.tubeGlassRear,
                sx,
                38,
                95,
                237.5,
                dx,
                yy + topEnd,
                dw,
                Math.max(1, total - topEnd - footEnd)
              );
            } finally {
              c.restore();
            }
            c.drawImage(
              this.tubeGlassRear,
              sx,
              275.5,
              95,
              38,
              dx,
              yy + total - footEnd,
              dw,
              footEnd + pad
            );
          } else {
            c.globalAlpha *= 0.42 - rear * 0.2;
            drawMaterial();
          }
        } else {
          drawMaterial();
          const rx = radius * 0.78;
          const ry = radius * 0.15;
          c.save();
          try {
            c.beginPath();
            c.ellipse(x, top, rx, ry, 0, 0, Math.PI * 2);
            c.clip();
            this.transmittedBackdrop(x - rx, top - ry, rx * 2, ry * 2);
          } finally {
            c.restore();
          }
        }
      } finally {
        c.restore();
      }
    }
    setHiddenStyle(style) {
      this.hiddenStyle = style;
    }
    setMuralImage(index, image) {
      if (index < 0 || index > 3) return;
      this.muralImages[index] = image;
      this.preparedMural = -1;
    }
    prepareMural() {
      const variant = this.game.muralVariant;
      if (this.preparedMural === variant) return;
      const image = this.muralImages[muralRecipe(variant).base];
      if (!image) return;
      try {
        const composed = this.hiddenArtworkCanvasFactory ? composeMural(image, variant, this.hiddenArtworkCanvasFactory) : image;
        this.setHiddenArtwork(composed, true);
        this.preparedMural = variant;
      } catch {
        this.setHiddenArtwork(image, true);
        this.preparedMural = variant;
      }
    }
    setHiddenArtworkCanvasFactory(factory, rasterScale = 2) {
      this.clearHiddenArtworkCache();
      this.hiddenArtworkCanvasFactory = factory;
      this.hiddenArtworkRasterScale = Number.isFinite(rasterScale) ? Math.max(1, Math.min(3, rasterScale)) : 2;
    }
    get hiddenArtworkCacheStats() {
      return {
        entries: this.hiddenArtworkCache.size,
        bytes: this.hiddenArtworkCacheBytes,
        hits: this.hiddenArtworkCacheHits,
        misses: this.hiddenArtworkCacheMisses
      };
    }
    clearHiddenArtworkCache() {
      this.hiddenArtworkCache.clear();
      this.hiddenArtworkCacheBytes = 0;
      this.hiddenArtworkCacheHits = 0;
      this.hiddenArtworkCacheMisses = 0;
    }
    paintHiddenArtwork(c, x, capY, baseY, inner, muralLeft, muralRight, muralTop, muralBottom) {
      const image = this.hiddenArtwork;
      if (!image) return;
      const h = baseY - capY + inner * 0.43;
      const sourceX = this.hiddenMural ? (x - inner - muralLeft) / (muralRight - muralLeft) * 768 : 0;
      const sourceY = this.hiddenMural ? (capY - muralTop) / (muralBottom - muralTop) * 256 : 0;
      const sourceW = this.hiddenMural ? inner * 2 / (muralRight - muralLeft) * 768 : 256;
      const sourceH = this.hiddenMural ? h / (muralBottom - muralTop) * 256 : 512;
      const drawStrips = (target, originX, originY) => {
        for (let strip = 0; strip < 24; strip++) {
          const u0 = strip / 24, u1 = (strip + 1) / 24;
          const dx0 = Math.sin((u0 - 0.5) * Math.PI) * inner;
          const dx1 = Math.sin((u1 - 0.5) * Math.PI) * inner;
          target.drawImage(
            image,
            sourceX + u0 * sourceW,
            sourceY,
            sourceW / 24,
            sourceH,
            originX + dx0,
            originY,
            dx1 - dx0 + 0.25,
            h
          );
        }
      };
      const scale = this.hiddenArtworkRasterScale;
      const width = Math.ceil((inner * 2 + 0.25) * scale), height = Math.ceil(h * scale);
      const bytes = width * height * 4;
      if (this.hiddenArtworkCanvasFactory && width > 0 && height > 0 && bytes <= 16 * 1024 * 1024) {
        const key2 = [inner, h, sourceX, sourceY, sourceW, sourceH, scale].join(
          ":"
        );
        let entry = this.hiddenArtworkCache.get(key2);
        if (entry) {
          this.hiddenArtworkCacheHits++;
          this.hiddenArtworkCache.delete(key2);
          this.hiddenArtworkCache.set(key2, entry);
        } else {
          this.hiddenArtworkCacheMisses++;
          try {
            const bitmap = this.hiddenArtworkCanvasFactory(width, height);
            bitmap.width = width;
            bitmap.height = height;
            const target = bitmap.getContext("2d");
            if (!target) throw new Error("No offscreen 2D canvas");
            target.scale(scale, scale);
            drawStrips(target, inner, 0);
            entry = {
              image: bitmap,
              width: width / scale,
              height: height / scale,
              bytes
            };
            while (this.hiddenArtworkCache.size >= 128 || this.hiddenArtworkCacheBytes + bytes > 16 * 1024 * 1024) {
              const oldest = this.hiddenArtworkCache.keys().next().value;
              if (oldest === void 0) break;
              this.hiddenArtworkCacheBytes -= this.hiddenArtworkCache.get(oldest).bytes;
              this.hiddenArtworkCache.delete(oldest);
            }
            this.hiddenArtworkCache.set(key2, entry);
            this.hiddenArtworkCacheBytes += bytes;
          } catch {
            this.hiddenArtworkCanvasFactory = null;
            this.clearHiddenArtworkCache();
          }
        }
        if (entry) {
          c.drawImage(entry.image, x - inner, capY, entry.width, entry.height);
          return;
        }
      }
      drawStrips(c, x, capY);
    }
    setHiddenArtwork(image, mural = false) {
      this.clearHiddenArtworkCache();
      this.hiddenArtwork = image;
      this.hiddenMural = mural;
    }
    setTurntable(image) {
      this.turntable = image;
    }
    setBallAtlas(image) {
      this.ballAtlas = image;
    }
    setHomeArt(kind, image) {
      if (kind === "logo") this.homeLogo = image;
      else this.homeHero = image;
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
    get trayTop() {
      return this.height - 119;
    }
    text(t, x, y, size = 14, color = "#284b40", align = "left") {
      const c = this.ctx;
      c.font = `${size >= 14 ? "800" : "400"} ${size}px sans-serif`;
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
    button(id, label, x, y, w, h, act, disabled = false, accent = false, dimmed = disabled) {
      h = Math.max(
        ["home-dialog-close", "tool-close", "home"].includes(id) ? 62 : 52,
        h
      );
      const c = this.ctx;
      const primary = accent || id.startsWith("rotate") || id === "again";
      const radius = Math.min(25, h * 0.38);
      c.save();
      this.rect(x - 3, y + 3, w + 6, h + 3, "#68382130", radius + 4);
      this.rect(x - 3, y - 3, w + 6, h + 6, "#fffef5", radius + 4);
      this.rect(x, y, w, h, dimmed ? "#77817a" : "#67351d", radius);
      this.rect(
        x + 2,
        y + 3,
        w - 4,
        h - 5,
        dimmed ? "#a5b0a7" : primary ? "#297815" : "#e2a542",
        radius - 2
      );
      const fill = c.createLinearGradient(0, y + 3, 0, y + h - 7);
      fill.addColorStop(0, dimmed ? "#d1d8cd" : primary ? "#b7f51b" : "#fffbd6");
      fill.addColorStop(
        0.48,
        dimmed ? "#b7c0b6" : primary ? "#8fdd09" : "#fff1b7"
      );
      fill.addColorStop(1, dimmed ? "#a3afa2" : primary ? "#58bf04" : "#ffd978");
      this.rect(x + 3, y + 3, w - 6, h - 11, "#ffffff", radius - 3);
      c.fillStyle = fill;
      c.fill();
      c.strokeStyle = dimmed ? "#ffffff44" : "#ffffffb0";
      c.lineWidth = 2;
      c.stroke();
      c.strokeStyle = "#ffffffed";
      c.lineWidth = 3;
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(x + 11, y + 13);
      c.quadraticCurveTo(x + 13, y + 8, x + 22, y + 8);
      c.stroke();
      const outlinedText = (value, yy, size) => {
        c.font = `900 ${size}px sans-serif`;
        c.textAlign = "center";
        c.lineJoin = "round";
        c.lineWidth = size > 22 ? 5 : 3;
        c.strokeStyle = primary ? "#315411" : "#fff6d4";
        c.strokeText(value, x + w / 2, yy);
        c.fillStyle = dimmed ? "#5d655b" : primary ? "#fffdf1" : "#67351d";
        c.fillText(value, x + w / 2, yy);
      };
      if (id.startsWith("rotate")) {
        c.save();
        c.translate(x + w / 2, y + 19);
        c.scale(id === "rotate-left" ? 1 : -1, 1);
        c.beginPath();
        c.moveTo(-12, -9);
        c.lineTo(-22, 0);
        c.lineTo(-12, 9);
        c.lineTo(-12, 4);
        c.bezierCurveTo(0, 2, 10, 3, 9, 12);
        c.bezierCurveTo(25, 0, 11, -7, -12, -5);
        c.closePath();
        c.strokeStyle = "#315411";
        c.lineWidth = 3;
        c.lineJoin = "round";
        c.stroke();
        c.fillStyle = "#fffdf1";
        c.fill();
        c.restore();
        outlinedText(
          id === "rotate-left" ? "\u5411\u5DE6\u8F6C" : "\u5411\u53F3\u8F6C",
          y + h - 10,
          Math.min(15, w / 4.1)
        );
      } else if (id === "start-menu") {
        outlinedText(label, y + h / 2 + 9, 28);
      } else {
        outlinedText(label, y + h / 2 + 5, 16);
      }
      c.restore();
      this.buttons.push({ id, x, y, w, h, act, disabled, dimmed });
    }
    ball(type, x, y, r, alpha = 1) {
      const c = this.ctx;
      c.save();
      try {
        c.globalAlpha = alpha;
        if (this.ballAtlas) {
          c.save();
          try {
            c.beginPath();
            c.arc(x, y, r, 0, Math.PI * 2);
            c.clip();
            c.drawImage(
              this.ballAtlas,
              type % 4 * 128,
              Math.floor(type / 4) * 128,
              128,
              128,
              x - r,
              y - r,
              r * 2,
              r * 2
            );
          } finally {
            c.restore();
          }
          return;
        }
        const rgb = PALETTE[type].slice(1).match(/../g).map((n) => parseInt(n, 16));
        const shade = (mix) => "#" + rgb.map(
          (v) => Math.round(mix > 0 ? v + (255 - v) * mix : v * (1 + mix)).toString(16).padStart(2, "0")
        ).join("");
        const contact = c.createRadialGradient(
          x + r * 0.1,
          y + r * 0.88,
          0,
          x + r * 0.1,
          y + r * 0.88,
          r * 0.86
        );
        contact.addColorStop(0, "#59331d60");
        contact.addColorStop(0.5, "#59331d24");
        contact.addColorStop(1, "#59331d00");
        c.save();
        c.translate(x + r * 0.1, y + r * 0.88);
        c.scale(1, 0.24);
        c.translate(-x - r * 0.1, -y - r * 0.88);
        c.fillStyle = contact;
        c.beginPath();
        c.arc(x + r * 0.1, y + r * 0.88, r * 0.86, 0, Math.PI * 2);
        c.fill();
        c.restore();
        const body = c.createRadialGradient(
          x - r * 0.38,
          y - r * 0.42,
          r * 0.02,
          x + r * 0.13,
          y + r * 0.22,
          r * 1.25
        );
        body.addColorStop(0, shade(0.55));
        body.addColorStop(0.23, shade(0.25));
        body.addColorStop(0.48, shade(0.04));
        body.addColorStop(0.7, shade(-0.08));
        body.addColorStop(0.88, shade(-0.26));
        body.addColorStop(1, shade(-0.42));
        c.fillStyle = body;
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.fill();
        c.save();
        c.clip();
        const bounce = c.createRadialGradient(
          x + r * 0.26,
          y + r * 0.83,
          0,
          x + r * 0.26,
          y + r * 0.83,
          r * 0.76
        );
        bounce.addColorStop(0, "#fff6bb68");
        bounce.addColorStop(0.45, "#fff0ae20");
        bounce.addColorStop(1, "#fff0ae00");
        c.fillStyle = bounce;
        c.fillRect(x - r, y - r, r * 2, r * 2);
        const gloss = c.createRadialGradient(
          x - r * 0.34,
          y - r * 0.45,
          0,
          x - r * 0.34,
          y - r * 0.45,
          r * 0.48
        );
        gloss.addColorStop(0, "#ffffffbd");
        gloss.addColorStop(0.38, "#ffffff55");
        gloss.addColorStop(1, "#ffffff00");
        c.fillStyle = gloss;
        c.fillRect(x - r, y - r, r * 2, r * 2);
        c.fillStyle = "#fffffff2";
        c.beginPath();
        c.ellipse(
          x - r * 0.34,
          y - r * 0.46,
          r * 0.23,
          r * 0.145,
          -0.65,
          0,
          Math.PI * 2
        );
        c.fill();
        c.fillStyle = "#ffffff9c";
        c.beginPath();
        c.ellipse(
          x - r * 0.04,
          y - r * 0.69,
          r * 0.052,
          r * 0.037,
          -0.3,
          0,
          Math.PI * 2
        );
        c.fill();
        c.strokeStyle = "#fff7dc66";
        c.lineWidth = Math.max(0.7, r * 0.055);
        c.lineCap = "round";
        c.beginPath();
        c.arc(x, y, r * 0.92, Math.PI * 0.05, Math.PI * 0.31);
        c.stroke();
        c.restore();
        this.text(
          SYMBOLS[type],
          x,
          y + r * 0.42,
          Math.max(5, r * 0.32),
          "#30244758",
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
      const c = this.ctx;
      c.beginPath();
      c.moveTo(x - r, top);
      c.lineTo(x + r, top);
      c.lineTo(x + r, y - 5);
      c.quadraticCurveTo(x + r, y + 2, x + r * 0.75, y + 2);
      c.lineTo(x - r * 0.75, y + 2);
      c.quadraticCurveTo(x - r, y + 2, x - r, y - 5);
      c.closePath();
    }
    transmittedBackdrop(x, y, w, h) {
      const c = this.ctx;
      c.fillStyle = "#fff0dc";
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
      this.prepareMural();
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
      bg.addColorStop(0, "#fff0c8");
      bg.addColorStop(1, "#afdae2");
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
      if (this.toolDialog && (this.toolDialog.session !== g.state.session || !["paused", "blocked"].includes(g.phase)))
        this.toolDialog = null;
      if (this.toolDialog) {
        this.toolOverlay();
        return;
      }
      if (g.phase === "home") {
        this.home();
        return;
      }
      this.homePanel = null;
      this.decorationLast = null;
      this.rect(15, 15, 118, 53, "#fffef3", 22);
      this.rect(18, 18, 112, 47, "#683821", 19);
      const clockGloss = c.createLinearGradient(0, 19, 0, 62);
      clockGloss.addColorStop(0, "#9c6546");
      clockGloss.addColorStop(1, "#5c2e22");
      this.rect(21, 21, 106, 39, "#75452e", 16);
      c.fillStyle = clockGloss;
      c.fill();
      const secs = Math.ceil(g.state.remaining / 1e3);
      this.text(
        `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`,
        74,
        51,
        29,
        g.state.remaining < 3e4 ? "#ffd174" : "#ffffff",
        "center"
      );
      this.rect(12, 74, w - 24, 44, "#745c4433", 17);
      this.rect(12, 71, w - 24, 44, "#ffffff", 17);
      const hudBlue = c.createLinearGradient(0, 74, 0, 114);
      hudBlue.addColorStop(0, "#37cbff");
      hudBlue.addColorStop(0.4, "#159fe3");
      hudBlue.addColorStop(1, "#0472ba");
      this.rect(15, 74, w - 30, 38, "#159ed5", 14);
      c.fillStyle = hudBlue;
      c.fill();
      const total = g.board.tubes.reduce((n, t) => n + t.capacity, 0);
      const progress = g.board.cleared.length / total;
      this.text(`\u6E05\u7A7A ${g.board.cleared.length}/${total}`, 23, 93, 16, "#ffffff");
      this.rect(w - 72, 78, 50, 23, "#6b3821", 11);
      this.rect(w - 70, 79, 46, 20, "#fff4cd", 9);
      this.text(
        PRESETS[g.state.preset].name,
        w - 47,
        94,
        13,
        "#67351d",
        "center"
      );
      this.rect(23, 101, w - 46, 7, "#b6ecff", 4);
      this.rect(25, 103, w - 50, 3, "#4b9dcc", 2);
      if (progress > 0)
        this.rect(25, 102, Math.max(6, (w - 50) * progress), 5, "#9feeff", 3);
      const hidden = ["paused", "ad", "expired", "blocked", "result"].includes(
        g.phase
      );
      if (hidden) {
        this.overlay();
        return;
      }
      const trayY = this.trayTop, boardBottom = trayY - 80;
      this.drawBoard(127, boardBottom);
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
      this.rect(14, trayY - 8, w - 28, 60, "#bc8d5d", 17);
      this.rect(17, trayY - 9, w - 34, 56, "#fdfcf0", 14);
      this.rect(20, trayY - 6, w - 40, 5, "#ffffff", 3);
      const cell = (w - 44) / 7;
      for (let i = 0; i < 7; i++) {
        const x = 22 + i * cell;
        this.rect(x, trayY + 1, cell - 4, 43, "#ffffff", 13);
        const well = c.createLinearGradient(x, trayY, x + cell, trayY + 42);
        well.addColorStop(0, "#b38c65");
        well.addColorStop(0.2, "#dcc3a0");
        well.addColorStop(0.78, "#f0dfc3");
        well.addColorStop(1, "#fff2d9");
        this.rect(x, trayY, cell - 4, 40, "#adced2", 12);
        c.fillStyle = well;
        c.fill();
        const ball = g.board.tray[i];
        if (ball) this.ball(ball.type, x + (cell - 4) / 2, trayY + 21, 15);
      }
      const bw = (w - 65) / 4;
      const transientLock = g.phase === "resolving" || g.phase === "rotating";
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
        !g.canTurn,
        false,
        !g.canTurn && !transientLock
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
        !g.canTurn,
        false,
        !g.canTurn && !transientLock
      );
      this.button(
        "undo",
        "\u64A4\u9500",
        36 + bw * 2,
        trayY + 55,
        bw,
        44,
        () => g.undo(),
        g.locked || !g.canUndo,
        false,
        !g.canUndo || g.locked && !transientLock
      );
      this.button(
        "hint",
        "\u63D0\u793A",
        43 + bw * 3,
        trayY + 55,
        bw,
        44,
        () => g.hintNow(),
        g.locked,
        false,
        g.locked && !transientLock
      );
      if (/失败|中断|预算|暂无|后续解|请先/.test(g.message))
        this.text(
          this.fit(
            g.message,
            Math.floor((w - (g.board.pocket?.length ? 200 : 124)) / 11)
          ),
          w - 22,
          trayY - 44,
          11,
          "#713e28",
          "right"
        );
      if (g.board.pocket?.length) {
        this.button(
          "return-ball",
          "\u514D\u8D39\u653E\u56DE",
          22,
          trayY - 63,
          140,
          44,
          () => g.returnBall(),
          g.locked,
          false,
          g.locked && !transientLock
        );
        this.ball(g.board.pocket[0].type, 46, trayY - 38, 12);
      } else {
        this.button(
          "lift-ball",
          "",
          22,
          trayY - 63,
          64,
          44,
          () => this.openTool(),
          !["active", "blocked"].includes(g.phase),
          false,
          !["active", "blocked"].includes(g.phase) && !transientLock
        );
        this.drawTool(54, trayY - 44);
        this.text(
          g.state.rewards.some((r) => r.kind === "lift" && r.redeemed) ? "\u5DF2\u4F7F\u7528" : "\u5BC4\u5B58",
          54,
          trayY - 18,
          11,
          "#66371f",
          "center"
        );
      }
      if (g.phase === "intro" || g.phase === "ready") {
        this.buttons = [];
        this.targets = [];
        c.fillStyle = "#342b496e";
        c.fillRect(0, 0, w, h);
        const panelY = Math.max(90, h * 0.36);
        this.rect(22, panelY, w - 44, 174, "#fff8e9", 22);
        this.text("\u51C6\u5907\u597D\u4E86\u5417\uFF1F", w / 2, panelY + 40, 25, "#70452f", "center");
        this.text(
          "\u70B9\u51FB\u6B63\u9762\u9876\u7403\uFF0C\u4E09\u9897\u540C\u8272\u6D88\u9664",
          w / 2,
          panelY + 74,
          14,
          "#6f655b",
          "center"
        );
        this.button(
          "begin",
          g.phase === "intro" ? "\u8DF3\u8FC7\u5F00\u573A" : `\u5F00\u59CB \xB7 ${String(Math.floor(g.state.remaining / 6e4)).padStart(2, "0")}:${String(Math.floor(g.state.remaining / 1e3) % 60).padStart(2, "0")}`,
          44,
          panelY + 98,
          w - 88,
          48,
          () => {
            if (g.phase === "intro") g.skipIntro();
            else {
              this.boardInputAfter = g.now() + 250;
              g.begin();
            }
          },
          false,
          true
        );
      }
      if (this.guideOpen && ["intro", "ready"].includes(g.phase))
        this.guideOverlay();
      else this.guideOpen = false;
    }
    drawTool(x, y) {
      const c = this.ctx;
      this.rect(x - 13, y - 4, 26, 14, "#d1f4f1", 6);
      this.ball(3, x, y - 5, 8);
      c.strokeStyle = "#fff8c9";
      c.lineWidth = 2;
      c.lineCap = "round";
      c.lineJoin = "round";
      c.beginPath();
      c.moveTo(x + 17, y + 4);
      c.lineTo(x + 17, y - 11);
      c.lineTo(x + 13, y - 7);
      c.moveTo(x + 17, y - 11);
      c.lineTo(x + 21, y - 7);
      c.stroke();
    }
    openTool() {
      const g = this.game;
      g.tick();
      if (!["active", "blocked"].includes(g.phase)) return;
      const resume = g.phase === "active";
      if (resume) g.pause();
      this.toolDialog = { session: g.state.session, resume };
    }
    closeTool() {
      const resume = this.toolDialog?.resume;
      this.toolDialog = null;
      if (resume) this.game.begin();
    }
    toolOverlay() {
      const g = this.game, w = this.width, h = this.height, y = Math.max(90, (h - 330) / 2);
      this.buttons = [];
      this.targets = [];
      this.bodies = [];
      this.ctx.fillStyle = "#173e6599";
      this.ctx.fillRect(0, 0, w, h);
      this.rect(18, y, w - 36, 330, "#294f70", 24);
      this.rect(22, y + 4, w - 44, 322, "#fffbed", 20);
      this.drawTool(w / 2, y + 38);
      this.text("\u5BC4\u5B58\u6CE1\u6CE1", w / 2, y + 83, 24, "#29495e", "center");
      const used = g.state.rewards.some((r) => r.kind === "lift" && r.redeemed);
      const allowed = !used && !g.board.pocket?.length && g.board.tray.length > 0;
      const lines = used ? ["\u672C\u5C40\u5DF2\u4F7F\u7528\u4E00\u6B21", "\u5BC4\u5B58\u7403\u653E\u56DE\u540E\u4E5F\u4E0D\u4F1A\u91CD\u590D\u53D1\u653E"] : !g.ads.free && !g.ads.available ? ["\u5E7F\u544A\u6682\u4E0D\u53EF\u7528\uFF0C\u672C\u6B21\u65E0\u6CD5\u4F7F\u7528", "\u4E0D\u4F1A\u6263\u9664\u6B21\u6570\uFF0C\u4ECD\u53EF\u514D\u8D39\u64A4\u9500\u6216\u7EE7\u7EED"] : !g.board.tray.length ? ["\u5148\u628A\u4E00\u9897\u7403\u653E\u5165\u6682\u5B58\u69FD", "\u518D\u4F7F\u7528\u9053\u5177\u817E\u51FA\u4E00\u683C"] : [
        g.ads.free ? "\u514D\u8D39\u79FB\u51FA\u6682\u5B58\u69FD\u672B\u7403\uFF0C\u817E\u51FA\u4E00\u683C" : "\u5B8C\u6574\u89C2\u770B\u5E7F\u544A\uFF0C\u79FB\u51FA\u6682\u5B58\u69FD\u672B\u7403",
        "\u6BCF\u5C40\u4E00\u6B21 \xB7 \u4E4B\u540E\u53EF\u514D\u8D39\u653E\u56DE"
      ];
      lines.forEach(
        (line, i) => this.text(line, w / 2, y + 123 + i * 25, 13, "#4e6877", "center")
      );
      const canRequest = allowed && (g.ads.free || g.ads.available);
      if (canRequest) {
        this.text(g.ads.label, w / 2, y + 181, 11, "#617366", "center");
        this.button(
          "tool-confirm",
          g.ads.free ? "\u514D\u8D39\u4F7F\u7528 \xB7 \u6BCF\u5C40\u4E00\u6B21" : "\u770B\u5E7F\u544A\u4F7F\u7528",
          40,
          y + 201,
          w - 80,
          44,
          () => {
            this.closeTool();
            void g.liftBall();
          },
          false,
          true
        );
      }
      this.button(
        "tool-close",
        canRequest ? "\u6682\u4E0D\u4F7F\u7528" : "\u77E5\u9053\u4E86",
        40,
        y + 263,
        w - 80,
        44,
        () => this.closeTool()
      );
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
      const accessible = faceVisible(g.board, view);
      const visible = turning ? /* @__PURE__ */ new Set() : new Set(accessible);
      if (g.phase === "resolving") {
        const oldBoard = g.state.history.at(-1);
        if (oldBoard)
          for (const old of oldBoard.tubes) {
            if (old.balls.length && !g.board.tubes.find((t) => t.id === old.id)?.balls.length && faceVisible(oldBoard, view).has(old.id))
              visible.add(old.id);
          }
      }
      this.capStates = [];
      this.hiddenSurfaces = [];
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
      const ordered = g.board.tubes.filter(
        (t) => t.balls.length || g.phase === "resolving" && g.state.history.at(-1)?.tubes.find((old) => old.id === t.id)?.balls.length
      ).map((t) => ({ t, ...point(t) })).sort((a, b) => b.depth - a.depth);
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
        frontY: Math.max(...corners.map((p2) => p2.y)) + padding * ratio + 24,
        axis: { ...axis },
        thickness: 23
      };
      const dishX = layout.trayCurve.x;
      const dishY = layout.traySurfaceY;
      const dishRx = layout.trayCurve.rx;
      const dishRy = layout.traySurfaceRy;
      const dishLeft = dishX - dishRx, dishRight = dishX + dishRx;
      const dishBack = dishY - dishRy, dishFront = dishY + dishRy;
      this.decorativeTray.frontY = dishFront + 24;
      const oval = (yy, rx, ry, fill) => {
        c.beginPath();
        c.ellipse(dishX, yy, rx, ry, 0, 0, Math.PI * 2);
        c.fillStyle = fill;
        c.fill();
      };
      if (this.turntable) {
        const sx = dishRx / 380;
        const sy = dishRy / 84;
        const artworkX = dishX - 400 * sx;
        const artworkY = dishY - 94 * sy;
        c.save();
        try {
          c.translate(artworkX, artworkY);
          c.scale(sx, sy);
          const lipY = 94, lipRx = 399, lipRy = 94, wall = 65;
          c.beginPath();
          c.moveTo(400 - lipRx, lipY);
          c.ellipse(400, lipY, lipRx, lipRy, 0, Math.PI, 0, true);
          c.lineTo(400 + lipRx, lipY + wall);
          c.ellipse(400, lipY + wall, lipRx, lipRy, 0, 0, Math.PI);
          c.closePath();
          const fascia = c.createLinearGradient(0, 0, 800, 0);
          fascia.addColorStop(0, "#d53e26");
          fascia.addColorStop(0.2, "#ff8562");
          fascia.addColorStop(0.5, "#f56a49");
          fascia.addColorStop(0.8, "#f46a4b");
          fascia.addColorStop(1, "#c83b25");
          c.fillStyle = fascia;
          c.fill();
          c.lineWidth = 3;
          c.strokeStyle = "#a7432b";
          c.stroke();
          c.save();
          try {
            c.beginPath();
            c.ellipse(400, lipY, lipRx, lipRy, 0, 0, Math.PI * 2);
            c.clip();
            c.drawImage(this.turntable, 0, 0, 800, 261);
          } finally {
            c.restore();
          }
          c.beginPath();
          c.ellipse(400, lipY, lipRx - 2, lipRy, 0, 0, Math.PI);
          c.strokeStyle = "#fff7d8";
          c.lineWidth = 4;
          c.stroke();
          for (const direction of [-1, 1]) {
            c.save();
            try {
              c.translate(400 + direction * 210, 209);
              c.scale(direction, 1);
              c.beginPath();
              c.moveTo(-63, 8);
              c.bezierCurveTo(-22, 13, 12, 3, 36, -9);
              c.lineTo(27, -20);
              c.quadraticCurveTo(26, -27, 34, -24);
              c.lineTo(69, -10);
              c.quadraticCurveTo(76, -6, 70, 1);
              c.lineTo(45, 26);
              c.quadraticCurveTo(39, 32, 36, 24);
              c.lineTo(33, 16);
              c.bezierCurveTo(5, 29, -32, 34, -65, 29);
              c.quadraticCurveTo(-77, 26, -73, 16);
              c.quadraticCurveTo(-71, 8, -63, 8);
              c.closePath();
              c.lineJoin = "round";
              c.strokeStyle = "#a9473030";
              c.lineWidth = 11;
              c.stroke();
              c.strokeStyle = "#fffdf4";
              c.lineWidth = 8;
              c.stroke();
              c.fillStyle = "#ff7351";
              c.fill();
            } finally {
              c.restore();
            }
          }
          c.save();
          try {
            this.rect(364, 183, 72, 76, "#c88a2b", 16);
            c.clip();
            c.drawImage(this.turntable, 360, 180, 80, 81, 360, 180, 80, 81);
          } finally {
            c.restore();
          }
        } finally {
          c.restore();
        }
        this.decorativeTray.frontY = artworkY + 259 * sy;
        this.decorativeTray.thickness = 65 * sy;
      } else {
        oval(dishY + 30, dishRx + 3, dishRy + 2, "#85503538");
        oval(dishY + 24, dishRx, dishRy, "#9a452c");
        const side = c.createLinearGradient(dishLeft, 0, dishRight, 0);
        side.addColorStop(0, "#f88c62");
        side.addColorStop(0.3, "#ffb17f");
        side.addColorStop(0.6, "#ff7352");
        side.addColorStop(1, "#bf4d31");
        c.fillStyle = side;
        c.fillRect(dishLeft, dishY, dishRx * 2, 22);
        oval(dishY + 21, dishRx - 1, dishRy, side);
        oval(dishY, dishRx, dishRy, "#a95031");
        oval(dishY - 1, dishRx - 2, Math.max(4, dishRy - 1), "#fff5ca");
        oval(dishY - 1, dishRx - 7, Math.max(3, dishRy - 5), "#ffce89");
        oval(dishY - 2, dishRx - 10, Math.max(2, dishRy - 7), "#ffe8b1");
      }
      const opening = Math.min(
        9,
        Math.max(4, radius * layout.zScale / layout.lane)
      );
      c.fillStyle = "#86634b20";
      for (const item of ordered) {
        c.beginPath();
        c.ellipse(
          item.x + radius * 0.15,
          item.y + 1,
          radius * 0.95,
          opening * 0.5,
          0.18,
          0,
          Math.PI * 2
        );
        c.fill();
      }
      const muralPoints = g.board.tubes.map(point);
      const maxCapacity = Math.max(...g.board.tubes.map((t) => t.capacity));
      const muralLeft = Math.min(...muralPoints.map((p2) => p2.x - radius));
      const muralRight = Math.max(...muralPoints.map((p2) => p2.x + radius));
      const muralTop = Math.min(
        ...muralPoints.map((p2) => p2.y - 6 - Math.max(0, maxCapacity - 3) * step)
      );
      const muralBottom = Math.max(...muralPoints.map((p2) => p2.y + radius * 0.3));
      for (const item of ordered) {
        const { t, x, y } = item;
        const previous = g.phase === "resolving" ? g.state.history.at(-1)?.tubes.find((old) => old.id === t.id) : void 0;
        const visibleCountBase = previous && previous.balls.length > t.balls.length ? previous.balls.length : t.balls.length;
        const height = t.capacity * step + 20, ty = y - height, front = visible.has(t.id) || g.phase === "resolving" && !t.balls.length && !!previous && faceVisible(g.state.history.at(-1), view).has(t.id);
        const capped = !accessible.has(t.id) && !visible.has(t.id);
        this.capStates.push({ id: t.id, closed: capped, x, y: ty });
        if (!front) {
          if (!this.tubeGlass) {
            const rear = c.createLinearGradient(x - radius, ty, x + radius, y);
            rear.addColorStop(0, "#c8b9a9");
            rear.addColorStop(0.13, "#fff7e9");
            rear.addColorStop(0.32, "#f7ecdd");
            rear.addColorStop(0.7, "#edddca");
            rear.addColorStop(1, "#c1ac99");
            this.chamberPath(x, ty, y, radius);
            c.fillStyle = rear;
            c.fill();
            c.strokeStyle = "#ab8b6b55";
            c.lineWidth = 1;
            c.stroke();
            c.beginPath();
            c.ellipse(x, ty - 1, radius * 0.98, opening, 0, 0, Math.PI * 2);
            c.fillStyle = "#fff8ed";
            c.fill();
            c.beginPath();
            c.ellipse(
              x,
              ty - 1,
              radius * 0.79,
              opening * 0.55,
              0,
              0,
              Math.PI * 2
            );
            c.fillStyle = "#e9d4bc";
            c.fill();
            c.beginPath();
            c.ellipse(x, y - 1, radius * 0.9, opening * 0.6, 0, 0, Math.PI * 2);
            c.fillStyle = "#d8bd9c44";
            c.fill();
            c.strokeStyle = "#fffaf5cc";
            c.lineWidth = 0.8;
            c.beginPath();
            c.moveTo(x - radius * 0.79, ty + 12);
            c.quadraticCurveTo(
              x - radius * 0.88,
              ty + height * 0.55,
              x - radius * 0.7,
              y - 10
            );
            c.stroke();
            if (capped) {
              const palette = ["#fff8ee", "#eadaca", "#bca38e"];
              const lidSide = c.createLinearGradient(
                x - radius,
                ty - 5,
                x + radius,
                ty + 6
              );
              lidSide.addColorStop(0, palette[1]);
              lidSide.addColorStop(0.3, palette[0]);
              lidSide.addColorStop(1, palette[2]);
              c.fillStyle = "#29483935";
              c.beginPath();
              c.ellipse(
                x + radius * 0.12,
                ty + 7,
                radius * 1.03,
                opening * 0.9,
                0,
                0,
                Math.PI * 2
              );
              c.fill();
              c.fillStyle = lidSide;
              c.fillRect(x - radius * 0.99, ty - 7, radius * 1.98, 9);
              c.beginPath();
              c.ellipse(x, ty + 2, radius * 0.99, opening, 0, 0, Math.PI * 2);
              c.fill();
              const lidTop = c.createLinearGradient(
                x - radius,
                ty - opening - 7,
                x + radius,
                ty + opening - 7
              );
              lidTop.addColorStop(0, "#fff7e9");
              lidTop.addColorStop(0.45, palette[0]);
              lidTop.addColorStop(1, palette[1]);
              c.fillStyle = lidTop;
              c.beginPath();
              c.ellipse(x, ty - 7, radius * 1.02, opening, 0, 0, Math.PI * 2);
              c.fill();
              c.strokeStyle = "#fff6d9b0";
              c.lineWidth = 0.8;
              c.beginPath();
              c.ellipse(
                x,
                ty - 8,
                radius * 0.87,
                opening * 0.6,
                0,
                Math.PI,
                Math.PI * 1.95
              );
              c.stroke();
              c.strokeStyle = "#a4835050";
              c.lineWidth = 0.7;
              c.beginPath();
              c.ellipse(
                x,
                ty - 7,
                radius * 0.55,
                opening * 0.38,
                0,
                0,
                Math.PI * 2
              );
              c.stroke();
            }
          } else {
            c.save();
            try {
              this.chamberPath(x, ty, y, radius * 0.9);
              c.clip();
              this.transmittedBackdrop(
                x - radius * 0.9,
                ty,
                radius * 1.8,
                height + 3
              );
              const core = c.createLinearGradient(x - radius, 0, x + radius, 0);
              core.addColorStop(0, "#b8ab9830");
              core.addColorStop(0.35, "#fff9ef24");
              core.addColorStop(0.7, "#ffeed610");
              core.addColorStop(1, "#b5a38b26");
              c.fillStyle = core;
              c.fillRect(x - radius, ty, radius * 2, height + 3);
            } finally {
              c.restore();
            }
            this.glassWall(
              x,
              ty,
              y,
              radius,
              Math.max(
                0.15,
                Math.min(1, faceCoordinates(t, n, view).depth / (n - 1))
              )
            );
          }
          this.rearOpenings.push({
            id: t.id,
            x,
            y: ty - 1,
            rx: radius * 0.98,
            ry: opening
          });
          for (let i = 0; i < t.balls.length; i++)
            this.ghostPositions.push({
              id: t.balls[i].id,
              tube: t.id,
              slot: i,
              x,
              y: y - ballRadius - 6 - i * step,
              r: ballRadius
            });
          this.bodies.push({
            id: t.id,
            x: x - radius,
            y: ty - opening,
            w: radius * 2,
            h: height + opening,
            topY: y - ballRadius - 6 - (t.balls.length - 1) * step
          });
          continue;
        }
        if (!this.tubeGlass) {
          c.save();
          try {
            this.chamberPath(x, ty, y, radius);
            c.clip();
            this.transmittedBackdrop(x - radius, ty, radius * 2, height);
            const glass = c.createLinearGradient(x - radius, 0, x + radius, 0);
            glass.addColorStop(0, "#b89e8866");
            glass.addColorStop(0.09, "#ffffeed0");
            glass.addColorStop(0.19, "#fff4ed20");
            glass.addColorStop(0.65, "#ffffff08");
            glass.addColorStop(0.85, "#ecd7bf22");
            glass.addColorStop(1, "#b3977d66");
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
          c.strokeStyle = "#b08e7188";
          c.lineWidth = 1;
          this.chamberPath(x, ty, y, radius);
          c.stroke();
          c.beginPath();
          c.ellipse(x, ty - 1, radius * 0.98, opening, 0, 0, Math.PI * 2);
          c.fillStyle = "#fffaf2b0";
          c.fill();
          c.strokeStyle = "#b49b8490";
          c.lineWidth = 1;
          c.stroke();
          c.beginPath();
          c.ellipse(x, ty - 1, radius * 0.87, opening * 0.65, 0, 0, Math.PI * 2);
          c.fillStyle = "#e4ccb650";
          c.fill();
          c.beginPath();
          c.ellipse(
            x - radius * 0.02,
            ty - 2,
            radius * 0.94,
            opening * 0.88,
            0,
            Math.PI,
            Math.PI * 1.95
          );
          c.strokeStyle = "#ffffffed";
          c.lineWidth = 1.7;
          c.stroke();
          const foot = c.createLinearGradient(
            x - radius,
            y - 7,
            x + radius,
            y + 4
          );
          foot.addColorStop(0, "#f7ffffc9");
          foot.addColorStop(0.35, "#f0dcc177");
          foot.addColorStop(1, "#bca08688");
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
        }
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
            if (i > first && g.phase !== "intro") {
              const lowerY = by + step;
              c.save();
              c.beginPath();
              c.arc(x, lowerY, ballRadius * 0.98, 0, Math.PI * 2);
              c.clip();
              const shadowTop = lowerY - ballRadius;
              const shadow = c.createLinearGradient(
                0,
                shadowTop,
                0,
                shadowTop + ballRadius * 0.37
              );
              shadow.addColorStop(0, "#35243a65");
              shadow.addColorStop(0.36, "#35243a38");
              shadow.addColorStop(1, "#35243a00");
              c.fillStyle = shadow;
              c.beginPath();
              c.ellipse(
                x + ballRadius * 0.07,
                shadowTop + ballRadius * 0.05,
                ballRadius * 0.67,
                ballRadius * 0.32,
                0,
                0,
                Math.PI * 2
              );
              c.fill();
              c.restore();
            }
          } else {
            this.ghostPositions.push(position);
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
        if (first > 0) {
          const frostTop = y - 6 - first * step;
          c.save();
          try {
            c.beginPath();
            c.moveTo(x - radius, ty);
            c.lineTo(x + radius, ty);
            c.lineTo(x + radius, y - 2);
            c.ellipse(x, y - 2, radius, radius * 0.3, 0, 0, Math.PI);
            c.closePath();
            c.clip();
            const inner = radius * 0.9;
            const rimRy = inner * 0.3;
            const capY = frostTop;
            const baseY = y - 4 - inner * 0.13;
            c.beginPath();
            c.rect(
              x - radius,
              frostTop,
              radius * 2,
              y - frostTop + radius * 0.3 + 3
            );
            c.clip();
            c.beginPath();
            c.moveTo(x - inner, capY);
            c.ellipse(x, capY, inner, rimRy, 0, Math.PI, 0, true);
            c.lineTo(x + inner, baseY);
            c.ellipse(x, baseY, inner, inner * 0.43, 0, 0, Math.PI);
            c.closePath();
            const side = c.createLinearGradient(x - inner, 0, x + inner, 0);
            const palette = this.hiddenStyle === "mint" || this.hiddenStyle === "garden" ? ["#72aa9b", "#a6d8c6", "#b9e6d7", "#a5d6c4", "#77aa9b"] : this.hiddenStyle === "sky" || this.hiddenStyle === "space" ? ["#819eb9", "#bad3e7", "#d0e5f3", "#bbd3e7", "#819eb9"] : this.hiddenStyle === "rose" || this.hiddenStyle === "doodle" ? ["#bd9299", "#e5bfc5", "#f4d6d9", "#e6c0c7", "#bd9299"] : ["#b3adbf", "#ccc6d5", "#d6d1de", "#cdc7d6", "#b7b0c2"];
            [0, 0.16, 0.42, 0.75, 1].forEach(
              (stop, i) => side.addColorStop(stop, palette[i])
            );
            c.fillStyle = side;
            c.fill();
            if (this.hiddenStyle !== "current") {
              c.save();
              c.clip();
              c.strokeStyle = "#ffffff55";
              c.fillStyle = "#ffffff65";
              c.lineWidth = Math.max(0.6, radius * 0.035);
              if (["doodle", "space", "garden"].includes(this.hiddenStyle)) {
                let row = 0;
                for (let yy = capY + radius * 0.65; yy < baseY - radius * 0.15; yy += radius * 0.9, row++) {
                  const xx = x + inner * (row % 2 ? 0.3 : -0.26);
                  c.save();
                  c.translate(xx, yy);
                  c.scale(0.85, 1);
                  const z = radius * 0.27;
                  c.lineWidth = Math.max(0.8, radius * 0.045);
                  if (this.hiddenStyle === "space") {
                    c.fillStyle = row % 2 ? "#fff7d9" : "#ffe2a0";
                    c.strokeStyle = "#7d95b5";
                    c.beginPath();
                    for (let k = 0; k < 10; k++) {
                      const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? z * 0.45 : z;
                      if (k === 0) c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
                      else c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
                    }
                    c.closePath();
                    c.fill();
                    c.stroke();
                    c.beginPath();
                    c.arc(z * 1.6, -z * 0.8, z * 0.15, 0, Math.PI * 2);
                    c.fill();
                  } else if (this.hiddenStyle === "garden") {
                    c.strokeStyle = "#689e85";
                    c.fillStyle = "#fff7e7";
                    for (let k = 0; k < 5; k++) {
                      const a = k * Math.PI * 2 / 5;
                      c.beginPath();
                      c.ellipse(
                        Math.cos(a) * z * 0.55,
                        Math.sin(a) * z * 0.55,
                        z * 0.45,
                        z * 0.35,
                        a,
                        0,
                        Math.PI * 2
                      );
                      c.fill();
                    }
                    c.fillStyle = "#eec35c";
                    c.beginPath();
                    c.arc(0, 0, z * 0.3, 0, Math.PI * 2);
                    c.fill();
                    c.fillStyle = "#6da78d";
                    c.beginPath();
                    c.ellipse(
                      z * 1.3,
                      z * 0.8,
                      z * 0.5,
                      z * 0.21,
                      -0.55,
                      0,
                      Math.PI * 2
                    );
                    c.fill();
                  } else {
                    c.strokeStyle = "#aa6f87";
                    c.fillStyle = "#fff7e9";
                    c.beginPath();
                    c.arc(0, 0, z, 0, Math.PI * 2);
                    c.fill();
                    c.stroke();
                    c.fillStyle = "#986278";
                    for (const eye of [-0.32, 0.32]) {
                      c.beginPath();
                      c.arc(z * eye, -z * 0.15, z * 0.085, 0, Math.PI * 2);
                      c.fill();
                    }
                    c.beginPath();
                    c.arc(0, z * 0.05, z * 0.42, 0.1, Math.PI - 0.1);
                    c.stroke();
                    c.beginPath();
                    c.moveTo(z * 1.3, -z);
                    c.lineTo(z * 1.65, -z * 0.4);
                    c.lineTo(z * 1.2, z * 0.05);
                    c.stroke();
                  }
                  c.restore();
                }
              } else if (this.hiddenStyle === "mint") {
                for (let yy = capY + radius * 0.6; yy < baseY; yy += radius * 0.65) {
                  for (const xx of [-0.4, 0.3]) {
                    c.beginPath();
                    c.arc(x + inner * xx, yy, radius * 0.055, 0, Math.PI * 2);
                    c.fill();
                  }
                }
              } else if (this.hiddenStyle === "sky") {
                for (let yy = capY + radius * 0.65; yy < baseY; yy += radius * 0.7) {
                  c.beginPath();
                  c.moveTo(x - inner, yy);
                  c.bezierCurveTo(
                    x - inner * 0.4,
                    yy + radius * 0.2,
                    x + inner * 0.4,
                    yy + radius * 0.2,
                    x + inner,
                    yy
                  );
                  c.stroke();
                }
              } else {
                for (let yy = capY - radius; yy < baseY + radius; yy += radius * 0.85) {
                  c.beginPath();
                  c.moveTo(x - inner, yy);
                  c.lineTo(x + inner, yy + radius * 0.8);
                  c.lineWidth = radius * 0.17;
                  c.stroke();
                }
              }
              c.restore();
            }
            if (this.hiddenArtwork) {
              c.save();
              try {
                c.clip();
                this.paintHiddenArtwork(
                  c,
                  x,
                  capY,
                  baseY,
                  inner,
                  muralLeft,
                  muralRight,
                  muralTop,
                  muralBottom
                );
              } finally {
                c.restore();
              }
            }
            c.save();
            c.clip();
            const sleeveReflection = c.createLinearGradient(0, capY, 0, baseY);
            sleeveReflection.addColorStop(0, "#ffffffff");
            sleeveReflection.addColorStop(0.22, "#ffffffe8");
            sleeveReflection.addColorStop(0.55, "#ffffff80");
            sleeveReflection.addColorStop(1, "#ffffff18");
            const highlightX = x - inner * 0.64;
            c.beginPath();
            c.moveTo(highlightX - inner * 0.09, capY);
            c.lineTo(highlightX + inner * 0.09, capY);
            c.lineTo(highlightX + inner * 0.05, baseY);
            c.lineTo(highlightX - inner * 0.05, baseY);
            c.closePath();
            c.fillStyle = sleeveReflection;
            c.fill();
            c.beginPath();
            c.moveTo(x - inner * 0.8, capY + rimRy * 0.25);
            c.lineTo(x - inner * 0.8, baseY);
            c.strokeStyle = sleeveReflection;
            c.lineWidth = Math.max(0.45, radius * 0.025);
            c.stroke();
            c.restore();
            c.lineWidth = 0.65;
            c.strokeStyle = "#edf7ffd0";
            c.beginPath();
            c.ellipse(x, capY + 0.5, inner - 0.3, rimRy, 0, 0, Math.PI);
            c.stroke();
            this.hiddenSurfaces.push({
              id: t.id,
              top: frostTop,
              center: capY,
              rx: inner,
              ry: rimRy,
              bottom: baseY
            });
          } finally {
            c.restore();
          }
        }
        if (this.tubeGlass) this.glassWall(x, ty, y, radius);
        else {
          c.strokeStyle = "#ffffffdd";
          c.lineWidth = Math.max(1, radius * 0.07);
          c.beginPath();
          c.ellipse(
            x,
            ty,
            radius * 0.88,
            radius * 0.22,
            0,
            Math.PI * 1.05,
            Math.PI * 1.75
          );
          c.stroke();
        }
        const topY = y - ballRadius - 6 - (t.balls.length - 1) * step;
        this.bodies.push({
          id: t.id,
          x: x - radius,
          y: ty - opening,
          w: radius * 2,
          h: height + opening,
          topY
        });
        if (!front || !t.balls.length) continue;
        const hitRadius = Math.max(ballRadius + 5, 22 / this.displayScale);
        if (g.hint === t.id)
          this.text(
            "\u2726",
            x + ballRadius * 0.65,
            topY - ballRadius * 0.65,
            13,
            "#3849b2",
            "center"
          );
        this.targets.push({
          id: t.id,
          x,
          y: topY,
          r: hitRadius,
          visualRadius: ballRadius
        });
      }
      const markY = dishFront + 10;
      for (const direction of this.turntable ? [] : [-1, 1]) {
        c.save();
        try {
          c.translate(dishX + direction * dishRx * 0.47, markY);
          c.scale(direction, 1);
          c.beginPath();
          c.moveTo(-25, 1);
          c.quadraticCurveTo(-7, 8, 15, -1);
          c.lineTo(9, -7);
          c.lineTo(30, -4);
          c.lineTo(23, 10);
          c.lineTo(19, 4);
          c.quadraticCurveTo(-6, 14, -27, 7);
          c.closePath();
          c.lineJoin = "round";
          c.strokeStyle = "#fffdf0";
          c.lineWidth = 6;
          c.stroke();
          c.fillStyle = "#ff6b4d";
          c.fill();
        } finally {
          c.restore();
        }
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
            sy + (this.trayTop + 21 - sy) * a,
            ballRadius
          );
        }
      }
    }
    homeTitle() {
      const c = this.ctx, scale = Math.min(1, (this.width - 32) / 342);
      const cycle = this.mascotTime % 9e3;
      const t = Math.max(0, Math.min(1, (cycle - 1800) / 1600));
      this.titleAngle = cycle >= 1800 && cycle < 3400 ? t * t * (3 - 2 * t) * Math.PI * 2 : 0;
      if (this.homeLogo) {
        const width = Math.min(this.width - 26, 420, this.height * 0.5);
        c.drawImage(
          this.homeLogo,
          (this.width - width) / 2,
          70,
          width,
          width * 0.5
        );
        return;
      }
      const zhuan = [
        [
          [0, 12],
          [16, 10, 34, 12]
        ],
        [
          [18, 0],
          [10, 20, 6, 34],
          [20, 36, 34, 34]
        ],
        [
          [0, 58],
          [17, 56, 35, 58]
        ],
        [
          [19, 28],
          [20, 53, 19, 78]
        ],
        [
          [53, 12],
          [73, 10, 93, 12]
        ],
        [
          [51, 35],
          [72, 33, 96, 35]
        ],
        [
          [74, 0],
          [68, 29, 59, 55],
          [75, 57, 94, 55],
          [89, 61, 82, 66]
        ],
        [
          [63, 70],
          [69, 75, 76, 78]
        ]
      ];
      const ge = [
        [
          [31, 4],
          [23, 22, 1, 33]
        ],
        [
          [31, 4],
          [43, 22, 64, 33]
        ],
        [
          [31, 37],
          [31, 55, 31, 72]
        ]
      ];
      const qiu = [
        [
          [5, 14],
          [14, 8, 24, 10]
        ],
        [
          [0, 39],
          [12, 36, 24, 38]
        ],
        [
          [5, 63],
          [15, 71, 25, 66]
        ],
        [
          [15, 12],
          [8, 39, 16, 65]
        ],
        [
          [43, 18],
          [65, 10, 87, 18]
        ],
        [
          [63, 0],
          [68, 39, 64, 74],
          [61, 81, 54, 77]
        ],
        [
          [85, -2],
          [89, 1]
        ],
        [
          [45, 31],
          [49, 36]
        ],
        [
          [51, 49],
          [48, 56, 42, 62]
        ],
        [
          [91, 32],
          [87, 39, 79, 43]
        ],
        [
          [68, 47],
          [79, 54, 92, 64],
          [88, 72, 82, 76]
        ]
      ];
      const paint = (paths, width, color, dy = 0, yaw = false, depth = 0) => {
        c.strokeStyle = color;
        c.lineWidth = width;
        c.lineCap = "round";
        c.lineJoin = "round";
        const point = (x, y) => {
          if (!yaw) return [x, y + dy];
          const xx = x - 31, yy = y - 26, z = -xx * Math.sin(this.titleAngle) + depth * Math.cos(this.titleAngle);
          const perspective = 1 + z / 220;
          return [
            31 + (xx * Math.cos(this.titleAngle) + depth * Math.sin(this.titleAngle)) / perspective,
            26 + yy / perspective + dy
          ];
        };
        for (const path of paths) {
          c.beginPath();
          const start2 = point(path[0][0], path[0][1]);
          c.moveTo(start2[0], start2[1]);
          for (const v of path.slice(1)) {
            if (v.length === 2) {
              const p = point(v[0], v[1]);
              c.lineTo(p[0], p[1]);
            } else {
              const a = point(v[0], v[1]), b = point(v[2], v[3]);
              c.quadraticCurveTo(a[0], a[1], b[0], b[1]);
            }
          }
          c.stroke();
        }
      };
      c.save();
      try {
        c.translate(this.width / 2 - 159 * scale, 94 + this.homeGroupOffset);
        c.scale(scale, scale);
        const jelly = (light, base) => {
          const gradient = c.createLinearGradient(0, 0, 0, 82);
          gradient.addColorStop(0, light);
          gradient.addColorStop(1, base);
          return gradient;
        };
        paint(zhuan, 25, "#244a6340", 3);
        paint(zhuan, 24, "#fffbee");
        paint(zhuan, 21, "#60301f");
        paint(zhuan, 13, jelly("#ffaaa7", "#fa605e"));
        paint(
          [
            [
              [3, 10],
              [17, 8, 30, 10]
            ],
            [
              [56, 10],
              [73, 8, 89, 10]
            ]
          ],
          1.8,
          "#fff5ee"
        );
        c.save();
        try {
          c.translate(124, 4);
          for (let depth = -2; depth <= -1; depth++)
            paint(ge, 24, "#244a6340", 2, true, depth);
          paint(ge, 28, "#fffbee", 0, true, 0);
          paint(ge, 25, "#60301f", 0, true, 0);
          paint(ge, 17, jelly("#d7ff69", "#8bcf09"), 0, true, 0);
          paint(
            [
              [
                [29, 9],
                [21, 22, 9, 28]
              ],
              [
                [29, 43],
                [29, 56, 29, 65]
              ]
            ],
            1.7,
            "#fffbed",
            0,
            true,
            0.6
          );
        } finally {
          c.restore();
        }
        c.save();
        try {
          c.translate(224, 0);
          paint(qiu, 21.5, "#244a6340", 3);
          paint(qiu, 20.5, "#fffbee");
          paint(qiu, 17.5, "#60301f");
          paint(qiu, 11, jelly("#fff378", "#ffc50d"));
          paint(
            [
              [
                [7, 12],
                [15, 8, 21, 9]
              ],
              [
                [46, 16],
                [65, 10, 83, 16]
              ]
            ],
            1.5,
            "#fffbed"
          );
        } finally {
          c.restore();
        }
      } finally {
        c.restore();
      }
    }
    /** Original miniature toys, no emoji/font or external artwork dependence. */
    trackToy(kind, x, y, size) {
      const c = this.ctx;
      c.save();
      try {
        c.translate(x, y);
        c.scale(size / 18, size / 18);
        const ellipse = (x2, y2, rx, ry, fill) => {
          c.fillStyle = fill;
          c.beginPath();
          c.ellipse(x2, y2, rx, ry, 0, 0, Math.PI * 2);
          c.fill();
        };
        const line = (points, color, width) => {
          c.strokeStyle = color;
          c.lineWidth = width;
          c.lineCap = "round";
          c.lineJoin = "round";
          c.beginPath();
          c.moveTo(points[0][0], points[0][1]);
          for (const p of points.slice(1)) c.lineTo(p[0], p[1]);
          c.stroke();
        };
        ellipse(2, 12, 18, 3, "#354c3430");
        if (kind === 0) {
          line(
            [
              [-13, 0],
              [-21, -2],
              [-21, -8]
            ],
            "#b58c50",
            3
          );
          ellipse(-21, -8, 4, 3, "#f8d783");
          ellipse(-2, 1, 15, 11, "#e8a82a");
          ellipse(-4, -2, 12, 9, "#ffdd61");
          ellipse(8, -10, 9, 9, "#ffe47a");
          ellipse(16, -8, 7, 3, "#ed7830");
          ellipse(10, -12, 1.8, 2, "#283f3b");
          ellipse(8, -14, 0.8, 0.8, "white");
          ellipse(-5, 1, 8, 5, "#f4bf3e");
          line(
            [
              [-10, -2],
              [-4, -4],
              [1, -1]
            ],
            "#fff0a4",
            1.4
          );
        } else if (kind === 1) {
          this.rect(-20, -6, 35, 16, "#dd6052", 4);
          this.rect(-15, -18, 15, 17, "#268f94", 3);
          this.rect(-12, -15, 9, 9, "#bceff0", 2);
          this.rect(-18, -21, 21, 4, "#f2c665", 2);
          this.rect(7, -15, 5, 10, "#395d66", 1);
          ellipse(9, -16, 4, 2, "#efc470");
          this.rect(1, -5, 16, 3, "#ffbd87", 1);
          for (const dx of [-12, 10]) {
            ellipse(dx, 10, 6, 6, "#344c59");
            ellipse(dx, 10, 3, 3, "#f1cf77");
          }
          line(
            [
              [-12, 10],
              [10, 10]
            ],
            "#9fb4ad",
            2
          );
        } else if (kind === 2) {
          ellipse(0, 7, 20, 6, "#72b895");
          ellipse(14, 0, 5, 9, "#9ed9ad");
          line(
            [
              [12, -3],
              [10, -12]
            ],
            "#65a881",
            2
          );
          line(
            [
              [17, -3],
              [20, -11]
            ],
            "#65a881",
            2
          );
          ellipse(10, -12, 3, 3, "#e8f7cf");
          ellipse(20, -11, 3, 3, "#e8f7cf");
          ellipse(11, -12, 1.3, 1.5, "#2c5350");
          ellipse(21, -11, 1.3, 1.5, "#2c5350");
          ellipse(-6, -2, 13, 13, "#b45d8e");
          ellipse(-8, -5, 11, 10, "#ed9fbf");
          c.strokeStyle = "#a75383";
          c.lineWidth = 2;
          c.beginPath();
          for (let a = 0; a < Math.PI * 4; a += 0.15) {
            const r = 1 + a * 0.65;
            const xx = -7 + Math.cos(a) * r, yy = -3 + Math.sin(a) * r;
            if (a === 0) c.moveTo(xx, yy);
            else c.lineTo(xx, yy);
          }
          c.stroke();
          ellipse(-11, -10, 3, 2, "#ffe3df");
          line(
            [
              [15, 3],
              [18, 4],
              [20, 2]
            ],
            "#46876b",
            1
          );
        } else if (kind === 3) {
          ellipse(-1, 0, 21, 6, "#ed8351");
          ellipse(-3, -2, 15, 4, "#ffb76a");
          line(
            [
              [-4, -11],
              [3, 11]
            ],
            "#f6cf70",
            8
          );
          ellipse(2, -4, 5, 4, "#5eabb5");
          ellipse(1, -5, 3, 2, "#b8eef1");
          line(
            [
              [-16, -2],
              [-21, -9]
            ],
            "#e4684f",
            5
          );
          line(
            [
              [21, -9],
              [21, 9]
            ],
            "#526c6d",
            2
          );
          ellipse(20, 0, 3, 3, "#ffe1a4");
        } else {
          ellipse(-6, -19, 4, 11, "#ede0ce");
          ellipse(5, -20, 4, 11, "#f8eddb");
          ellipse(-6, -20, 1.6, 7, "#e7b3b3");
          ellipse(5, -21, 1.6, 7, "#e7b3b3");
          ellipse(0, -4, 12, 11, "#f8eddb");
          ellipse(0, 6, 10, 8, "#e9d9bd");
          ellipse(-4, -5, 1.5, 2, "#4e5055");
          ellipse(5, -5, 1.5, 2, "#4e5055");
          ellipse(1, -1, 2, 1.4, "#d48c96");
          ellipse(-7, -1, 2.5, 1.5, "#efb5b1");
          ellipse(8, -1, 2.5, 1.5, "#efb5b1");
          this.rect(-15, 12, 30, 4, "#64a6b5", 2);
          ellipse(-9, 18, 3, 3, "#4c686b");
          ellipse(9, 18, 3, 3, "#4c686b");
        }
      } finally {
        c.restore();
      }
    }
    closeGuide() {
      this.guideOpen = false;
      if (this.homePanel === "help") this.homePanel = null;
      this.game.acknowledgeGuide();
    }
    guideOverlay() {
      const c = this.ctx, w = this.width, h = this.height, top = Math.max(74, (h - 454) / 2);
      this.buttons = [];
      this.targets = [];
      c.fillStyle = "#173e6599";
      c.fillRect(0, 0, w, h);
      this.rect(17, top, w - 34, 466, "#254e6b", 25);
      this.rect(22, top + 5, w - 44, 454, "#fff9e8", 21);
      this.text("\u600E\u4E48\u73A9", w / 2, top + 43, 25, "#29495e", "center");
      const labels = ["\u53EA\u53D6\u6B63\u9762\u6700\u4E0A\u7403", "\u4E09\u9897\u540C\u8272\uFF0C\u81EA\u52A8\u6D88\u9664", "\u8F6C\u4E00\u9762\uFF0C\u9010\u5C42\u63ED\u5F00"];
      this.text(labels[this.guideStep], w / 2, top + 84, 19, "#29495e", "center");
      const cx = w / 2, cy = top + 175;
      if (this.guideStep === 0) {
        this.rect(cx - 29, cy - 59, 58, 130, "#b8e3df", 18);
        this.rect(cx - 25, cy - 55, 50, 122, "#ecf6ea", 15);
        for (let j = 0; j < 3; j++) this.ball(j, cx, cy - 31 + j * 36, 17);
        this.text("\u2190", cx + 63, cy - 23, 32, "#e4803f", "center");
      } else if (this.guideStep === 1) {
        this.rect(cx - 102, cy - 27, 204, 61, "#c2dddd", 18);
        for (let j = 0; j < 3; j++) this.ball(4, cx + (j - 1) * 58, cy + 3, 23);
        this.text("\u2605", cx, cy + 77, 33, "#e8a931", "center");
      } else {
        for (let i = 0; i < 3; i++) {
          this.rect(
            cx - 64 + i * 43,
            cy - 35 + Math.abs(i - 1) * 10,
            37,
            92,
            "#b4dadd",
            12
          );
          this.ball(i, cx - 46 + i * 43, cy - 13 + Math.abs(i - 1) * 10, 15);
        }
        this.text("\u2190", cx - 96, cy + 16, 29, "#258cae", "center");
        this.text("\u2192", cx + 96, cy + 16, 29, "#258cae", "center");
      }
      const captions = [
        "\u76D6\u7740\u7684\u7BA1\u6682\u65F6\u4E0D\u80FD\u53D6",
        "\u6682\u5B58\u69FD\u53EA\u6709\u4E03\u683C\uFF0C\u7559\u70B9\u7A7A\u4F4D",
        "\u65CB\u8F6C\u514D\u8D39 \xB7 \u64A4\u9500\u4E00\u6B65 \xB7 \u63D0\u793A\u514D\u8D39"
      ];
      this.text(captions[this.guideStep], cx, top + 280, 12, "#587183", "center");
      for (let i = 0; i < 3; i++)
        this.rect(
          cx - 26 + i * 20,
          top + 298,
          12,
          5,
          i === this.guideStep ? "#ecac34" : "#c2d7dc",
          3
        );
      this.button(
        "guide-next",
        this.guideStep === 2 ? "\u6211\u4F1A\u4E86" : "\u4E0B\u4E00\u6B65",
        42,
        top + 327,
        w - 84,
        45,
        () => {
          if (this.guideStep === 2) this.closeGuide();
          else this.guideStep++;
        },
        false,
        true
      );
      this.button(
        "home-dialog-close",
        "\u8FD4\u56DE",
        w / 2 - 38,
        top + 390,
        76,
        28,
        () => this.closeGuide()
      );
    }
    celebration() {
      const c = this.ctx, g = this.game;
      if (this.celebrationSession !== g.state.session) {
        this.celebrationSession = g.state.session;
        this.celebrationMs = 0;
        this.celebrationLast = null;
      }
      try {
        const now = g.now();
        if (this.foreground && this.celebrationLast !== null)
          this.celebrationMs = Math.min(
            2600,
            this.celebrationMs + Math.max(0, Math.min(64, now - this.celebrationLast))
          );
        this.celebrationLast = now;
      } catch {
        this.celebrationLast = null;
      }
      if (this.celebrationMs >= 2600) return;
      c.save();
      try {
        c.globalAlpha = Math.min(1, (2600 - this.celebrationMs) / 600);
        for (let i = 0; i < 32; i++) {
          const t = this.celebrationMs / 1e3, x = (i * 83 + 29) % this.width + Math.sin(t * 3 + i) * 18, y = i * 47 % 220 - 100 + t * (90 + i % 5 * 15);
          c.fillStyle = ["#ffd249", "#f38877", "#69d4d4", "#a997e6"][i % 4];
          c.fillRect(x, y, 4 + i % 3 * 2, 5 + i % 4 * 2);
        }
      } finally {
        c.restore();
      }
    }
    homeDialog() {
      const w = this.width, h = this.height, c = this.ctx;
      this.buttons = [];
      c.fillStyle = "#153c6288";
      c.fillRect(0, 0, w, h);
      if (this.homePanel === "help") {
        this.guideOverlay();
        return;
      }
      this.rect(12, 74, w - 24, h - 122, "#274e6d", 24);
      this.rect(17, 79, w - 34, h - 133, "#fff9e8", 20);
      this.rect(30, 90, w - 60, 40, "#149bcf", 13);
      this.text(
        this.homePanel === "records" ? "\u672C\u673A\u6218\u7EE9" : this.homePanel === "difficulty" ? "\u9009\u62E9\u96BE\u5EA6" : this.homePanel === "replace" ? "\u5F00\u59CB\u65B0\u4E00\u5C40\uFF1F" : "\u600E\u4E48\u73A9",
        w / 2,
        116,
        25,
        "#ffffff",
        "center"
      );
      if (this.homePanel === "difficulty") {
        PRESETS.forEach((p, i) => {
          const y = 176 + i * 88;
          this.button(
            `start-${i}`,
            p.name,
            36,
            y,
            w - 72,
            52,
            () => {
              this.selectedDifficulty = i;
              if (this.game.resume) this.homePanel = "replace";
              else {
                this.homePanel = null;
                this.game.startRandom(i);
              }
            },
            false,
            i === 0
          );
          this.text(
            `${[105, 126, 216][i]}\u9897 \xB7 ${p.types}\u7C7B \xB7 ${roundBaseMs(i) / 6e4}\u5206\u949F`,
            w / 2,
            y + 72,
            12,
            "#617366",
            "center"
          );
        });
      } else if (this.homePanel === "replace") {
        this.text("\u4E0A\u6B21\u8FDB\u5EA6\u5C06\u88AB\u66FF\u6362", w / 2, 190, 16, "#80603e", "center");
        this.text(
          `\u65B0\u5C40\uFF1A${PRESETS[this.selectedDifficulty].name}`,
          w / 2,
          226,
          17,
          "#29495e",
          "center"
        );
        this.button(
          "confirm-new",
          "\u5F00\u59CB\u65B0\u5C40",
          32,
          280,
          w - 64,
          52,
          () => {
            this.homePanel = null;
            this.game.startRandom(this.selectedDifficulty);
          },
          false,
          true
        );
        this.button("keep-saved", "\u7EE7\u7EED\u4E0A\u6B21", 32, 354, w - 64, 44, () => {
          this.homePanel = null;
          this.game.continueSaved();
        });
      } else if (this.homePanel === "records") {
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
          const y = 170 + i * 70, date = new Date(r.endedAt);
          this.rect(26, y, w - 52, 62, "#e6edda", 12);
          this.text(
            `${r.difficulty} \xB7 ${r.outcome === "won" ? "\u901A\u5173" : "\u672A\u901A\u5173"}`,
            38,
            y + 24,
            16,
            "#29495e"
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
            h - 206,
            100,
            36,
            () => this.recordPage--,
            this.recordPage === 0
          );
          this.button(
            "records-next",
            "\u4E0B\u4E00\u9875",
            w - 128,
            h - 206,
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
          "\u7B80\u53552\u5206\u949F \xB7 \u666E\u901A3\u5206\u949F \xB7 \u56F0\u96BE4\u5206\u949F",
          "\u7B80\u5355 105\u9897 / 5\u7C7B / 5\u5C42",
          "\u666E\u901A 126\u9897 / 6\u7C7B / 5\u20137\u5C42",
          "\u56F0\u96BE 216\u9897 / 7\u7C7B / 5\u20137\u5C42"
        ].forEach(
          (t, i) => this.text(t, w / 2, 182 + i * 40, 14, "#29495e", "center")
        );
      }
      this.button(
        "home-dialog-close",
        "\u8FD4\u56DE",
        28,
        this.homePanel === "records" ? h - 140 : Math.min(h - 128, 460),
        w - 56,
        40,
        () => this.homePanel = null
      );
    }
    homeSubtitle() {
      const c = this.ctx;
      const logoWidth = Math.min(this.width - 26, 420, this.height * 0.5);
      const y = this.homeLogo ? 70 + logoWidth * 0.5 + 14 : 211 + this.homeGroupOffset;
      c.save();
      c.font = '900 26px "Arial Rounded MT Bold", "Noto Sans CJK SC", sans-serif';
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.lineJoin = "round";
      const colors = [
        ["#ffd5df", "#fa727e"],
        ["#f6ff9b", "#9edb32"]
      ];
      for (const [i, char] of [..."\u6D88\u9664"].entries()) {
        const x = this.width / 2 + (i - 0.5) * 31;
        c.strokeStyle = "#fffbee";
        c.lineWidth = 7;
        c.strokeText(char, x, y);
        c.strokeStyle = "#60301f";
        c.lineWidth = 4;
        c.strokeText(char, x, y);
        const fill = c.createLinearGradient(0, y - 13, 0, y + 13);
        fill.addColorStop(0, colors[i][0]);
        fill.addColorStop(1, colors[i][1]);
        c.fillStyle = fill;
        c.fillText(char, x, y);
      }
      c.restore();
    }
    home() {
      const w = this.width, h = this.height;
      this.animateHome();
      this.homeTitle();
      this.homeSubtitle();
      this.button("records", "\u6218\u7EE9", 18, 18, 60, 34, () => {
        this.homePanel = "records";
        this.recordPage = 0;
      });
      this.button("help", "\u73A9\u6CD5", 88, 18, 60, 34, () => {
        this.homePanel = "help";
        this.guideStep = 0;
      });
      const c = this.ctx;
      const y = h - (this.game.resume ? 208 : 184);
      if (this.homeHero) {
        const logoBottom = 70 + Math.min(w - 26, 420, h * 0.5) * 0.5;
        const heroHeight = Math.min((w - 16) * 0.8, y - logoBottom - 24);
        const heroWidth = heroHeight / 0.8;
        c.drawImage(
          this.homeHero,
          (w - heroWidth) / 2,
          y - heroHeight - 12,
          heroWidth,
          heroHeight
        );
      } else {
        c.save();
        try {
          c.translate(0, this.homeGroupOffset);
          c.translate(w / 2, 264);
          c.scale(Math.min(1.38, (w - 40) / 188), 1.38);
          c.translate(-w / 2, -264);
          for (const [dy, rx, ry, color] of [
            [19, 114, 27, "#263e2933"],
            [10, 108, 31, "#c75f3f"],
            [0, 108, 31, "#ffdca0"],
            [-2, 99, 25, "#fff0c2"]
          ]) {
            c.beginPath();
            c.ellipse(w / 2, 333 + dy, rx, ry, 0, 0, Math.PI * 2);
            c.fillStyle = color;
            c.fill();
          }
          for (let i = 0; i < 5; i++) {
            const x = w / 2 + (i - 2) * 36, top = 204 + Math.abs(i - 2) * 10, bottom = top + 112;
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
        const mx = w / 2 - 94, my = 375 + this.homeGroupOffset + Math.sin(this.mascotTime / 650) * 5;
        this.ball(0, mx, my, 32);
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
      }
      this.button(
        "start-menu",
        "\u5F00\u59CB\u6E38\u620F",
        28,
        y,
        w - 56,
        this.game.resume ? 66 : 74,
        () => {
          this.homePanel = "difficulty";
        },
        false,
        true
      );
      if (this.game.resume)
        this.button(
          "resume",
          "\u7EE7\u7EED\u4E0A\u6B21",
          28,
          y + 78,
          w - 56,
          40,
          () => this.game.continueSaved()
        );
      this.trackObjects = [];
      c.save();
      try {
        c.beginPath();
        const compactTrack = !!this.game.resume && h < 720;
        c.rect(0, h - (compactTrack ? 96 : 112), w, compactTrack ? 90 : 106);
        c.clip();
        if (this.homeHero) {
          for (const lane of [0, 1]) {
            c.beginPath();
            c.moveTo(-25, h - 90 + lane * 49);
            c.bezierCurveTo(
              w * 0.24,
              h + 10 + lane * 20,
              w * 0.68,
              h - 38 + lane * 40,
              w + 25,
              h - 65 + lane * 45
            );
            c.strokeStyle = "#c88037";
            c.lineWidth = 28;
            c.stroke();
            c.strokeStyle = "#fff1c3";
            c.lineWidth = 23;
            c.stroke();
            c.strokeStyle = "#f8c36b";
            c.lineWidth = 13;
            c.stroke();
          }
        }
        const phases = [0.03, 0.23, 0.47, 0.73, 0.53], lanes = [0, 1, 2, 1, 0];
        for (let i = 0; i < phases.length; i++) {
          const speed = [0.027, -0.046, 0.017, -0.046, 0.027][i], sway = [8, 12, 0, -12, -8][i] * Math.sin(this.mascotTime / 2e3 + i), x = ((this.mascotTime * speed + sway + phases[i] * (w + 140)) % (w + 140) + (w + 140)) % (w + 140) - 70, y2 = h - (compactTrack ? [60, 38, 18] : [87, 52, 24])[lanes[i]] - Math.abs(Math.sin(this.mascotTime / 330 + i)) * 5, r = [23, 20, 21, 19, 17][i];
          this.trackObjects.push({ x, y: y2, r });
          c.save();
          try {
            c.translate(x, y2);
            const squash = Math.sin(this.mascotTime / 330 + i) * 0.09;
            c.scale((speed < 0 ? -1 : 1) * (1 + squash), 1 - squash);
            if (this.homeHero) this.ball([2, 1, 4, 0, 3][i], 0, 0, r);
            else this.trackToy(i, 0, 0, r);
          } finally {
            c.restore();
          }
        }
      } finally {
        c.restore();
      }
      if (this.homePanel) {
        this.homeDialog();
        return;
      }
      if (/存档|新局生成失败/.test(this.game.message))
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
      const y = Math.max(142, h * 0.23), cardH = ["expired", "blocked"].includes(g.phase) ? 436 : 368;
      this.ctx.fillStyle = "#163e6488";
      this.ctx.fillRect(0, 120, w, h - 120);
      if (won) this.celebration();
      else {
        this.celebrationMs = 0;
        this.celebrationLast = null;
        this.celebrationSession = "";
      }
      this.rect(20, y + 8, w - 40, cardH, "#233f5a50", 26);
      this.rect(18, y - 2, w - 36, cardH, "#294f70", 26);
      this.rect(22, y + 2, w - 44, cardH - 8, "#fffbed", 22);
      this.rect(w / 2 - 38, y - 30, 76, 64, won ? "#ffce49" : "#a7dce5", 20);
      this.text(
        won ? "\u2605" : g.phase === "paused" ? "\u2161" : "!",
        w / 2,
        y + 16,
        36,
        "#29495e",
        "center"
      );
      const title = g.phase === "result" ? won ? "\u6F02\u4EAE\uFF01\u5168\u6E05\u7A7A" : "\u4E0B\u6B21\u518D\u6311\u6218" : g.phase === "blocked" ? "\u69FD\u4F4D\u6EE1\u4E86" : g.phase === "expired" ? "\u65F6\u95F4\u5230" : g.phase === "ad" ? "\u5E7F\u544A\u52A0\u8F7D\u4E2D" : "\u4F11\u606F\u4E00\u4E0B";
      this.text(title, w / 2, y + 75, 27, "#29495e", "center");
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
        by += 64;
      };
      if (g.phase === "paused") add("continue", "\u7EE7\u7EED\u6E38\u620F", () => g.begin());
      if (g.phase === "blocked")
        add("undo-blocked", "\u64A4\u9500\u4E00\u6B65", () => g.undo(), !g.canUndo);
      if (g.phase === "blocked")
        add("lift-blocked", "\u5BC4\u5B58\u9053\u5177", () => this.openTool(), false);
      if (g.phase === "expired") {
        add(
          "extend",
          g.ads.free ? g.state.extensions >= CONFIG.maxExtensions ? "\u672C\u5C40\u52A0\u65F6\u5DF2\u7528\u5B8C" : `\u514D\u8D39 +30\u79D2\uFF08\u5269${CONFIG.maxExtensions - g.state.extensions}\u6B21\uFF09` : g.ads.available ? "\u770B\u5E7F\u544A +30\u79D2" : g.ads.label,
          () => void g.extend(),
          !g.ads.free && !g.ads.available || g.state.extensions >= CONFIG.maxExtensions
        );
        this.text(g.ads.label, w / 2, y + 151, 11, "#5c7059", "center");
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
      if (this.game.locked || this.game.now() < this.boardInputAfter) return;
      const nearest = [...this.targets].sort(
        (a, b) => Math.hypot(x - a.x, y - a.y) - Math.hypot(x - b.x, y - b.y)
      );
      const direct = nearest.find(
        (t) => Math.hypot(x - t.x, y - t.y) <= t.visualRadius
      );
      const blocked = !direct && [...this.ballPositions, ...this.ghostPositions].some(
        (b) => Math.hypot(x - b.x, y - b.y) <= b.r
      );
      const target = direct ?? (!blocked ? nearest.find((t) => Math.hypot(x - t.x, y - t.y) <= t.r) : void 0);
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

  // src/platform/ads.ts
  var NoAdsService = class {
    constructor() {
      __publicField(this, "free", true);
      __publicField(this, "available", false);
      __publicField(this, "label", "\u514D\u8D39\u8F85\u52A9");
    }
    request() {
      return Promise.resolve("failed");
    }
  };

  // src/browser.ts
  var canvas = document.querySelector("canvas");
  var ctx = canvas.getContext("2d");
  var audio;
  var ads = new NoAdsService();
  var game = new Controller(
    () => performance.now(),
    {
      get: (k) => localStorage.getItem(k),
      set: (k, v) => localStorage.setItem(k, v)
    },
    {
      free: true,
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
  scene.setHiddenArtworkCanvasFactory((width, height) => {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    return c;
  });
  for (const file of [
    "background.png",
    "play-background.png",
    "home-logo.png",
    "home-hero.png",
    "balls-candy.png",
    "turntable.png",
    "tube-glass.png",
    "tube-glass-rear.png",
    "hidden-mural.png",
    "hidden-mural-doodle.png",
    "hidden-mural-brush.png",
    "hidden-mural-night.png"
  ]) {
    try {
      const image = new Image();
      image.onload = () => file.startsWith("hidden-mural") ? scene.setMuralImage(
        [
          "hidden-mural.png",
          "hidden-mural-doodle.png",
          "hidden-mural-brush.png",
          "hidden-mural-night.png"
        ].indexOf(file),
        image
      ) : file === "background.png" ? scene.setBackground(image) : file === "play-background.png" ? scene.setPlayBackground(image) : file === "tube-glass-rear.png" ? scene.setTubeGlassRear(image) : file === "tube-glass.png" ? scene.setTubeGlass(image) : file === "turntable.png" ? scene.setTurntable(image) : file === "balls-candy.png" ? scene.setBallAtlas(image) : scene.setHomeArt(
        file === "home-logo.png" ? "logo" : "hero",
        image
      );
      image.onerror = () => {
      };
      image.src = "assets/" + file;
    } catch {
    }
  }
  var displayFactor = 1;
  function resize() {
    const w = Math.min(innerWidth, 500), h = Math.max(innerHeight, 1), dpr = Math.min(devicePixelRatio, 2);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    displayFactor = Math.min(1, h / 660);
    scene.displayScale = displayFactor;
    ctx.setTransform(dpr * displayFactor, 0, 0, dpr * displayFactor, 0, 0);
    scene.width = w / displayFactor;
    scene.height = h / displayFactor;
  }
  resize();
  music.setForeground(!document.hidden);
  addEventListener("resize", resize);
  document.addEventListener("visibilitychange", () => {
    scene.setForeground(!document.hidden);
    music.setForeground(!document.hidden);
    if (document.hidden) {
      music.suspend();
      game.hide();
    }
  });
  addEventListener("pageshow", () => {
    scene.setForeground(true);
    music.setForeground(!document.hidden);
  });
  addEventListener("pagehide", () => {
    scene.setForeground(false);
    music.setForeground(false);
    game.hide();
  });
  var start = null;
  canvas.addEventListener("pointerdown", (e) => {
    start = { x: e.offsetX, y: e.offsetY };
  });
  canvas.addEventListener("pointercancel", () => start = null);
  canvas.addEventListener("pointerup", (e) => {
    if (!start) return;
    const action = gesture(e.offsetX - start.x, e.offsetY - start.y);
    start = null;
    if (action === "right" || action === "left")
      game.rotate(action === "right" ? 1 : -1);
    else if (action === "tap")
      scene.tap(e.offsetX / displayFactor, e.offsetY / displayFactor);
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
