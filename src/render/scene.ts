import { projection } from "./projection";
import { PALETTE, SYMBOLS, PRESETS, CONFIG, FACES } from "../config";
import { faceVisible, faceCoordinates } from "../core/rules";
import { Controller } from "../controller";
export type Button = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  act: () => void;
  disabled: boolean;
  dimmed: boolean;
};
export class Scene {
  buttons: Button[] = [];
  homePanel: "records" | "help" | "difficulty" | "replace" | null = null;
  recordPage = 0;
  private mascotTime = 0;
  private foreground = true;
  private decorationLast: number | null = null;
  private selectedDifficulty = 0;
  trackObjects: { x: number; y: number; r: number }[] = [];
  get decorationTime() {
    return this.mascotTime;
  }
  setForeground(value: boolean) {
    this.foreground = value;
    this.decorationLast = null;
  }
  private animateHome() {
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
  misclickFeedback: {
    x: number;
    y: number;
    started: number;
    session: string;
    view: number;
  } | null = null;
  backgroundLoaded = false;
  private background: CanvasImageSource | null = null;
  private playBackground: CanvasImageSource | null = null;
  playBackgroundLoaded = false;
  get backgroundKind() {
    return this.game.phase === "home"
      ? this.background
        ? "home"
        : "fallback"
      : this.playBackground
        ? "play"
        : this.background
          ? "home"
          : "fallback";
  }
  private get currentBackground() {
    return this.game.phase === "home"
      ? this.background
      : (this.playBackground ?? this.background);
  }
  setPlayBackground(image: CanvasImageSource) {
    this.playBackground = image;
    this.playBackgroundLoaded = true;
  }
  setBackground(image: CanvasImageSource) {
    this.background = image;
    this.backgroundLoaded = true;
  }
  renderedIds: string[] = [];
  ghostPositions: {
    id: string;
    tube: string;
    slot: number;
    x: number;
    y: number;
    r: number;
  }[] = [];
  ballPositions: {
    id: string;
    tube: string;
    slot: number;
    x: number;
    y: number;
    r: number;
  }[] = [];
  flightOrigin: { x: number; y: number; id: string } | null = null;
  rotationAxis = { x: 0, y: 0 };
  decorativeTray: {
    corners: { x: number; y: number }[];
    frontY: number;
    axis: { x: number; y: number };
    thickness: number;
  } | null = null;
  projectionScale = { x: 1, z: 1 };
  visibleBalls: { tube: string; ids: string[] }[] = [];
  tubeLayout: { id: string; x: number; y: number; r: number; depth: number }[] =
    [];
  silhouetteIds: string[] = [];
  rearOpenings: { id: string; x: number; y: number; rx: number; ry: number }[] =
    [];
  renderedFace = 0;
  capStates: { id: string; closed: boolean; x: number; y: number }[] = [];
  titleAngle = 0;
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
    color = "#284b40",
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
    dimmed = disabled,
  ) {
    const primary = accent || id === "hint" || id === "again";
    const fill = dimmed ? "#b5bdb0" : primary ? "#f5a340" : "#278b71";
    this.rect(x - 2, y - 2, w + 4, h + 10, "#355447", 16);
    this.rect(
      x,
      y + 5,
      w,
      h,
      dimmed ? "#8a9587" : primary ? "#a95f27" : "#1b5749",
      14,
    );
    this.rect(x, y, w, h, fill, 14);
    this.rect(
      x + 5,
      y + 3,
      w - 10,
      Math.min(10, h / 4),
      dimmed ? "#ffffff08" : "#ffffff30",
      7,
    );
    this.text(
      label,
      x + w / 2,
      y + h / 2 + 5,
      id.startsWith("rotate") ? 24 : 15,
      dimmed ? "#4f5c50" : primary ? "#3b2b1d" : "#ffffff",
      "center",
    );
    this.buttons.push({ id, x, y, w, h, act, disabled, dimmed });
  }
  private ball(type: number, x: number, y: number, r: number, alpha = 1) {
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
        Math.PI * 2,
      );
      c.fill();
      const shade = (mix: number) => {
        const rgb = PALETTE[type]
          .slice(1)
          .match(/../g)!
          .map((n) => parseInt(n, 16));
        return (
          "#" +
          rgb
            .map((v) =>
              Math.round(mix > 0 ? v + (255 - v) * mix : v * (1 + mix))
                .toString(16)
                .padStart(2, "0"),
            )
            .join("")
        );
      };
      const gradient = c.createRadialGradient(
        x - r * 0.32,
        y - r * 0.38,
        r * 0.05,
        x,
        y,
        r,
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
        r * 0.29,
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
        Math.PI * 2,
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
        Math.PI * 2,
      );
      c.fill();
      // A subdued second reflection resembles a polished billiard ball, not a glowing outline.
      c.fillStyle = "#d4eaff44";
      c.beginPath();
      c.ellipse(
        x + r * 0.35,
        y + r * 0.42,
        r * 0.23,
        r * 0.075,
        -0.62,
        0,
        Math.PI * 2,
      );
      c.fill();
      this.text(
        SYMBOLS[type],
        x,
        y + r * 0.34,
        Math.max(7, r * 0.51),
        "#302447a8",
        "center",
      );
    } finally {
      c.restore();
    }
  }
  private shadowBall(x: number, y: number, r: number) {
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
      Math.PI * 2,
    );
    c.fill();
    const shade = c.createRadialGradient(
      x - r * 0.35,
      y - r * 0.4,
      r * 0.06,
      x,
      y,
      r,
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
  private chamberPath(x: number, top: number, y: number, r: number) {
    const c = this.ctx,
      neck = r * 0.86,
      shoulder = Math.min(20, (y - top) * 0.15);
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
  private transmittedBackdrop(x: number, y: number, w: number, h: number) {
    const c = this.ctx;
    c.fillStyle = "#dbe6cf";
    c.fillRect(x, y, w, h);
    if (this.currentBackground) {
      const scale = Math.max(this.width / 600, this.height / 1040),
        left = (this.width - 600 * scale) / 2,
        top = (this.height - 1040 * scale) / 2;
      c.drawImage(
        this.currentBackground,
        (x - left) / scale,
        (y - top) / scale,
        w / scale,
        h / scale,
        x,
        y,
        w,
        h,
      );
    }
  }
  private drawMisclick() {
    const f = this.misclickFeedback;
    if (!f) return;
    const p = (this.game.now() - f.started) / CONFIG.misclickMs;
    if (p >= 1 || p < 0) {
      this.misclickFeedback = null;
      return;
    }
    const c = this.ctx,
      r = 12 + 20 * p;
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
    const c = this.ctx,
      g = this.game,
      w = this.width,
      h = this.height;
    if (
      this.misclickFeedback &&
      (g.phase !== "active" ||
        this.misclickFeedback.session !== g.state.session ||
        this.misclickFeedback.view !== g.state.view)
    )
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
        1040 * scale,
      );
    }
    this.button(
      "sound-toggle",
      g.state.sound ? "声音开" : "静音",
      w - 78,
      18,
      60,
      34,
      () => g.toggleSound(),
    );
    if (g.phase === "home") {
      this.home();
      return;
    }
    this.homePanel = null;
    this.decorationLast = null;
    this.rect(16, 16, 116, 51, "#697d61", 16);
    this.rect(19, 19, 110, 45, "#fffbed", 13);
    const secs = Math.ceil(g.state.remaining / 1000);
    this.text(
      `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`,
      74,
      51,
      29,
      g.state.remaining < 30000 ? "#bd3b30" : "#294d3c",
      "center",
    );
    const total = g.board.tubes.reduce((n, t) => n + t.capacity, 0);
    const progress = g.board.cleared.length / total;
    this.text(`清空 ${g.board.cleared.length}/${total}`, 20, 91, 13, "#294d3c");
    this.rect(20, 101, w - 40, 9, "#a6b49a", 5);
    if (progress > 0)
      this.rect(20, 101, Math.max(9, (w - 40) * progress), 9, "#278b71", 5);
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
    this.drawMisclick();
    this.button(
      "pause",
      "暂停",
      w - 146,
      18,
      60,
      34,
      () => {
        g.pause();
      },
      !["active", "resolving", "rotating"].includes(g.phase),
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
    const transientLock = g.phase === "resolving" || g.phase === "rotating";
    this.button(
      "rotate-left",
      "←",
      22,
      trayY + 55,
      bw,
      44,
      () => {
        g.rotate(-1);
      },
      !g.canTurn,
      false,
      !g.canTurn && !transientLock,
    );
    this.button(
      "rotate-right",
      "→",
      29 + bw,
      trayY + 55,
      bw,
      44,
      () => {
        g.rotate(1);
      },
      !g.canTurn,
      false,
      !g.canTurn && !transientLock,
    );
    this.button(
      "undo",
      "撤销",
      36 + bw * 2,
      trayY + 55,
      bw,
      44,
      () => g.undo(),
      g.locked || !g.canUndo,
      false,
      !g.canUndo || (g.locked && !transientLock),
    );
    this.button(
      "hint",
      "提示",
      43 + bw * 3,
      trayY + 55,
      bw,
      44,
      () => g.hintNow(),
      g.locked,
      false,
      g.locked && !transientLock,
    );
    // Routine rule narration is omitted. Only actionable failures/hint status remain.
    const notice = /失败|中断|预算|暂无/.test(g.message)
      ? g.message.includes("预算")
        ? "暂未找到提示，试试转面"
        : g.message.includes("暂无")
          ? "换一面再试试"
          : g.message
      : "";
    if (notice)
      this.text(
        this.fit(notice, Math.floor((w - 40) / 11)),
        w / 2,
        h - 16,
        11,
        "#8b3e26",
        "center",
      );
    if (g.phase === "intro" || g.phase === "ready") {
      this.rect(
        18,
        Math.max(100, boardBottom - 103),
        w - 36,
        92,
        "#fffbed",
        18,
      );
      this.text(
        "点顶球 · 三颗同色消除",
        w / 2,
        boardBottom - 73,
        13,
        "#294d3c",
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
  private fit(t: string, n: number) {
    return t.length > n ? t.slice(0, n - 1) + "…" : t;
  }
  private drawBoard(top: number, bottom: number) {
    const c = this.ctx,
      g = this.game,
      w = this.width,
      n = g.board.side;
    const view = g.presentationView,
      face = FACES[view],
      turning = g.phase === "rotating",
      p = g.turnProgress;
    const ease = p * p * (3 - 2 * p);
    const angle =
      ((turning ? g.turnFrom + g.turnDirection * ease : g.state.view) *
        Math.PI *
        2) /
      3;
    const layout = projection(
      n,
      w,
      top,
      bottom,
      angle,
      Math.max(...g.board.tubes.map((t) => t.capacity)),
    );
    const { radius, step, ballRadius, point, axis } = layout;
    this.rotationAxis = axis;
    this.projectionScale = { x: layout.lane, z: layout.zScale };
    const accessible = faceVisible(g.board, view);
    const visible = turning ? new Set<string>() : accessible;
    this.capStates = [];
    this.renderedFace = view;
    this.renderedIds = [...visible];
    for (let i = 0; i < 3; i++) {
      this.rect(
        w / 2 - 35 + i * 26,
        top - 20,
        18,
        6,
        i === view ? "#cf7835" : "#9bad90",
        3,
      );
    }
    const ordered = g.board.tubes
      .filter((t) => t.balls.length)
      .map((t) => ({ t, ...point(t) }))
      .sort((a, b) => b.depth - a.depth);
    this.tubeLayout = ordered.map((t) => ({
      id: t.t.id,
      x: t.x,
      y: t.y,
      r: radius,
      depth: faceCoordinates(t.t, n, view).depth,
    }));
    this.silhouetteIds = ordered
      .filter((p) => !visible.has(p.t.id))
      .map((p) => p.t.id);
    // The platform and every tube rotate using the same centered world transform.
    const corners = [
      { q: 0, r: 0 },
      { q: n - 1, r: 0 },
      { q: 0, r: n - 1 },
    ].map(point);
    const ratio = layout.zScale / layout.lane,
      padding = radius + 4;
    this.decorativeTray = {
      corners: corners.map((p) => ({ x: p.x, y: p.y })),
      frontY: Math.max(...corners.map((p) => p.y)) + padding * ratio + 17,
      axis: { ...axis },
      thickness: 15,
    };
    const dish = (offset: number, color: string, inset = 0) => {
      c.save();
      try {
        c.translate(0, axis.y + offset);
        c.scale(1, ratio);
        c.lineJoin = "round";
        c.beginPath();
        corners.forEach((p, i) =>
          i
            ? c.lineTo(p.x, (p.y - axis.y) / ratio)
            : c.moveTo(p.x, (p.y - axis.y) / ratio),
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
    dish(27, "#263e2940");
    dish(18, "#805737");
    dish(3, "#e0b273");
    dish(1, "#b28b59", 3.5);
    const opening = Math.min(
      9,
      Math.max(4, (radius * layout.zScale) / layout.lane),
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
        Math.PI * 2,
      );
      c.fill();
    }
    for (const item of ordered) {
      const { t, x, y } = item,
        height = t.capacity * step + 20,
        ty = y - height,
        front = visible.has(t.id);
      const capped = !accessible.has(t.id);
      this.capStates.push({ id: t.id, closed: capped, x, y: ty });
      if (!front) {
        const rear = c.createLinearGradient(x - radius, ty, x + radius, y);
        rear.addColorStop(0, "#88a99c");
        rear.addColorStop(0.13, "#e8f3df");
        rear.addColorStop(0.32, "#c1d7c4");
        rear.addColorStop(0.7, "#afc7b7");
        rear.addColorStop(1, "#76968c");
        this.chamberPath(x, ty, y, radius);
        c.fillStyle = rear;
        c.fill();
        c.strokeStyle = "#76998e80";
        c.lineWidth = 1;
        c.stroke();
        c.beginPath();
        c.ellipse(x, ty - 1, radius * 0.98, opening, 0, 0, Math.PI * 2);
        c.fillStyle = "#e3e9d4";
        c.fill();
        c.beginPath();
        c.ellipse(x, ty - 1, radius * 0.79, opening * 0.55, 0, 0, Math.PI * 2);
        c.fillStyle = "#afc2ac";
        c.fill();
        c.beginPath();
        c.ellipse(x, y - 1, radius * 0.9, opening * 0.6, 0, 0, Math.PI * 2);
        c.fillStyle = "#9bb19855";
        c.fill();
        c.strokeStyle = "#f4fff5b0";
        c.lineWidth = 0.8;
        c.beginPath();
        c.moveTo(x - radius * 0.79, ty + 12);
        c.quadraticCurveTo(
          x - radius * 0.88,
          ty + height * 0.55,
          x - radius * 0.7,
          y - 10,
        );
        c.stroke();
        if (capped) {
          const lidSide = c.createLinearGradient(
            x - radius,
            ty - 5,
            x + radius,
            ty + 6,
          );
          lidSide.addColorStop(0, "#c9a66a");
          lidSide.addColorStop(0.3, "#ead09a");
          lidSide.addColorStop(1, "#9b7648");
          c.fillStyle = "#29483935";
          c.beginPath();
          c.ellipse(
            x + radius * 0.12,
            ty + 7,
            radius * 1.03,
            opening * 0.9,
            0,
            0,
            Math.PI * 2,
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
            ty + opening - 7,
          );
          lidTop.addColorStop(0, "#fff0c8");
          lidTop.addColorStop(0.45, "#e6c78b");
          lidTop.addColorStop(1, "#bc955e");
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
            Math.PI * 1.95,
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
            Math.PI * 2,
          );
          c.stroke();
        }
        this.rearOpenings.push({
          id: t.id,
          x,
          y: ty - 1,
          rx: radius * 0.98,
          ry: opening,
        });
        for (let i = 0; i < t.balls.length; i++)
          this.ghostPositions.push({
            id: t.balls[i].id,
            tube: t.id,
            slot: i,
            x,
            y: y - ballRadius - 6 - i * step,
            r: ballRadius,
          });
        this.bodies.push({
          id: t.id,
          x: x - radius,
          y: ty - opening,
          w: radius * 2,
          h: height + opening,
          topY: y - ballRadius - 6 - (t.balls.length - 1) * step,
        });
        continue;
      }
      // Optical backdrop transmission is composited independently of hidden game contents.
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
          y - 12,
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
      // A thick rolled lip, short neck and rounded shoulder form an open glass bottle.
      const rim = c.createLinearGradient(
        x - radius,
        ty - opening,
        x + radius,
        ty + opening,
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
      c.ellipse(x, ty - 1, radius * 0.89, opening * 0.63, 0, 0, Math.PI * 2);
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
        Math.PI * 1.9,
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
          ry: opening,
        });
      const previous =
        g.phase === "resolving"
          ? g.state.history.at(-1)?.tubes.find((old) => old.id === t.id)
          : undefined;
      const visibleCountBase =
        previous && previous.balls.length > t.balls.length
          ? previous.balls.length
          : t.balls.length;
      // Keep the next hidden slot covered until the departing ball has left the pipe.
      const first = Math.max(0, visibleCountBase - 3),
        shown = t.balls.slice(first);
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
          r: ballRadius,
        };
        if (front && i >= first) {
          this.ballPositions.push(position);
          const drop =
            g.phase === "intro" ? (1 - g.introProgress) * (150 - i * 14) : 0;
          this.ball(t.balls[i].type, x, by - drop, ballRadius);
        } else {
          this.ghostPositions.push(position);
          // Hidden identity remains available to QA only; opaque glass hides its contents.
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
      // A descending reveal boundary uncovers fixed slots; the balls never move.
      if (first > 0) {
        const frostTop = y - 6 - first * step;
        c.save();
        try {
          this.chamberPath(x, ty, y, radius);
          c.clip();
          const frost = c.createLinearGradient(x - radius, 0, x + radius, 0);
          frost.addColorStop(0, "#529b91");
          frost.addColorStop(0.18, "#c4ecdc");
          frost.addColorStop(0.48, "#8dcec0");
          frost.addColorStop(1, "#438b89");
          c.fillStyle = frost;
          c.fillRect(x - radius, frostTop, radius * 2, y - frostTop + 4);
          for (let i = 0; i < first; i++) {
            c.fillStyle = "#effff51c";
            c.beginPath();
            c.ellipse(
              x,
              y - ballRadius - 6 - i * step,
              ballRadius * 0.68,
              ballRadius * 0.7,
              0,
              0,
              Math.PI * 2,
            );
            c.fill();
          }
          c.strokeStyle = "#edfff5a0";
          c.lineWidth = 1.1;
          c.beginPath();
          c.moveTo(x - radius, frostTop);
          c.quadraticCurveTo(x, frostTop + 3, x + radius, frostTop);
          c.stroke();
          c.strokeStyle = "#ffffff4d";
          c.lineWidth = radius * 0.07;
          c.beginPath();
          c.moveTo(x - radius * 0.66, frostTop + 4);
          c.lineTo(x - radius * 0.66, y - 9);
          c.stroke();
          c.fillStyle = "#f4d480aa";
          c.fillRect(x - radius, y - 10, radius * 2, 3);
        } finally {
          c.restore();
        }
      }
      // The curved reflections sit on the front wall, above the balls, without covering their centers.
      c.strokeStyle = "#ffffff75";
      c.lineWidth = Math.max(0.8, radius * 0.07);
      c.beginPath();
      c.moveTo(x - radius * 0.7, ty + 16);
      c.bezierCurveTo(
        x - radius * 0.83,
        ty + height * 0.3,
        x - radius * 0.78,
        ty + height * 0.55,
        x - radius * 0.66,
        y - 12,
      );
      c.stroke();
      const topY = y - ballRadius - 6 - (t.balls.length - 1) * step;
      this.bodies.push({
        id: t.id,
        x: x - radius,
        y: ty - opening,
        w: radius * 2,
        h: height + opening,
        topY,
      });
      if (!front) continue;
      const hitRadius = Math.min(radius * 0.77, step * 0.48);
      if (g.hint === t.id)
        this.text(
          "✦",
          x + ballRadius * 0.65,
          topY - ballRadius * 0.65,
          13,
          "#3849b2",
          "center",
        );
      this.targets.push({ id: t.id, x, y: topY, r: hitRadius });
    }
    if (g.phase === "resolving") {
      const prev = g.state.history.at(-1),
        t = prev?.tubes.find(
          (t) =>
            t.balls.length >
            g.board.tubes.find((n) => n.id === t.id)!.balls.length,
        );
      if (t && prev && faceVisible(prev, view).has(t.id)) {
        const from = point(t),
          a = g.transitionProgress,
          ball = t.balls.at(-1)!;
        const sy = from.y - ballRadius - 6 - (t.balls.length - 1) * step;
        this.flightOrigin = { id: ball.id, x: from.x, y: sy };
        this.ball(
          ball.type,
          from.x + (w / 2 - from.x) * a,
          sy + (this.height - 122 - sy) * a,
          ballRadius,
        );
      }
    }
  }
  private homeTitle() {
    const c = this.ctx,
      scale = Math.min(1.05, (this.width - 40) / 272);
    const ge = [
      [
        [31, 0],
        [5, 26],
      ],
      [
        [31, 0],
        [57, 26],
      ],
      [
        [31, 20],
        [31, 52],
      ],
    ];
    // The strokes meet a circular outer contour: an open, round wordmark, not text on a disc.
    const ball = [
      [
        [10, 9],
        [25, 9],
      ],
      [
        [0, 31],
        [27, 31],
      ],
      [
        [8, 53],
        [27, 53],
      ],
      [
        [16, 9],
        [16, 53],
      ],
      [
        [28, 14],
        [60, 14],
      ],
      [
        [40, 1],
        [40, 57],
        [33, 61],
      ],
      [
        [48, 4],
        [53, 8],
      ],
      [
        [29, 24],
        [34, 30],
      ],
      [
        [34, 37],
        [25, 47],
      ],
      [
        [64, 26],
        [52, 33],
      ],
      [
        [43, 32],
        [60, 51],
      ],
    ];
    const ink = (
      paths: number[][][],
      weight: number,
      fill: string | CanvasGradient,
      dy = 0,
    ) => {
      c.fillStyle = fill;
      for (const path of paths) {
        for (let j = 1; j < path.length; j++) {
          const [x0, y0] = path[j - 1],
            [x1, y1] = path[j],
            d = Math.hypot(x1 - x0, y1 - y0) || 1,
            nx = ((-(y1 - y0) / d) * weight) / 2,
            ny = (((x1 - x0) / d) * weight) / 2;
          c.beginPath();
          c.moveTo(x0 + nx, y0 + ny + dy);
          c.lineTo(x1 + nx, y1 + ny + dy);
          c.lineTo(x1 - nx, y1 - ny + dy);
          c.lineTo(x0 - nx, y0 - ny + dy);
          c.closePath();
          c.fill();
        }
        for (const [x, y] of path) {
          c.beginPath();
          c.arc(x, y + dy, weight / 2, 0, Math.PI * 2);
          c.fill();
        }
      }
    };
    const cycle = this.mascotTime % 9000,
      t = Math.max(0, Math.min(1, (cycle - 1800) / 1600));
    this.titleAngle =
      cycle >= 1800 && cycle < 3400 ? t * t * (3 - 2 * t) * Math.PI * 2 : 0;
    c.save();
    try {
      c.translate(this.width / 2 - 128 * scale, 88);
      c.scale(scale, scale);
      const green = c.createLinearGradient(0, 0, 0, 57);
      green.addColorStop(0, "#55c98e");
      green.addColorStop(0.35, "#269766");
      green.addColorStop(1, "#126c51");
      // Use an actual bold Chinese glyph, filled once, rather than expanding its outline.
      c.font = "900 72px sans-serif";
      c.textAlign = "left";
      c.fillStyle = "#315744";
      c.fillText("转", -3, 62);
      c.fillStyle = green;
      c.fillText("转", -4, 59);
      c.save();
      try {
        c.translate(92 + 31, 26);
        c.rotate(this.titleAngle);
        c.translate(-31, -26);
        ink(ge, 11, "#315744", 4);
        ink(ge, 11, green);
      } finally {
        c.restore();
      }
      c.save();
      try {
        c.translate(184, 0);
        const orange = c.createLinearGradient(0, -5, 62, 67);
        orange.addColorStop(0, "#ffc84b");
        orange.addColorStop(0.45, "#ed8e21");
        orange.addColorStop(1, "#b8561d");
        c.strokeStyle = "#97622d";
        c.lineWidth = 5;
        c.beginPath();
        c.arc(31, 34, 36, 0, Math.PI * 2);
        c.stroke();
        c.strokeStyle = orange;
        c.beginPath();
        c.arc(31, 31, 36, 0, Math.PI * 2);
        c.stroke();
        c.beginPath();
        c.arc(31, 31, 35.5, 0, Math.PI * 2);
        c.clip();
        ink(ball, 8.5, "#9a632b", 3);
        ink(ball, 8.5, orange);
      } finally {
        c.restore();
      }
    } finally {
      c.restore();
    }
  }
  private homeDialog() {
    const w = this.width,
      h = this.height,
      c = this.ctx;
    this.buttons = [];
    c.fillStyle = "#233c4288";
    c.fillRect(0, 0, w, h);
    this.rect(14, 76, w - 28, h - 128, "#fff9e8", 22);
    this.text(
      this.homePanel === "records"
        ? "本机战绩"
        : this.homePanel === "difficulty"
          ? "选择难度"
          : this.homePanel === "replace"
            ? "开始新一局？"
            : "怎么玩",
      w / 2,
      116,
      25,
      "#294d3c",
      "center",
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
              this.game.start(i);
            }
          },
          false,
          i === 0,
        );
        this.text(
          `${[105, 126, 216][i]}颗 · ${p.types}类`,
          w / 2,
          y + 72,
          12,
          "#617366",
          "center",
        );
      });
    } else if (this.homePanel === "replace") {
      this.text("上次进度将被替换", w / 2, 190, 16, "#80603e", "center");
      this.text(
        `新局：${PRESETS[this.selectedDifficulty].name}`,
        w / 2,
        226,
        17,
        "#294d3c",
        "center",
      );
      this.button(
        "confirm-new",
        "开始新局",
        32,
        280,
        w - 64,
        52,
        () => {
          this.homePanel = null;
          this.game.start(this.selectedDifficulty);
        },
        false,
        true,
      );
      this.button("keep-saved", "继续上次", 32, 354, w - 64, 44, () => {
        this.homePanel = null;
        this.game.continueSaved();
      });
    } else if (this.homePanel === "records") {
      const records = this.game.records,
        pages = Math.max(1, Math.ceil(records.entries.length / 4));
      this.recordPage = Math.min(this.recordPage, pages - 1);
      this.text("仅本机 · 最近30局", w / 2, 145, 12, "#617366", "center");
      if (!records.available)
        this.text("记录暂时无法读取", w / 2, 208, 16, "#8b3e26", "center");
      else if (!records.entries.length)
        this.text(
          "完成第一局，留下战绩吧",
          w / 2,
          208,
          16,
          "#617366",
          "center",
        );
      records.entries
        .slice(this.recordPage * 4, this.recordPage * 4 + 4)
        .forEach((r, i) => {
          const y = 182 + i * 78,
            date = new Date(r.endedAt);
          this.rect(26, y, w - 52, 66, "#e6edda", 12);
          this.text(
            `${r.difficulty} · ${r.outcome === "won" ? "通关" : "未通关"}`,
            38,
            y + 24,
            16,
            "#294d3c",
          );
          this.text(
            `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
            w - 38,
            y + 24,
            12,
            "#617366",
            "right",
          );
          this.text(
            `${r.score}分  ·  ${r.cleared}/${r.total}颗  ·  ${Math.round(r.elapsedMs / 1000)}秒`,
            38,
            y + 49,
            13,
            "#617366",
          );
        });
      if (pages > 1) {
        this.button(
          "records-prev",
          "上一页",
          28,
          h - 151,
          100,
          36,
          () => this.recordPage--,
          this.recordPage === 0,
        );
        this.button(
          "records-next",
          "下一页",
          w - 128,
          h - 151,
          100,
          36,
          () => this.recordPage++,
          this.recordPage === pages - 1,
        );
      }
    } else {
      [
        "点正面最上球，三个同类消除",
        "左右转动，清空外层看里面",
        "撤销一步；每局有效时间5分钟",
        "简单 105颗 / 5类 / 5层",
        "普通 126颗 / 6类 / 5–7层",
        "困难 216颗 / 7类 / 5–7层",
      ].forEach((t, i) =>
        this.text(t, w / 2, 182 + i * 40, 14, "#294d3c", "center"),
      );
    }
    this.button(
      "home-dialog-close",
      "返回",
      28,
      h - 100,
      w - 56,
      40,
      () => (this.homePanel = null),
    );
  }
  private home() {
    const w = this.width,
      h = this.height;

    this.animateHome();
    this.homeTitle();
    this.button("records", "战绩", 18, 18, 60, 34, () => {
      this.homePanel = "records";
      this.recordPage = 0;
    });
    this.button("help", "玩法", 88, 18, 60, 34, () => {
      this.homePanel = "help";
    });

    const c = this.ctx;
    c.save();
    try {
      c.translate(w / 2, 264);
      c.scale(1.2, 1.2);
      c.translate(-w / 2, -264);
      // An elliptical toy display table carries the hero instead of a glowing platform.
      for (const [dy, rx, ry, color] of [
        [19, 114, 27, "#263e2933"],
        [10, 108, 31, "#805737"],
        [0, 108, 31, "#dfb879"],
        [-2, 99, 25, "#b99863"],
      ] as const) {
        c.beginPath();
        c.ellipse(w / 2, 333 + dy, rx, ry, 0, 0, Math.PI * 2);
        c.fillStyle = color;
        c.fill();
      }
      for (let i = 0; i < 3; i++) {
        const x = w / 2 + (i - 1) * 44,
          top = 204 + Math.abs(i - 1) * 10,
          bottom = top + 112;
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
    const mx = w / 2,
      my = 400 + Math.sin(this.mascotTime / 650) * 5;
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
        Math.PI * 2,
      );
      c.fill();
      c.fillStyle = "#25384e";
      c.beginPath();
      c.arc(mx + dx + 1, my - 2, 2.5, 0, Math.PI * 2);
      c.fill();
    }
    const y = Math.min(h - 180, 455);
    this.button(
      "start-menu",
      "开始游戏",
      28,
      y,
      w - 56,
      58,
      () => {
        this.homePanel = "difficulty";
      },
      false,
      true,
    );
    if (this.game.resume)
      this.button("resume", "继续上次", 28, y + 80, w - 56, 40, () =>
        this.game.continueSaved(),
      );
    this.trackObjects = [];
    c.save();
    try {
      c.beginPath();
      c.rect(0, h - 77, w, 65);
      c.clip();
      const phases = [0.02, 0.18, 0.43, 0.59, 0.89, 0.97],
        lanes = [0, 2, 1, 2, 0, 1];
      for (let i = 0; i < phases.length; i++) {
        const lane = lanes[i],
          x =
            ((this.mascotTime * [0.026, 0.032, 0.037][lane] +
              phases[i] * (w + 140)) %
              (w + 140)) -
            70,
          y = h - [31, 47, 61][lane],
          r = [11, 10, 13, 9, 12, 10][i];
        this.trackObjects.push({ x, y, r });
        if (i % 2 === 0) this.ball(i % 7, x, y, r);
        else {
          this.rect(x - 13, y - 12, 26, 23, i === 1 ? "#efad48" : "#66bba1", 6);
          this.rect(x - 11, y - 12, 22, 5, "#ffffff66", 3);
          c.fillStyle = "#4b6554";
          for (const dx of [-7, 7]) {
            c.beginPath();
            c.arc(x + dx, y + 12, 4, 0, Math.PI * 2);
            c.fill();
          }
        }
      }
    } finally {
      c.restore();
    }
    if (this.homePanel) {
      this.homeDialog();
      return;
    }
    if (this.game.message.includes("存档"))
      this.text(
        this.fit(this.game.message, 24),
        w / 2,
        h - 18,
        11,
        "#ffdc41",
        "center",
      );
  }
  private overlay() {
    const g = this.game,
      w = this.width,
      h = this.height;
    const won = g.phase === "result" && g.board.status === "won";
    const y = Math.max(142, h * 0.23),
      cardH = g.phase === "expired" ? 366 : 340;
    this.ctx.fillStyle = "#263d3266";
    this.ctx.fillRect(0, 120, w, h - 120);
    this.rect(20, y + 8, w - 40, cardH, "#334c3540", 26);
    this.rect(18, y - 2, w - 36, cardH, "#94764d", 26);
    this.rect(22, y + 2, w - 44, cardH - 8, "#fffbed", 22);
    this.rect(w / 2 - 38, y - 30, 76, 64, won ? "#f4b443" : "#9dcc9a", 20);
    this.text(
      won ? "★" : g.phase === "paused" ? "Ⅱ" : "!",
      w / 2,
      y + 16,
      36,
      "#294d3c",
      "center",
    );
    const title =
      g.phase === "result"
        ? won
          ? "漂亮！全清空"
          : "下次再挑战"
        : g.phase === "blocked"
          ? "槽位满了"
          : g.phase === "expired"
            ? "时间到"
            : g.phase === "ad"
              ? "广告加载中"
              : "休息一下";
    this.text(title, w / 2, y + 75, 27, "#294d3c", "center");
    if (g.phase === "result") {
      this.text(String(g.board.score), w / 2, y + 124, 36, "#be6425", "center");
      this.text(
        `消除 ${g.board.cleared.length} 颗`,
        w / 2,
        y + 149,
        13,
        "#5c7059",
        "center",
      );
    } else
      this.text(
        g.phase === "paused"
          ? "准备好了就继续"
          : g.phase === "blocked"
            ? "撤销一步，再想想"
            : g.phase === "ad"
              ? "计时已暂停"
              : "差一点！再试一次",
        w / 2,
        y + 117,
        14,
        "#5c7059",
        "center",
      );
    if (g.phase === "ad") return;
    let by = y + 170;
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
        42,
        fn,
        disabled,
        ["continue", "again", "undo-blocked"].includes(id),
      );
      by += 55;
    };
    if (g.phase === "paused") add("continue", "继续游戏", () => g.begin());
    if (g.phase === "blocked")
      add("undo-blocked", "撤销一步", () => g.undo(), !g.canUndo);
    if (g.phase === "expired") {
      add(
        "extend",
        g.ads.available ? "看广告 +30秒" : "广告未配置",
        () => void g.extend(),
        !g.ads.available || g.state.extensions >= CONFIG.maxExtensions,
      );
      this.text(g.ads.label, w / 2, by - 2, 10, "#5c7059", "center");
      by += 8;
    }
    if (g.phase !== "result") add("end", "结束本局", () => g.end());
    else
      add("again", "再来一局", () =>
        g.start(g.state.preset, (g.state.seed + 1) >>> 0),
      );
    add("home", "返回首页", () => g.home());
    if (/失败|中断|取消|未完成/.test(g.message))
      this.text(
        this.fit(g.message, Math.floor((w - 55) / 12)),
        w / 2,
        Math.min(h - 20, by + 21),
        12,
        "#8b3e26",
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
    if (this.game.locked) return;
    const target = [...this.targets]
      .reverse()
      .find((t) => Math.hypot(x - t.x, y - t.y) <= t.r);
    if (target) {
      this.misclickFeedback = null;
      this.game.pick(target.id);
      return;
    }
    // Non-top parts of a tube are never ball inputs.
    const body = [...this.bodies]
      .reverse()
      .find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    if (body) {
      this.misclickFeedback = {
        x,
        y,
        started: this.game.now(),
        session: this.game.state.session,
        view: this.game.state.view,
      };
      this.game.message = "只能取正面舱内最上方的球";
    }
  }
}
