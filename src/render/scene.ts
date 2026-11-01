import { PALETTE, SYMBOLS, PRESETS, CONFIG, VERSION } from "../config";
import { exposed, type Tube } from "../core/rules";
import { Controller } from "../controller";
export type Button = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  act: () => void;
  disabled: boolean;
};
export class Scene {
  buttons: Button[] = [];
  page = 0;
  drawer = false;
  targets: { id: string; x: number; y: number; r: number }[] = [];
  private bodies: {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    topY: number;
  }[] = [];
  constructor(
    private ctx: CanvasRenderingContext2D,
    public game: Controller,
    public width: number,
    public height: number,
  ) {}
  private text(
    t: string,
    x: number,
    y: number,
    size = 14,
    color = "#d9ece7",
    align: CanvasTextAlign = "left",
  ) {
    const c = this.ctx;
    c.font = `${size >= 24 ? "600" : "400"} ${size}px sans-serif`;
    c.fillStyle = color;
    c.textAlign = align;
    c.fillText(t, x, y);
  }
  private rect(
    x: number,
    y: number,
    w: number,
    h: number,
    color: string,
    r = 12,
  ) {
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
  private button(
    id: string,
    label: string,
    x: number,
    y: number,
    w: number,
    h: number,
    act: () => void,
    disabled = false,
    accent = false,
  ) {
    this.rect(
      x,
      y,
      w,
      h,
      disabled ? "#233e42" : accent ? "#d4e7b6" : "#284c50",
    );
    this.text(
      label,
      x + w / 2,
      y + h / 2 + 5,
      14,
      disabled ? "#718b8b" : accent ? "#183b37" : "#eef7ed",
      "center",
    );
    this.buttons.push({ id, x, y, w, h, act, disabled });
  }
  private ball(type: number, x: number, y: number, r: number, alpha = 1) {
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
        "center",
      );
    } finally {
      c.restore();
    }
  }
  render() {
    const c = this.ctx,
      g = this.game,
      w = this.width,
      h = this.height;
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
    this.text("三面球仓", 22, 66, 26, "#f1f1df");
    this.text(
      PRESETS[g.state.preset].name + " · " + g.state.seed,
      22,
      88,
      11,
      "#9bbab7",
    );
    this.text(
      `${Math.ceil(g.state.remaining / 1000 / 60) - (Math.ceil(g.state.remaining / 1000) % 60 === 0 ? 0 : 1)}:${String(Math.ceil(g.state.remaining / 1000) % 60).padStart(2, "0")}`,
      w - 24,
      46,
      28,
      g.state.remaining < 30_000 ? "#fb826f" : "#f1f1df",
      "right",
    );
    this.text(
      `${g.board.score} 分  ·  +${g.state.added / 1000}秒`,
      w - 24,
      71,
      12,
      "#a9c6bd",
      "right",
    );
    const hidden = ["paused", "ad", "expired", "blocked", "result"].includes(
      g.phase,
    );
    if (hidden) {
      this.overlay();
      return;
    }
    const trayY = h - 143,
      boardBottom = trayY - 30;
    this.drawBoard(147, boardBottom);
    this.button(
      "pause",
      "暂停",
      w - 77,
      88,
      55,
      34,
      () => {
        this.drawer = false;
        g.pause();
      },
      g.locked,
    );
    this.button(
      "select",
      "选球",
      22,
      100,
      55,
      34,
      () => {
        this.drawer = !this.drawer;
      },
      g.locked,
    );
    this.text(
      "点击亮圈顶部球 · 横滑切面",
      w / 2,
      boardBottom + 10,
      12,
      "#a9c6bd",
      "center",
    );
    this.text("三同消除", 22, trayY - 7, 12, "#a9c6bd");
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
      "↶",
      22,
      trayY + 55,
      bw,
      44,
      () => {
        this.drawer = false;
        g.rotate(-1);
      },
      g.locked,
    );
    this.button(
      "rotate-right",
      "↷",
      29 + bw,
      trayY + 55,
      bw,
      44,
      () => {
        this.drawer = false;
        g.rotate(1);
      },
      g.locked,
    );
    this.button(
      "undo",
      "撤销",
      36 + bw * 2,
      trayY + 55,
      bw,
      44,
      () => g.undo(),
      g.locked || !g.state.history.length,
    );
    this.button(
      "hint",
      "提示",
      43 + bw * 3,
      trayY + 55,
      bw,
      44,
      () => {
        g.hintNow();
        if (g.hint && !this.targets.some((t) => t.id === g.hint)) {
          this.drawer = true;
          this.page = Math.floor(
            g.board.tubes.findIndex((t) => t.id === g.hint) / 10,
          );
        }
      },
      g.locked,
    );
    this.text(
      this.fit(g.message, Math.floor((w - 40) / 11)),
      w / 2,
      h - 20,
      11,
      "#c5d5c7",
      "center",
    );
    if (this.drawer && g.phase === "active") this.drawSelector(160);
    if (g.phase === "intro" || g.phase === "ready") {
      this.rect(
        18,
        Math.max(100, boardBottom - 103),
        w - 36,
        92,
        "#173b40",
        18,
      );
      this.text(
        "只取顶部 · 三同消除 · 逐层揭开",
        w / 2,
        boardBottom - 73,
        13,
        "#e9edda",
        "center",
      );
      this.button(
        "begin",
        g.phase === "intro" ? "跳过开场" : "开始 · 05:00",
        w / 2 - 90,
        boardBottom - 58,
        180,
        42,
        () => (g.phase === "intro" ? g.skipIntro() : g.begin()),
        false,
        true,
      );
    }
  }
  private drawSelector(y: number) {
    const g = this.game,
      w = this.width,
      c = this.ctx,
      tiles = g.board.tubes,
      pages = Math.ceil(tiles.length / 10);
    this.page = Math.min(this.page, pages - 1);
    this.rect(14, y, w - 28, 188, "#123139", 16);
    this.text("遮挡时辅助选球", 26, y + 27, 14, "#d9ece7");
    this.button("close-select", "收起", w - 80, y + 10, 52, 32, () => {
      this.drawer = false;
    });
    const e = exposed(g.board),
      gap = 7,
      tw = (w - 52 - gap * 4) / 5;
    for (let i = 0; i < 10; i++) {
      const t = tiles[this.page * 10 + i];
      if (!t) continue;
      const x = 26 + (i % 5) * (tw + gap),
        ty = y + 54 + Math.floor(i / 5) * 48,
        top = t.balls[t.balls.length - 1],
        allowed = e.has(t.id);
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
        !allowed,
      );
      if (top) {
        this.ball(top.type, x + tw * 0.65, ty + 21, 11, allowed ? 1 : 0.25);
        this.text(String(tiles.indexOf(t) + 1), x + 7, ty + 25, 11);
      } else this.text("✓", x + tw / 2, ty + 25, 12, "#759e91", "center");
      if (g.hint === t.id) {
        c.strokeStyle = "#f4d27e";
        c.strokeRect(x - 1, ty - 1, tw + 2, 44);
      }
    }
    this.button(
      "page",
      `换页 ${this.page + 1}/${pages}`,
      w / 2 - 55,
      y + 151,
      110,
      28,
      () => {
        this.page = (this.page + 1) % pages;
      },
      pages === 1,
    );
  }
  private fit(t: string, n: number) {
    return t.length > n ? t.slice(0, n - 1) + "…" : t;
  }
  private drawBoard(top: number, bottom: number) {
    const c = this.ctx,
      g = this.game,
      w = this.width,
      n = g.board.side;
    const available = Math.max(120, bottom - top),
      scale = Math.min((w - 55) / (n * 46), available / 255, 1.65),
      angle = g.rotation;
    const projected = g.board.tubes
      .map((t, index) => {
        const x = (t.q + t.r / 2 - (n - 1) / 2) * 46,
          z = ((t.r * Math.sqrt(3)) / 2 - ((n - 1) * Math.sqrt(3)) / 6) * 46;
        const rx = x * Math.cos(angle) - z * Math.sin(angle),
          depth = x * Math.sin(angle) + z * Math.cos(angle);
        return {
          t,
          index,
          x: w / 2 + rx * scale,
          y: top + available * 0.61 + depth * 0.5 * scale,
          depth,
        };
      })
      .sort((a, b) => a.depth - b.depth);
    const low = Math.min(...projected.map((p) => p.depth * 0.5)) - 71;
    const high = Math.max(...projected.map((p) => p.depth * 0.5)) + 62;
    for (const p of projected)
      p.y = top + available / 2 + (p.depth * 0.5 - (low + high) / 2) * scale;
    // Physical depth sorting; the overlay selection grid is the guaranteed accessible entry.
    const e = exposed(g.board);
    for (const p of projected) {
      const t = p.t;
      if (!t.balls.length) {
        if (
          g.phase === "resolving" &&
          g.state.history[g.state.history.length - 1]?.tubes.find(
            (x) => x.id === t.id,
          )?.balls.length
        ) {
          c.globalAlpha = 1 - g.transitionProgress;
          this.rect(
            p.x - 12 * scale,
            p.y - 60 * scale,
            24 * scale,
            100 * scale,
            "#b7d7d733",
          );
          c.globalAlpha = 1;
        }
        continue;
      }
      const r = 16 * scale,
        ht = 116 * scale,
        by = p.y + 45 * scale,
        ty = by - ht;
      c.fillStyle = "#c7eceb13";
      c.strokeStyle = e.has(t.id) ? "#c7eceb77" : "#c7eceb22";
      c.lineWidth = 1;
      c.beginPath();
      c.rect(p.x - r, ty, r * 2, ht);
      c.fill();
      c.stroke();
      for (let i = 0; i < t.balls.length; i++) {
        const intro =
          g.phase === "intro"
            ? (1 - g.introProgress) * Math.max(0, 180 - i * 35)
            : 0;
        this.ball(
          t.balls[i].type,
          p.x,
          by - 17 * scale - i * 31 * scale - intro,
          r * 0.82,
          e.has(t.id) ? 1 : 0.25,
        );
      }
      c.beginPath();
      c.ellipse(p.x, ty, r, r * 0.3, 0, 0, Math.PI * 2);
      c.stroke();
      this.text(
        String(p.index + 1),
        p.x,
        by + 17 * scale,
        11,
        "#e9e9cd",
        "center",
      );
      this.bodies.push({
        id: t.id,
        x: p.x - r,
        y: ty,
        w: r * 2,
        h: ht,
        topY: by - 17 * scale - (t.balls.length - 1) * 31 * scale,
      });
    }
    for (const body of this.bodies) {
      const x = body.x + body.w / 2,
        y = body.topY;
      const foreground = [...this.bodies]
        .reverse()
        .find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
      if (foreground?.id !== body.id || !e.has(body.id)) continue;
      this.targets.push({ id: body.id, x, y, r: body.w * 0.45 });
      c.strokeStyle = g.hint === body.id ? "#f4d27e" : "#d4e7b6";
      c.lineWidth = g.hint === body.id ? 3 : 1.5;
      c.beginPath();
      c.arc(x, y, body.w * 0.45, 0, Math.PI * 2);
      c.stroke();
    }
    this.text(
      "三面观察  " + (g.state.view + 1) + "/3",
      w / 2,
      top - 7,
      11,
      "#7fa9a4",
      "center",
    );
    if (g.phase === "resolving") {
      const prev = g.state.history[g.state.history.length - 1];
      const t = prev?.tubes.find(
        (t) =>
          t.balls.length >
          g.board.tubes.find((n) => n.id === t.id)!.balls.length,
      );
      const p = projected.find((p) => p.t.id === t?.id);
      if (t && p) {
        const ball = t.balls[t.balls.length - 1]!;
        const a = g.transitionProgress;
        this.ball(
          ball.type,
          p.x + (w / 2 - p.x) * a,
          p.y - 30 + (this.height - 122 - p.y + 30) * a,
          14 * scale,
        );
      }
    }
  }
  private home() {
    const w = this.width,
      h = this.height;
    this.text("T R I C O L L E C T", w / 2, 76, 13, "#b1cbc0", "center");
    this.text("三面球仓", w / 2, 122, 38, "#f2f0db", "center");
    this.text("转一个角度，发现下一组。", w / 2, 155, 14, "#adc8bd", "center");
    for (let i = 0; i < 5; i++) {
      const x = w / 2 + (i - 2) * 43,
        y = 230 + Math.abs(i - 2) * 14;
      this.rect(x - 17, y - 28, 34, 80, "#8ad1c31a");
      this.ball(i, x, y, 14);
      this.ball((i + 2) % 5, x, y + 32, 14);
    }
    this.text(
      "取顶部球放入七格槽，凑齐三颗同类。",
      w / 2,
      343,
      13,
      "#e2e8d6",
      "center",
    );
    this.text(
      "外层清空后，新的球仓逐渐显露。",
      w / 2,
      367,
      13,
      "#adc8bd",
      "center",
    );
    const y = Math.min(h - 260, 405);
    PRESETS.forEach((p, i) =>
      this.button(
        "start-" + i,
        `${p.name}  ·  ${((p.side * (p.side + 1)) / 2) * p.height} 颗  ·  5 分钟`,
        28,
        y + i * 53,
        w - 56,
        44,
        () => {
          this.page = 0;
          this.game.start(i);
        },
        false,
        i === 0,
      ),
    );
    if (this.game.resume)
      this.button("resume", "继续上次球仓", 28, y + 166, w - 56, 42, () =>
        this.game.continueSaved(),
      );
    if (this.game.message.includes("存档"))
      this.text(
        this.fit(this.game.message, 26),
        w / 2,
        391,
        11,
        "#f3c667",
        "center",
      );
    this.text(
      "无广告可通关 · 免费撤销与提示",
      w / 2,
      h - 55,
      12,
      "#b7cdbb",
      "center",
    );
    this.text(
      `原型 v${VERSION} · 难度与时长待试玩校准`,
      w / 2,
      h - 32,
      11,
      "#739e98",
      "center",
    );
  }
  private overlay() {
    const g = this.game,
      w = this.width,
      h = this.height,
      y = Math.max(138, h * 0.25);
    const title =
      g.phase === "result"
        ? g.board.status === "won"
          ? "球仓清空"
          : "本局结束"
        : g.phase === "blocked"
          ? "暂存槽已满"
          : g.phase === "expired"
            ? "时间用尽"
            : g.phase === "ad"
              ? "正在请求广告"
              : "已暂停";
    this.rect(20, y - 30, w - 40, Math.min(460, h - y - 30), "#123139", 22);
    this.text(title, w / 2, y + 20, 30, "#f2f0db", "center");
    this.text(
      `${g.board.score} 分 · 已消除 ${g.board.cleared.length} 颗`,
      w / 2,
      y + 55,
      15,
      "#bdd3bf",
      "center",
    );
    this.text(
      `有效用时 ${Math.ceil((CONFIG.baseMs + g.state.added - g.state.remaining) / 1000)} 秒`,
      w / 2,
      y + 80,
      13,
      "#9dbab3",
      "center",
    );
    if (g.phase === "ad") {
      this.text(
        "计时已暂停，等待广告结果",
        w / 2,
        y + 145,
        14,
        "#d4e7b6",
        "center",
      );
      return;
    }
    this.text(
      `提示 ${g.state.hintsUsed} · 撤销 ${g.state.undosUsed} · 续时 ${g.state.extensions}`,
      w / 2,
      y + 102,
      11,
      "#9dbab3",
      "center",
    );
    let by = y + 125;
    const add = (
      id: string,
      label: string,
      fn: () => void,
      disabled = false,
    ) => {
      this.button(
        id,
        label,
        40,
        by,
        w - 80,
        44,
        fn,
        disabled,
        id === "continue",
      );
      by += 56;
    };
    if (g.phase === "paused") add("continue", "继续游戏", () => g.begin());
    if (g.phase === "blocked")
      add(
        "undo-blocked",
        "免费撤销一步",
        () => g.undo(),
        !g.state.history.length,
      );
    if (g.phase === "expired") {
      add(
        "extend",
        g.ads.available
          ? `自愿看广告 +30秒 (${g.state.extensions}/${CONFIG.maxExtensions})`
          : "广告未配置 · 可直接结束",
        () => void g.extend(),
        !g.ads.available || g.state.extensions >= CONFIG.maxExtensions,
      );
      this.text(g.ads.label, w / 2, by - 2, 11, "#94b2ac", "center");
      by += 8;
    }
    if (g.phase !== "result") add("end", "结束并保留本局成绩", () => g.end());
    else
      add("again", "再来一局", () =>
        g.start(g.state.preset, (g.state.seed + 1) >>> 0),
      );
    add("home", "返回首页", () => g.home());
    if (g.phase === "paused")
      add("sound", g.state.sound ? "音效：开" : "音效：关", () =>
        g.toggleSound(),
      );
    this.text(
      this.fit(g.message, Math.floor((w - 55) / 12)),
      w / 2,
      Math.min(h - 25, by + 15),
      12,
      "#bdd3bf",
      "center",
    );
  }
  tap(x: number, y: number) {
    const button = [...this.buttons]
      .reverse()
      .find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    if (button) {
      if (!button.disabled) button.act();
      return;
    }
    if (this.game.locked || this.drawer) return;
    // Frontmost body owns the hit. Never search behind a foreground occluder.
    const body = [...this.bodies]
      .reverse()
      .find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    if (body) {
      if (Math.abs(y - body.topY) <= body.w * 0.45) this.game.pick(body.id);
      else this.game.message = "只能取亮圈顶部球；遮挡时可点左上选球";
    }
  }
}
