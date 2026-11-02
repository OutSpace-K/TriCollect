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
};
export class Scene {
  buttons: Button[] = [];
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
    color = "#f5f7ff",
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
    const primary = accent || id === "hint" || id === "again";
    const fill = disabled ? "#464a79" : primary ? "#ffdb39" : "#6554ed";
    this.rect(x - 2, y - 2, w + 4, h + 10, "#111735", 16);
    this.rect(
      x,
      y + 5,
      w,
      h,
      disabled ? "#303657" : primary ? "#b66a14" : "#342594",
      14,
    );
    this.rect(x, y, w, h, fill, 14);
    this.rect(
      x + 5,
      y + 3,
      w - 10,
      Math.min(10, h / 4),
      disabled ? "#ffffff08" : "#ffffff38",
      7,
    );
    this.text(
      label,
      x + w / 2,
      y + h / 2 + 5,
      id.startsWith("rotate") ? 24 : 15,
      disabled ? "#c0c4db" : primary ? "#242046" : "#ffffff",
      "center",
    );
    this.buttons.push({ id, x, y, w, h, act, disabled });
  }
  private ball(type: number, x: number, y: number, r: number, alpha = 1) {
    const c = this.ctx;
    c.save();
    try {
      c.globalAlpha = alpha;
      c.fillStyle = "#73503530";
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
      gradient.addColorStop(1, shade(-0.52));
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
    shade.addColorStop(0, "#b9c4db");
    shade.addColorStop(0.28, "#8390ae");
    shade.addColorStop(0.72, "#556382");
    shade.addColorStop(1, "#303d5d");
    c.fillStyle = shade;
    c.strokeStyle = "#6d80a9";
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
    c.fillStyle = "#253469";
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
    bg.addColorStop(0, "#3932a2");
    bg.addColorStop(1, "#101d49");
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
    this.rect(16, 16, 116, 51, "#111735", 16);
    this.rect(19, 19, 110, 45, "#f2fbff", 13);
    const secs = Math.ceil(g.state.remaining / 1000);
    this.text(
      `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`,
      74,
      51,
      29,
      g.state.remaining < 30000 ? "#c72b51" : "#18234f",
      "center",
    );
    const total =
      ((PRESETS[g.state.preset].side * (PRESETS[g.state.preset].side + 1)) /
        2) *
      5;
    const progress = g.board.cleared.length / total;
    this.text(`清空 ${g.board.cleared.length}/${total}`, 20, 91, 13, "#ecf6ff");
    this.rect(20, 101, w - 40, 9, "#101731", 5);
    if (progress > 0)
      this.rect(20, 101, Math.max(9, (w - 40) * progress), 9, "#42e6cb", 5);
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
    this.rect(14, trayY - 8, w - 28, 60, "#101735", 17);
    this.rect(17, trayY - 5, w - 34, 53, "#394887", 14);
    const cell = (w - 44) / 7;
    for (let i = 0; i < 7; i++) {
      this.rect(22 + i * cell, trayY, cell - 4, 43, "#15244f", 9);
      const ball = g.board.tray[i];
      if (ball)
        this.ball(ball.type, 22 + i * cell + (cell - 4) / 2, trayY + 21, 15);
    }
    const bw = (w - 65) / 4;
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
        "#ffdf62",
        "center",
      );
    if (g.phase === "intro" || g.phase === "ready") {
      this.rect(
        18,
        Math.max(100, boardBottom - 103),
        w - 36,
        92,
        "#18234f",
        18,
      );
      this.text(
        "点顶球 · 三颗同色消除",
        w / 2,
        boardBottom - 73,
        13,
        "#f5f7ff",
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
    const layout = projection(n, w, top, bottom, angle);
    const { radius, height, step, ballRadius, point, axis } = layout;
    this.rotationAxis = axis;
    this.projectionScale = { x: layout.lane, z: layout.zScale };
    const visible = turning ? new Set<string>() : faceVisible(g.board, view);
    this.renderedFace = view;
    this.renderedIds = [...visible];
    for (let i = 0; i < 3; i++) {
      this.rect(
        w / 2 - 35 + i * 26,
        top - 20,
        18,
        6,
        i === view ? "#ffdc41" : "#6472b4",
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
      frontY: Math.max(...corners.map((p) => p.y)) + padding * ratio + 13,
      axis: { ...axis },
      thickness: 9,
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
    dish(19, "#080e3966");
    dish(13, "#182459");
    dish(4, "#54c6eb");
    dish(3, "#344d91", 2.2);
    const opening = Math.min(
      9,
      Math.max(4, (radius * layout.zScale) / layout.lane),
    );
    c.fillStyle = "#7a60551c";
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
        ty = y - height,
        front = visible.has(t.id);
      // Optical backdrop transmission is composited independently of hidden game contents.
      c.save();
      try {
        this.chamberPath(x, ty, y, radius);
        c.clip();
        this.transmittedBackdrop(x - radius, ty, radius * 2, height);
        const glass = c.createLinearGradient(x - radius, 0, x + radius, 0);
        glass.addColorStop(0, "#6a919b8c");
        glass.addColorStop(0.09, "#f4ffffd9");
        glass.addColorStop(0.19, "#e5fbff30");
        glass.addColorStop(0.65, "#ffffff08");
        glass.addColorStop(0.85, "#a2d3dc30");
        glass.addColorStop(1, "#647b8a88");
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
      c.strokeStyle = "#8aa1a3aa";
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
      rim.addColorStop(0.22, "#d6ecec");
      rim.addColorStop(0.6, "#91b3bc");
      rim.addColorStop(1, "#5d7e8b");
      c.fillStyle = rim;
      c.beginPath();
      c.ellipse(x, ty + 4, radius * 0.98, opening, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#b6d6dc88";
      c.fillRect(x - radius * 0.86, ty + 1, radius * 1.72, 7);
      c.fillStyle = rim;
      c.beginPath();
      c.ellipse(x, ty - 1, radius * 0.98, opening, 0, 0, Math.PI * 2);
      c.fill();
      const well = c.createLinearGradient(x, ty - opening, x, ty + opening);
      well.addColorStop(0, "#557684");
      well.addColorStop(0.5, "#9fb9bc");
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
        Math.PI * 1.9,
      );
      c.stroke();
      const foot = c.createLinearGradient(x - radius, y - 7, x + radius, y + 4);
      foot.addColorStop(0, "#f7ffffc9");
      foot.addColorStop(0.35, "#b6d3d577");
      foot.addColorStop(1, "#73949caa");
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
            g.phase === "intro" ? (1 - g.introProgress) * (145 - i * 20) : 0;
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
      // The curved reflections sit on the front wall, above the balls, without covering their centers.
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
      scale = Math.min(1, (this.width - 48) / 230),
      left = this.width / 2 - 98 * scale;
    const parts = [
      { text: "转个", x: 0, size: 42, y: 130 },
      { text: "“", x: 84, size: 28, y: 125 },
      { text: "球", x: 108, size: 64, y: 140 },
      { text: "”", x: 172, size: 28, y: 125 },
    ];
    c.save();
    try {
      c.textAlign = "left";
      c.lineJoin = "round";
      for (const part of parts) {
        const x = left + part.x * scale,
          y = part.y,
          size = part.size * scale;
        c.font = `900 ${size}px sans-serif`;
        c.fillStyle = "#8f6e8050";
        c.fillText(part.text, x + 2, y + 7);
        for (let depth = 4; depth >= 1; depth--) {
          c.fillStyle = part.text === "球" ? "#b64b15" : "#203591";
          c.fillText(part.text, x + depth * 0.35, y + depth);
        }
        c.lineWidth = 6 * scale;
        c.strokeStyle = "#141d47";
        c.strokeText(part.text, x, y);
        const shine = c.createLinearGradient(0, y - size, 0, y);
        if (part.text === "球") {
          shine.addColorStop(0, "#ffffad");
          shine.addColorStop(0.25, "#ffe33d");
          shine.addColorStop(0.53, "#ffa62b");
          shine.addColorStop(1, "#f66a2e");
        } else {
          shine.addColorStop(0, "#ffffff");
          shine.addColorStop(0.35, "#7fffee");
          shine.addColorStop(1, "#2cbadf");
        }
        c.fillStyle = shine;
        c.fillText(part.text, x, y);
      }
    } finally {
      c.restore();
    }
  }
  private home() {
    const w = this.width,
      h = this.height;

    this.homeTitle();
    this.rect(w / 2 - 46, 159, 92, 5, "#35ead8", 3);
    const c = this.ctx;
    c.save();
    try {
      c.translate(w / 2, 264);
      c.scale(1.24, 1.24);
      c.translate(-w / 2, -264);
      this.rect(w / 2 - 106, 331, 212, 15, "#111735", 12);
      this.rect(w / 2 - 106, 327, 212, 9, "#42dce6", 7);
      for (let i = 0; i < 3; i++) {
        const x = w / 2 + (i - 1) * 61,
          top = 202 + Math.abs(i - 1) * 12,
          bottom = top + 112;
        this.chamberPath(x, top, bottom, 23);
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
        c.fillStyle = "#bec9d5";
        c.beginPath();
        c.ellipse(x, bottom, 23, 4, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = "#d3eaed";
        c.beginPath();
        c.ellipse(x, top, 22, 4, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = "#91b1ba";
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
    const y = Math.max(390, Math.min(h - 245, 460));
    this.button(
      "start-0",
      "开始 · 初见",
      28,
      y,
      w - 56,
      58,
      () => this.game.start(0),
      false,
      true,
    );
    this.button("start-1", "探索", 28, y + 76, (w - 70) / 2, 44, () =>
      this.game.start(1),
    );
    this.button(
      "start-2",
      "深入",
      42 + (w - 70) / 2,
      y + 76,
      (w - 70) / 2,
      44,
      () => this.game.start(2),
    );
    if (this.game.resume)
      this.button("resume", "继续上次", 28, y + 136, w - 56, 40, () =>
        this.game.continueSaved(),
      );
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
    this.ctx.fillStyle = "#080c2699";
    this.ctx.fillRect(0, 120, w, h - 120);
    this.rect(20, y + 8, w - 40, cardH, "#090f2d", 26);
    this.rect(18, y - 2, w - 36, cardH, "#7885ed", 26);
    this.rect(22, y + 2, w - 44, cardH - 8, "#252b65", 22);
    this.rect(w / 2 - 38, y - 30, 76, 64, won ? "#ffda3d" : "#44dded", 20);
    this.text(
      won ? "★" : g.phase === "paused" ? "Ⅱ" : "!",
      w / 2,
      y + 16,
      36,
      "#18234f",
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
    this.text(title, w / 2, y + 75, 27, "#ffffff", "center");
    if (g.phase === "result") {
      this.text(String(g.board.score), w / 2, y + 124, 36, "#ffdf43", "center");
      this.text(
        `消除 ${g.board.cleared.length} 颗`,
        w / 2,
        y + 149,
        13,
        "#bacaf9",
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
        "#ced9ff",
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
      this.text(g.ads.label, w / 2, by - 2, 10, "#ced9ff", "center");
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
        "#ffdf62",
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
