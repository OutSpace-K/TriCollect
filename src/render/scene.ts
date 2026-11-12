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
  toolDialog: { session: string; resume: boolean } | null = null;
  guideOpen = false;
  guideStep = 0;
  celebrationMs = 0;
  private celebrationSession = "";
  private celebrationLast: number | null = null;
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
    this.celebrationLast = null;
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
  private homeLogo: CanvasImageSource | null = null;
  private homeHero: CanvasImageSource | null = null;
  setHomeArt(kind: "logo" | "hero", image: CanvasImageSource) {
    if (kind === "logo") this.homeLogo = image;
    else this.homeHero = image;
  }
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
  readonly homeGroupOffset = 16;
  private get trayTop() {
    return this.height - 119;
  }
  targets: {
    id: string;
    x: number;
    y: number;
    r: number;
    visualRadius: number;
  }[] = [];
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
    public displayScale = 1,
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
    c.font = `${size >= 14 ? "800" : "400"} ${size}px sans-serif`;
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
    h = Math.max(
      ["home-dialog-close", "tool-close", "home"].includes(id) ? 62 : 52,
      h,
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
      radius - 2,
    );
    const fill = c.createLinearGradient(0, y + 3, 0, y + h - 7);
    fill.addColorStop(0, dimmed ? "#d1d8cd" : primary ? "#b7f51b" : "#fffbd6");
    fill.addColorStop(
      0.48,
      dimmed ? "#b7c0b6" : primary ? "#8fdd09" : "#fff1b7",
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
    const outlinedText = (value: string, yy: number, size: number) => {
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
        id === "rotate-left" ? "向左转" : "向右转",
        y + h - 10,
        Math.min(15, w / 4.1),
      );
    } else if (id === "start-menu") {
      outlinedText(label, y + h / 2 + 9, 28);
    } else {
      outlinedText(label, y + h / 2 + 5, 16);
    }
    c.restore();
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
        x - r * 0.36,
        y - r * 0.4,
        r * 0.03,
        x + r * 0.15,
        y + r * 0.2,
        r * 1.15,
      );
      gradient.addColorStop(0, shade(0.48));
      gradient.addColorStop(0.3, shade(0.1));
      gradient.addColorStop(0.62, PALETTE[type]);
      gradient.addColorStop(0.88, shade(-0.14));
      gradient.addColorStop(1, shade(-0.35));
      c.fillStyle = gradient;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = shade(-0.36);
      c.lineWidth = Math.max(1, r * 0.055);
      c.stroke();
      c.strokeStyle = "#ffffff88";
      c.lineWidth = Math.max(1, r * 0.065);
      c.beginPath();
      c.arc(x, y, r * 0.88, Math.PI * 0.93, Math.PI * 1.86);
      c.stroke();
      c.fillStyle = "#ffffffed";
      c.beginPath();
      c.ellipse(
        x - r * 0.34,
        y - r * 0.43,
        r * 0.25,
        r * 0.17,
        -0.65,
        0,
        Math.PI * 2,
      );
      c.fill();
      c.fillStyle = "#ffffff38";
      c.beginPath();
      c.ellipse(
        x + r * 0.28,
        y + r * 0.54,
        r * 0.39,
        r * 0.14,
        -0.4,
        0,
        Math.PI * 2,
      );
      c.fill();
      this.text(
        SYMBOLS[type],
        x,
        y + r * 0.34,
        Math.max(7, r * 0.51),
        "#30244770",
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
    if (
      this.toolDialog &&
      (this.toolDialog.session !== g.state.session ||
        !["paused", "blocked"].includes(g.phase))
    )
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
    const secs = Math.ceil(g.state.remaining / 1000);
    this.text(
      `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`,
      74,
      51,
      29,
      g.state.remaining < 30000 ? "#ffd174" : "#ffffff",
      "center",
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
    this.text(`清空 ${g.board.cleared.length}/${total}`, 23, 93, 16, "#ffffff");
    this.rect(w - 72, 78, 50, 23, "#6b3821", 11);
    this.rect(w - 70, 79, 46, 20, "#fff4cd", 9);
    this.text(
      PRESETS[g.state.preset].name,
      w - 47,
      94,
      13,
      "#67351d",
      "center",
    );
    this.rect(23, 101, w - 46, 7, "#b6ecff", 4);
    this.rect(25, 103, w - 50, 3, "#4b9dcc", 2);
    if (progress > 0)
      this.rect(25, 102, Math.max(6, (w - 50) * progress), 5, "#9feeff", 3);
    const hidden = ["paused", "ad", "expired", "blocked", "result"].includes(
      g.phase,
    );
    if (hidden) {
      this.overlay();
      return;
    }
    const trayY = this.trayTop,
      boardBottom = trayY - 80;
    this.drawBoard(127, boardBottom);
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
    if (/失败|中断|预算|暂无|后续解|请先/.test(g.message))
      this.text(
        this.fit(
          g.message,
          Math.floor((w - (g.board.pocket?.length ? 200 : 124)) / 11),
        ),
        w - 22,
        trayY - 44,
        11,
        "#713e28",
        "right",
      );
    if (g.board.pocket?.length) {
      this.button(
        "return-ball",
        "免费放回",
        22,
        trayY - 76,
        140,
        44,
        () => g.returnBall(),
        g.locked,
        false,
        g.locked && !transientLock,
      );
      this.ball(g.board.pocket[0].type, 46, trayY - 51, 12);
    } else {
      this.button(
        "lift-ball",
        "",
        22,
        trayY - 76,
        64,
        44,
        () => this.openTool(),
        !["active", "blocked"].includes(g.phase),
        false,
        !["active", "blocked"].includes(g.phase) && !transientLock,
      );
      this.drawTool(54, trayY - 57);
      this.text(
        g.state.rewards.some((r) => r.kind === "lift" && r.redeemed)
          ? "已使用"
          : "寄存",
        54,
        trayY - 31,
        11,
        "#66371f",
        "center",
      );
    }
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
        "#29495e",
        "center",
      );
      this.button(
        "begin",
        g.phase === "intro" ? "跳过开场" : "开始 · 05:00",
        32,
        boardBottom - 58,
        w - 64,
        42,
        () => (g.phase === "intro" ? g.skipIntro() : g.begin()),
        false,
        true,
      );
    }
    if (this.guideOpen && ["intro", "ready"].includes(g.phase))
      this.guideOverlay();
    else this.guideOpen = false;
  }
  private drawTool(x: number, y: number) {
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
  private openTool() {
    const g = this.game;
    g.tick();
    if (!["active", "blocked"].includes(g.phase)) return;
    const resume = g.phase === "active";
    if (resume) g.pause();
    this.toolDialog = { session: g.state.session, resume };
  }
  private closeTool() {
    const resume = this.toolDialog?.resume;
    this.toolDialog = null;
    if (resume) this.game.begin();
  }
  private toolOverlay() {
    const g = this.game,
      w = this.width,
      h = this.height,
      y = Math.max(90, (h - 330) / 2);
    this.buttons = [];
    this.targets = [];
    this.bodies = [];
    this.ctx.fillStyle = "#173e6599";
    this.ctx.fillRect(0, 0, w, h);
    this.rect(18, y, w - 36, 330, "#294f70", 24);
    this.rect(22, y + 4, w - 44, 322, "#fffbed", 20);
    this.drawTool(w / 2, y + 38);
    this.text("寄存泡泡", w / 2, y + 83, 24, "#29495e", "center");
    const used = g.state.rewards.some((r) => r.kind === "lift" && r.redeemed);
    const allowed = !used && !g.board.pocket?.length && g.board.tray.length > 0;
    const lines = used
      ? ["本局已使用一次", "寄存球放回后也不会重复发放"]
      : !g.ads.available
        ? ["广告暂不可用，本次无法使用", "不会扣除次数，仍可免费撤销或继续"]
        : !g.board.tray.length
          ? ["先把一颗球放入暂存槽", "再使用道具腾出一格"]
          : ["完整观看广告，移出暂存槽末球", "每局一次 · 之后可免费放回"];
    lines.forEach((line, i) =>
      this.text(line, w / 2, y + 123 + i * 25, 13, "#4e6877", "center"),
    );
    const canRequest = allowed && g.ads.available;
    if (canRequest) {
      this.text(g.ads.label, w / 2, y + 181, 11, "#617366", "center");
      this.button(
        "tool-confirm",
        "看广告使用",
        40,
        y + 201,
        w - 80,
        44,
        () => {
          this.closeTool();
          void g.liftBall();
        },
        false,
        true,
      );
    }
    this.button(
      "tool-close",
      canRequest ? "暂不使用" : "知道了",
      40,
      y + 263,
      w - 80,
      44,
      () => this.closeTool(),
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
      frontY: Math.max(...corners.map((p) => p.y)) + padding * ratio + 24,
      axis: { ...axis },
      thickness: 23,
    };
    // A circular toy turntable surrounds the same rotating tube footprint.
    // Its artwork does not alter projection, touch targets, or tube ordering.
    const dishLeft = Math.min(...corners.map((p) => p.x)) - padding;
    const dishRight = Math.max(...corners.map((p) => p.x)) + padding;
    const footprint = g.board.tubes.map(point);
    const dishBack = Math.min(...footprint.map((p) => p.y)) - padding * ratio;
    const dishFront = Math.max(...footprint.map((p) => p.y)) + padding * ratio;
    const dishX = (dishLeft + dishRight) / 2;
    const dishY = (dishBack + dishFront) / 2;
    const dishRx = (dishRight - dishLeft) / 2;
    const dishRy = Math.max(12, (dishFront - dishBack) / 2);
    const oval = (
      yy: number,
      rx: number,
      ry: number,
      fill: string | CanvasGradient,
    ) => {
      c.beginPath();
      c.ellipse(dishX, yy, rx, ry, 0, 0, Math.PI * 2);
      c.fillStyle = fill;
      c.fill();
    };
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
          const palette = [
            ["#ffa9a2", "#e96c6b", "#a94350"],
            ["#ffe39a", "#ebba4d", "#ab792d"],
            ["#c5b6fa", "#9d85dd", "#63549b"],
            ["#a4e4ed", "#64becb", "#347e97"],
            ["#c9e7a8", "#91bd78", "#5d8753"],
          ][(t.q * 3 + t.r * 7) % 5];
          const lidSide = c.createLinearGradient(
            x - radius,
            ty - 5,
            x + radius,
            ty + 6,
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
          // An opaque amber fluted sleeve, independent of hidden ball types.
          const sleeve = c.createLinearGradient(x - radius, 0, x + radius, 0);
          sleeve.addColorStop(0, "#a85f29");
          sleeve.addColorStop(0.14, "#e8b15b");
          sleeve.addColorStop(0.32, "#ffe6a3");
          sleeve.addColorStop(0.62, "#f2c675");
          sleeve.addColorStop(1, "#b97836");
          c.fillStyle = sleeve;
          c.fillRect(x - radius, frostTop, radius * 2, y - frostTop + 4);
          // Fine molded ribs and a rounded lip replace the repeated ghost-ball circles.
          for (let rib = -3; rib <= 3; rib++) {
            const px = x + rib * radius * 0.23;
            c.strokeStyle = rib < 0 ? "#fff4c777" : "#9b5b2438";
            c.lineWidth = 1;
            c.beginPath();
            c.moveTo(px, frostTop + 5);
            c.quadraticCurveTo(
              px + radius * 0.05,
              (frostTop + y) / 2,
              px,
              y - 9,
            );
            c.stroke();
          }
          c.fillStyle = "#b87939";
          c.beginPath();
          c.ellipse(x, frostTop + 2, radius, 3.5, 0, 0, Math.PI * 2);
          c.fill();
          c.strokeStyle = "#fff2bd";
          c.lineWidth = 1.4;
          c.beginPath();
          c.ellipse(
            x,
            frostTop + 1,
            radius * 0.96,
            2.8,
            0,
            Math.PI,
            Math.PI * 2,
          );
          c.stroke();
          c.strokeStyle = "#fff8db99";
          c.lineWidth = radius * 0.09;
          c.beginPath();
          c.moveTo(x - radius * 0.58, frostTop + 8);
          c.lineTo(x - radius * 0.58, y - 12);
          c.stroke();
          c.fillStyle = "#fff3bc90";
          c.fillRect(x - radius, y - 9, radius * 2, 2);
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
      // Physical-pixel touch tolerance must survive short-screen scaling.
      // The resolver below excludes non-top balls and chooses the nearest top.
      const hitRadius = Math.max(ballRadius + 5, 22 / this.displayScale);
      if (g.hint === t.id)
        this.text(
          "✦",
          x + ballRadius * 0.65,
          topY - ballRadius * 0.65,
          13,
          "#3849b2",
          "center",
        );
      this.targets.push({
        id: t.id,
        x,
        y: topY,
        r: hitRadius,
        visualRadius: ballRadius,
      });
    }
    // Directional marks are decorative, never additional touch targets.
    const markY = dishFront + 10;
    for (const direction of [-1, 1]) {
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
          sy + (this.trayTop + 21 - sy) * a,
          ballRadius,
        );
      }
    }
  }
  private homeTitle() {
    const c = this.ctx,
      scale = Math.min(1, (this.width - 32) / 342);
    const cycle = this.mascotTime % 9000;
    const t = Math.max(0, Math.min(1, (cycle - 1800) / 1600));
    this.titleAngle =
      cycle >= 1800 && cycle < 3400 ? t * t * (3 - 2 * t) * Math.PI * 2 : 0;
    if (this.homeLogo) {
      const width = Math.min(this.width - 26, 420, this.height * 0.5);
      c.drawImage(
        this.homeLogo,
        (this.width - width) / 2,
        70,
        width,
        width * 0.5,
      );
      return;
    }
    // Each entry is a real stroke; there is no enclosing circle or font backing plate.
    type Stroke = number[][];
    // Wide, compact bubble lettering. Keep the radicals separated at small sizes.
    const zhuan: Stroke[] = [
      [
        [0, 12],
        [16, 10, 34, 12],
      ],
      [
        [18, 0],
        [10, 20, 6, 34],
        [20, 36, 34, 34],
      ],
      [
        [0, 58],
        [17, 56, 35, 58],
      ],
      [
        [19, 28],
        [20, 53, 19, 78],
      ],
      [
        [53, 12],
        [73, 10, 93, 12],
      ],
      [
        [51, 35],
        [72, 33, 96, 35],
      ],
      [
        [74, 0],
        [68, 29, 59, 55],
        [75, 57, 94, 55],
        [89, 61, 82, 66],
      ],
      [
        [63, 70],
        [69, 75, 76, 78],
      ],
    ];
    const ge: Stroke[] = [
      [
        [31, 4],
        [23, 22, 1, 33],
      ],
      [
        [31, 4],
        [43, 22, 64, 33],
      ],
      [
        [31, 37],
        [31, 55, 31, 72],
      ],
    ];
    // The two radicals stay legible; their curved extremities make the round silhouette.
    const qiu: Stroke[] = [
      [
        [5, 14],
        [14, 8, 24, 10],
      ],
      [
        [0, 39],
        [12, 36, 24, 38],
      ],
      [
        [5, 63],
        [15, 71, 25, 66],
      ],
      [
        [15, 12],
        [8, 39, 16, 65],
      ],
      [
        [43, 18],
        [65, 10, 87, 18],
      ],
      [
        [63, 0],
        [68, 39, 64, 74],
        [61, 81, 54, 77],
      ],
      [
        [85, -2],
        [89, 1],
      ],
      [
        [45, 31],
        [49, 36],
      ],
      [
        [51, 49],
        [48, 56, 42, 62],
      ],
      [
        [91, 32],
        [87, 39, 79, 43],
      ],
      [
        [68, 47],
        [79, 54, 92, 64],
        [88, 72, 82, 76],
      ],
    ];
    const paint = (
      paths: Stroke[],
      width: number,
      color: string | CanvasGradient,
      dy = 0,
      yaw = false,
      depth = 0,
    ) => {
      c.strokeStyle = color;
      c.lineWidth = width;
      c.lineCap = "round";
      c.lineJoin = "round";
      const point = (x: number, y: number) => {
        if (!yaw) return [x, y + dy];
        const xx = x - 31,
          yy = y - 26,
          z =
            -xx * Math.sin(this.titleAngle) + depth * Math.cos(this.titleAngle);
        const perspective = 1 + z / 220;
        return [
          31 +
            (xx * Math.cos(this.titleAngle) +
              depth * Math.sin(this.titleAngle)) /
              perspective,
          26 + yy / perspective + dy,
        ];
      };
      for (const path of paths) {
        c.beginPath();
        const start = point(path[0][0], path[0][1]);
        c.moveTo(start[0], start[1]);
        for (const v of path.slice(1)) {
          if (v.length === 2) {
            const p = point(v[0], v[1]);
            c.lineTo(p[0], p[1]);
          } else {
            const a = point(v[0], v[1]),
              b = point(v[2], v[3]);
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
      // One crisp navy outline, soft pastel body and restrained highlights.
      const jelly = (light: string, base: string) => {
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
            [17, 8, 30, 10],
          ],
          [
            [56, 10],
            [73, 8, 89, 10],
          ],
        ],
        1.8,
        "#fff5ee",
      );
      c.save();
      try {
        c.translate(124, 4);
        // Preserve the vertical-axis flip with shallow extrusion, never a flat spin.
        for (let depth = -2; depth <= -1; depth++)
          paint(ge, 24, "#244a6340", 2, true, depth);
        paint(ge, 28, "#fffbee", 0, true, 0);
        paint(ge, 25, "#60301f", 0, true, 0);
        paint(ge, 17, jelly("#d7ff69", "#8bcf09"), 0, true, 0);
        paint(
          [
            [
              [29, 9],
              [21, 22, 9, 28],
            ],
            [
              [29, 43],
              [29, 56, 29, 65],
            ],
          ],
          1.7,
          "#fffbed",
          0,
          true,
          0.6,
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
              [15, 8, 21, 9],
            ],
            [
              [46, 16],
              [65, 10, 83, 16],
            ],
          ],
          1.5,
          "#fffbed",
        );
      } finally {
        c.restore();
      }
    } finally {
      c.restore();
    }
  }
  /** Original miniature toys, no emoji/font or external artwork dependence. */
  private trackToy(kind: number, x: number, y: number, size: number) {
    const c = this.ctx;
    c.save();
    try {
      c.translate(x, y);
      c.scale(size / 18, size / 18);
      const ellipse = (
        x: number,
        y: number,
        rx: number,
        ry: number,
        fill: string,
      ) => {
        c.fillStyle = fill;
        c.beginPath();
        c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        c.fill();
      };
      const line = (points: number[][], color: string, width: number) => {
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
        // wind-up duck: beak, sculpted wing and key
        line(
          [
            [-13, 0],
            [-21, -2],
            [-21, -8],
          ],
          "#b58c50",
          3,
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
            [1, -1],
          ],
          "#fff0a4",
          1.4,
        );
      } else if (kind === 1) {
        // tiny locomotive, chimney and brass wheel hubs
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
            [10, 10],
          ],
          "#9fb4ad",
          2,
        );
      } else if (kind === 2) {
        // snail with spiral porcelain shell, antenna eyes and smile
        ellipse(0, 7, 20, 6, "#72b895");
        ellipse(14, 0, 5, 9, "#9ed9ad");
        line(
          [
            [12, -3],
            [10, -12],
          ],
          "#65a881",
          2,
        );
        line(
          [
            [17, -3],
            [20, -11],
          ],
          "#65a881",
          2,
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
          const xx = -7 + Math.cos(a) * r,
            yy = -3 + Math.sin(a) * r;
          if (a === 0) c.moveTo(xx, yy);
          else c.lineTo(xx, yy);
        }
        c.stroke();
        ellipse(-11, -10, 3, 2, "#ffe3df");
        line(
          [
            [15, 3],
            [18, 4],
            [20, 2],
          ],
          "#46876b",
          1,
        );
      } else if (kind === 3) {
        // red-nosed toy plane: wings, cockpit, propeller and tail
        ellipse(-1, 0, 21, 6, "#ed8351");
        ellipse(-3, -2, 15, 4, "#ffb76a");
        line(
          [
            [-4, -11],
            [3, 11],
          ],
          "#f6cf70",
          8,
        );
        ellipse(2, -4, 5, 4, "#5eabb5");
        ellipse(1, -5, 3, 2, "#b8eef1");
        line(
          [
            [-16, -2],
            [-21, -9],
          ],
          "#e4684f",
          5,
        );
        line(
          [
            [21, -9],
            [21, 9],
          ],
          "#526c6d",
          2,
        );
        ellipse(20, 0, 3, 3, "#ffe1a4");
      } else {
        // little plush bunny on a wheeled board
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
  private closeGuide() {
    this.guideOpen = false;
    if (this.homePanel === "help") this.homePanel = null;
    this.game.acknowledgeGuide();
  }
  private guideOverlay() {
    const c = this.ctx,
      w = this.width,
      h = this.height,
      top = Math.max(74, (h - 454) / 2);
    this.buttons = [];
    this.targets = [];
    c.fillStyle = "#173e6599";
    c.fillRect(0, 0, w, h);
    this.rect(17, top, w - 34, 466, "#254e6b", 25);
    this.rect(22, top + 5, w - 44, 454, "#fff9e8", 21);
    this.text("怎么玩", w / 2, top + 43, 25, "#29495e", "center");
    const labels = ["只取正面最上球", "三颗同色，自动消除", "转一面，逐层揭开"];
    this.text(labels[this.guideStep], w / 2, top + 84, 19, "#29495e", "center");
    const cx = w / 2,
      cy = top + 175;
    if (this.guideStep === 0) {
      this.rect(cx - 29, cy - 59, 58, 130, "#b8e3df", 18);
      this.rect(cx - 25, cy - 55, 50, 122, "#ecf6ea", 15);
      for (let j = 0; j < 3; j++) this.ball(j, cx, cy - 31 + j * 36, 17);
      this.text("←", cx + 63, cy - 23, 32, "#e4803f", "center");
    } else if (this.guideStep === 1) {
      this.rect(cx - 102, cy - 27, 204, 61, "#c2dddd", 18);
      for (let j = 0; j < 3; j++) this.ball(4, cx + (j - 1) * 58, cy + 3, 23);
      this.text("★", cx, cy + 77, 33, "#e8a931", "center");
    } else {
      for (let i = 0; i < 3; i++) {
        this.rect(
          cx - 64 + i * 43,
          cy - 35 + Math.abs(i - 1) * 10,
          37,
          92,
          "#b4dadd",
          12,
        );
        this.ball(i, cx - 46 + i * 43, cy - 13 + Math.abs(i - 1) * 10, 15);
      }
      this.text("←", cx - 96, cy + 16, 29, "#258cae", "center");
      this.text("→", cx + 96, cy + 16, 29, "#258cae", "center");
    }
    const captions = [
      "盖着的管暂时不能取",
      "暂存槽只有七格，留点空位",
      "旋转免费 · 撤销一步 · 提示免费",
    ];
    this.text(captions[this.guideStep], cx, top + 280, 12, "#587183", "center");
    for (let i = 0; i < 3; i++)
      this.rect(
        cx - 26 + i * 20,
        top + 298,
        12,
        5,
        i === this.guideStep ? "#ecac34" : "#c2d7dc",
        3,
      );
    this.button(
      "guide-next",
      this.guideStep === 2 ? "我会了" : "下一步",
      42,
      top + 327,
      w - 84,
      45,
      () => {
        if (this.guideStep === 2) this.closeGuide();
        else this.guideStep++;
      },
      false,
      true,
    );
    this.button(
      "home-dialog-close",
      "返回",
      w / 2 - 38,
      top + 390,
      76,
      28,
      () => this.closeGuide(),
    );
  }
  private celebration() {
    const c = this.ctx,
      g = this.game;
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
          this.celebrationMs +
            Math.max(0, Math.min(64, now - this.celebrationLast)),
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
        const t = this.celebrationMs / 1000,
          x = ((i * 83 + 29) % this.width) + Math.sin(t * 3 + i) * 18,
          y = ((i * 47) % 220) - 100 + t * (90 + (i % 5) * 15);
        c.fillStyle = ["#ffd249", "#f38877", "#69d4d4", "#a997e6"][i % 4];
        c.fillRect(x, y, 4 + (i % 3) * 2, 5 + (i % 4) * 2);
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
      "#ffffff",
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
              this.game.startRandom(i);
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
        "#29495e",
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
          this.game.startRandom(this.selectedDifficulty);
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
          const y = 170 + i * 70,
            date = new Date(r.endedAt);
          this.rect(26, y, w - 52, 62, "#e6edda", 12);
          this.text(
            `${r.difficulty} · ${r.outcome === "won" ? "通关" : "未通关"}`,
            38,
            y + 24,
            16,
            "#29495e",
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
          h - 206,
          100,
          36,
          () => this.recordPage--,
          this.recordPage === 0,
        );
        this.button(
          "records-next",
          "下一页",
          w - 128,
          h - 206,
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
        this.text(t, w / 2, 182 + i * 40, 14, "#29495e", "center"),
      );
    }
    this.button(
      "home-dialog-close",
      "返回",
      28,
      this.homePanel === "records" ? h - 140 : Math.min(h - 128, 460),
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
        heroHeight,
      );
    } else {
      c.save();
      try {
        c.translate(0, this.homeGroupOffset);
        c.translate(w / 2, 264);
        c.scale(Math.min(1.38, (w - 40) / 188), 1.38);
        c.translate(-w / 2, -264);
        // An elliptical toy display table carries the hero instead of a glowing platform.
        for (const [dy, rx, ry, color] of [
          [19, 114, 27, "#263e2933"],
          [10, 108, 31, "#c75f3f"],
          [0, 108, 31, "#ffdca0"],
          [-2, 99, 25, "#fff0c2"],
        ] as const) {
          c.beginPath();
          c.ellipse(w / 2, 333 + dy, rx, ry, 0, 0, Math.PI * 2);
          c.fillStyle = color;
          c.fill();
        }
        for (let i = 0; i < 5; i++) {
          const x = w / 2 + (i - 2) * 36,
            top = 204 + Math.abs(i - 2) * 10,
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
      const mx = w / 2 - 94,
        my = 375 + this.homeGroupOffset + Math.sin(this.mascotTime / 650) * 5;
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
          Math.PI * 2,
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
      "开始游戏",
      28,
      y,
      w - 56,
      this.game.resume ? 66 : 74,
      () => {
        this.homePanel = "difficulty";
      },
      false,
      true,
    );
    if (this.game.resume)
      this.button("resume", "继续上次", 28, y + 78, w - 56, 40, () =>
        this.game.continueSaved(),
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
            h - 65 + lane * 45,
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
      const phases = [0.03, 0.23, 0.47, 0.73, 0.53],
        lanes = [0, 1, 2, 1, 0];
      for (let i = 0; i < phases.length; i++) {
        const speed = [0.027, -0.046, 0.017, -0.046, 0.027][i],
          // Same-lane pairs keep half a loop of headway. Small independent speed
          // variations add motion without letting them stack into one silhouette.
          sway = [8, 12, 0, -12, -8][i] * Math.sin(this.mascotTime / 2000 + i),
          x =
            ((((this.mascotTime * speed + sway + phases[i] * (w + 140)) %
              (w + 140)) +
              (w + 140)) %
              (w + 140)) -
            70,
          y =
            h -
            (compactTrack ? [60, 38, 18] : [87, 52, 24])[lanes[i]] -
            Math.abs(Math.sin(this.mascotTime / 330 + i)) * 5,
          r = [23, 20, 21, 19, 17][i];
        this.trackObjects.push({ x, y, r });
        c.save();
        try {
          c.translate(x, y);
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
        "center",
      );
  }
  private overlay() {
    const g = this.game,
      w = this.width,
      h = this.height;
    const won = g.phase === "result" && g.board.status === "won";
    const y = Math.max(142, h * 0.23),
      cardH = ["expired", "blocked"].includes(g.phase) ? 436 : 368;
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
      won ? "★" : g.phase === "paused" ? "Ⅱ" : "!",
      w / 2,
      y + 16,
      36,
      "#29495e",
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
    this.text(title, w / 2, y + 75, 27, "#29495e", "center");
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
      by += 64;
    };
    if (g.phase === "paused") add("continue", "继续游戏", () => g.begin());
    if (g.phase === "blocked")
      add("undo-blocked", "撤销一步", () => g.undo(), !g.canUndo);
    if (g.phase === "blocked")
      add("lift-blocked", "寄存道具", () => this.openTool(), false);
    if (g.phase === "expired") {
      add(
        "extend",
        g.ads.available ? "看广告 +30秒" : g.ads.label,
        () => void g.extend(),
        !g.ads.available || g.state.extensions >= CONFIG.maxExtensions,
      );
      this.text(g.ads.label, w / 2, y + 151, 11, "#5c7059", "center");
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
    const nearest = [...this.targets].sort(
      (a, b) => Math.hypot(x - a.x, y - a.y) - Math.hypot(x - b.x, y - b.y),
    );
    // A visible top ball always wins. Enlarged halos must never turn a tap on
    // a lower/hidden ball into a different pick, or favor paint order in overlaps.
    const direct = nearest.find(
      (t) => Math.hypot(x - t.x, y - t.y) <= t.visualRadius,
    );
    const blocked =
      !direct &&
      [...this.ballPositions, ...this.ghostPositions].some(
        (b) => Math.hypot(x - b.x, y - b.y) <= b.r,
      );
    const target =
      direct ??
      (!blocked
        ? nearest.find((t) => Math.hypot(x - t.x, y - t.y) <= t.r)
        : undefined);
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
