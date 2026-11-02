import { appendResult, readRecords } from "./platform/records";
import { CONFIG, RULE, PRESETS } from "./config";
import { createLevel } from "./core/generation";
import { type Board, take, clone, faceVisible } from "./core/rules";
import { solve } from "./core/solver";
import { save, restore, type Saved, type Store } from "./platform/storage";
import type { AdService } from "./platform/ads";
export type Phase =
  | "home"
  | "intro"
  | "ready"
  | "active"
  | "resolving"
  | "rotating"
  | "paused"
  | "ad"
  | "blocked"
  | "expired"
  | "result";
export class Controller {
  phase: Phase = "home";
  state: Saved;
  message = "旋转球仓 · 收集三同 · 揭开内层";
  hint: string | null = null;
  resume: Saved | null = null;
  introProgress = 0;
  rotation = 0;
  turnFrom = 0;
  turnTo = 0;
  turnDirection = 1;
  private pendingTurns = 0;
  private turnStart = 0;
  private last = 0;
  private until = 0;
  private animationStart = 0;
  private after: Phase = "active";
  private lastCheckpoint = 0;
  constructor(
    public now: () => number,
    private store: Store,
    public ads: AdService,
    private playSound: () => void = () => {},
  ) {
    this.state = this.fresh(0, PRESETS[0].seed);
    const loaded = restore(store);
    this.resume =
      loaded.save && loaded.save.phase !== "result" ? loaded.save : null;
    if (loaded.message) this.message = loaded.message;
    if (loaded.save?.phase === "result" && loaded.save.finishedAt !== undefined)
      appendResult(store, loaded.save);
  }
  private fresh(preset: number, seed: number): Saved {
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
      sound: this.soundPreference(),
    };
  }
  get records() {
    return readRecords(this.store);
  }
  get board(): Board {
    return this.state.board;
  }
  get transitionProgress() {
    return Math.min(
      1,
      Math.max(0, (this.now() - this.animationStart) / CONFIG.animationMs),
    );
  }
  get turnProgress() {
    return this.phase === "rotating"
      ? Math.min(
          1,
          Math.max(0, (this.now() - this.turnStart) / CONFIG.rotateMs),
        )
      : 1;
  }
  get presentationView() {
    return this.phase === "rotating"
      ? this.turnProgress < 0.5
        ? this.turnFrom
        : this.turnTo
      : this.state.view;
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
  start(preset = 0, seed?: number) {
    this.state = this.fresh(preset, seed ?? PRESETS[preset].seed);
    this.resume = null;
    this.pendingTurns = 0;
    this.phase = "intro";
    this.animationStart = this.now();
    this.until = this.animationStart + 950;
    this.rotation = 0;
    this.hint = null;
    this.message = "球仓准备中";
    this.checkpoint();
  }
  continueSaved() {
    if (!this.resume) return;
    this.state = clone(this.resume);
    this.state.sound = this.soundPreference(this.state.sound);
    this.resume = null;
    this.phase =
      this.state.phase === "ready"
        ? "ready"
        : this.state.board.status === "blocked"
          ? "blocked"
          : this.state.remaining <= 0
            ? "expired"
            : "paused";
    for (const r of this.state.rewards)
      if (r.state === "requested") r.state = "failed";
    this.rotation = (this.state.view * Math.PI * 2) / 3;
    this.message = "已恢复。主动继续后才开始计时。";
  }
  skipIntro() {
    if (this.phase === "intro") {
      this.phase = "ready";
      this.introProgress = 1;
    }
  }
  begin() {
    if (this.phase !== "ready" && this.phase !== "paused") return;
    this.phase =
      this.board.status === "blocked"
        ? "blocked"
        : this.state.remaining <= 0
          ? "expired"
          : "active";
    this.state.started = true;
    this.last = this.now();
    this.message = "取顶部球，三颗同类自动消除";
    this.checkpoint();
  }
  tick() {
    if (!["active", "resolving", "rotating", "intro"].includes(this.phase))
      return;
    const now = this.now();
    if (this.phase === "active") {
      this.state.remaining = Math.max(
        0,
        this.state.remaining - Math.max(0, now - this.last),
      );
      this.last = now;
      if (this.state.remaining === 0) {
        this.phase = "expired";
        this.message = "时间用尽，可以结束或自愿续时";
        this.checkpoint();
      } else if (now - this.lastCheckpoint > 1000) this.checkpoint();
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
        this.rotation = (this.state.view * Math.PI * 2) / 3;
        this.last = now;
        this.checkpoint();
      }
    }
    if (this.phase === "resolving" && now >= this.until) {
      this.phase = this.after;
      this.last = now;
      this.rotation = (this.state.view * Math.PI * 2) / 3;
      this.checkpoint();
    }
  }
  pick(id: string) {
    this.tick();
    if (this.phase !== "active") return;
    if (!this.visible.has(id)) {
      this.message = "该管不在当前正面，请旋转后再取球";
      return;
    }
    const before = this.board;
    const after = take(
      before,
      id,
      `${this.state.session}:${++this.state.sequence}`,
    );
    if (after === before) {
      this.message = "先清空外侧容器，只能取顶部球";
      return;
    }
    this.state.history.push(clone(before));
    this.state.undoAvailable = true;
    this.state.board = after;
    this.hint = null;
    this.message =
      after.cleared.length > before.cleared.length
        ? "三同收集成功 +100"
        : "已放入暂存槽";
    this.after =
      after.status === "won"
        ? "result"
        : after.status === "blocked"
          ? "blocked"
          : "active";
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
  rotate(direction: number) {
    this.tick();
    if (!this.canTurn || (direction !== 1 && direction !== -1)) return;
    // Public +1 means move the front row to screen-right; world angle decreases.
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
  interrupt(error: unknown) {
    // Do not read a possibly faulty clock or re-enter the renderer here.
    console.error("TriCollect frame interrupted", error);
    this.pendingTurns = 0;
    this.rotation = (this.state.view * Math.PI * 2) / 3;
    if (
      this.phase !== "home" &&
      this.phase !== "result" &&
      this.phase !== "ad"
    ) {
      this.pendingTurns = 0;
      this.phase = this.board.status === "won" ? "result" : "paused";
      this.state.phase = this.board.status === "won" ? "result" : "paused";
      try {
        save(this.store, this.state);
      } catch {}
    }
    this.message = "运行暂时中断，已暂停；可继续或返回首页";
  }
  pause() {
    this.tick();
    if (["active", "resolving", "rotating"].includes(this.phase)) {
      this.pendingTurns = 0;
      this.phase = this.board.status === "won" ? "result" : "paused";
      this.rotation = (this.state.view * Math.PI * 2) / 3;
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
    this.state.board = this.state.history.pop()!;
    this.state.undoAvailable = false;
    this.phase = "active";
    this.last = this.now();
    this.hint = null;
    this.message = "已撤销；已用时间不会返还";
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
      this.visible,
    );
    this.tick();
    if (this.phase !== "active") return;
    if (result.status === "safe") this.state.hintsUsed++;
    this.hint = result.status === "safe" ? result.path[0] : null;
    this.message =
      result.status === "safe"
        ? "当前面亮框管位有已验证的后续解"
        : result.status === "unknown"
          ? "预算内尚未确定，可尝试撤销或继续观察"
          : "当前面暂无可靠路线，可旋转后再提示";
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
  private soundPreference(fallback = true) {
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
    } catch {}
    this.checkpoint();
  }
  async extend() {
    this.tick();
    if (
      this.phase !== "expired" ||
      this.state.extensions >= CONFIG.maxExtensions ||
      !this.ads.available
    )
      return;
    const session = this.state.session,
      id = `${session}:reward:${++this.state.sequence}`;
    this.state.rewards.push({
      id,
      session,
      state: "requested",
      redeemed: false,
    });
    this.phase = "ad";
    this.message = "广告请求中，棋盘和计时已暂停";
    this.checkpoint();
    let outcome: "completed" | "cancelled" | "failed";
    try {
      outcome = await this.ads.request();
    } catch {
      outcome = "failed";
    }
    this.reward(session, id, outcome);
  }
  reward(
    session: string,
    id: string,
    outcome: "completed" | "cancelled" | "failed",
  ) {
    const r = this.state.rewards.find((r) => r.id === id);
    if (
      session !== this.state.session ||
      this.phase !== "ad" ||
      !r ||
      r.state !== "requested"
    )
      return;
    r.state = outcome;
    if (outcome === "completed" && !r.redeemed) {
      r.redeemed = true;
      this.state.extensions++;
      this.state.added += CONFIG.extraMs;
      this.state.remaining += CONFIG.extraMs;
      this.phase = "paused";
      this.message = "已增加 30 秒，点击继续";
    } else {
      this.phase = "expired";
      this.message =
        outcome === "cancelled"
          ? "未完成观看，没有发放奖励"
          : "广告不可用，原局已保留";
    }
    this.checkpoint();
  }
  checkpoint() {
    // Home may only own a placeholder; the player has not claimed the saved session.
    // Never rotate main/backup storage until start() or continueSaved() leaves home.
    if (this.phase === "home") return;
    this.state.phase =
      this.phase === "result" || this.board.status === "won"
        ? "result"
        : this.board.status === "blocked"
          ? "blocked"
          : this.state.remaining <= 0
            ? "expired"
            : this.phase === "ready" || this.phase === "intro"
              ? "ready"
              : "paused";
    if (this.state.phase === "result" && this.state.started)
      this.state.finishedAt ??= Date.now();
    try {
      save(this.store, this.state);
      this.lastCheckpoint = this.now();
    } catch {
      this.message = "存档写入失败，本局可继续；退出可能丢失进度";
    }
    if (!appendResult(this.store, this.state))
      this.message = "本机战绩保存失败，本局仍可结束";
  }
}
