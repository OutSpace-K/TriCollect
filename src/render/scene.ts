import { projection } from "./projection";
import {
  PALETTE,
  SYMBOLS,
  PRESETS,
  CONFIG,
  VERSION,
  DISPLAY_NAME,
  FACES,
} from "../config";
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
    color = "#44352e",
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
      disabled ? "#e7ddd0" : accent || id === "hint" ? "#c94322" : "#6534ce",
    );
    this.text(
      label,
      x + w / 2,
      y + h / 2 + 5,
      14,
      disabled ? "#88796a" : "#ffffff",
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
      gradient.addColorStop(0, shade(0.72));
      gradient.addColorStop(0.25, shade(0.26));
      gradient.addColorStop(0.5, PALETTE[type]);
      gradient.addColorStop(0.78, shade(-0.12));
      gradient.addColorStop(1, shade(-0.46));
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
        r * 0.48,
      );
      glint.addColorStop(0, "#ffffffdc");
      glint.addColorStop(0.38, "#ffffff84");
      glint.addColorStop(1, "#ffffff00");
      c.fillStyle = glint;
      c.beginPath();
      c.ellipse(
        x - r * 0.31,
        y - r * 0.4,
        r * 0.48,
        r * 0.4,
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
    shade.addColorStop(0, "#e8dfd1");
    shade.addColorStop(0.28, "#c3b7a6");
    shade.addColorStop(0.72, "#9a8d7b");
    shade.addColorStop(1, "#746756");
    c.fillStyle = shade;
    c.strokeStyle = "#897a65";
    c.lineWidth = 1.1;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  }
  private chamberPath(x: number, top: number, y: number, r: number) {
    const c = this.ctx,
      bevel = Math.min(9, r * 0.3);
    c.beginPath();
    c.moveTo(x - r + bevel, top);
    c.lineTo(x + r - bevel, top);
    c.quadraticCurveTo(x + r, top, x + r, top + bevel);
    c.lineTo(x + r, y - bevel);
    c.lineTo(x + r - bevel, y);
    c.lineTo(x - r + bevel, y);
    c.lineTo(x - r, y - bevel);
    c.lineTo(x - r, top + bevel);
    c.quadraticCurveTo(x - r, top, x - r + bevel, top);
    c.closePath();
  }
  private transmittedBackdrop(x: number, y: number, w: number, h: number) {
    const c = this.ctx;
    c.fillStyle = "#f8f2e4";
    c.fillRect(x, y, w, h);
    if (this.background) {
      const scale = Math.max(this.width / 600, this.height / 1040),
        left = (this.width - 600 * scale) / 2,
        top = (this.height - 1040 * scale) / 2;
      c.drawImage(
        this.background,
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
    bg.addColorStop(0, "#fff9ed");
    bg.addColorStop(1, "#f4e4cf");
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    if (this.background) {
      const scale = Math.max(w / 600, h / 1040);
      c.drawImage(
        this.background,
        (w - 600 * scale) / 2,
        (h - 1040 * scale) / 2,
        600 * scale,
        1040 * scale,
      );
    }
    this.button(
      "sound-toggle",
      g.state.sound ? "声音：开" : "声音：关",
      g.phase === "home" ? w - 106 : w / 2 - 42,
      g.phase === "home" ? 18 : 100,
      84,
      34,
      () => g.toggleSound(),
    );
    if (g.phase === "home") {
      this.home();
      return;
    }
    this.text("旋转 · 收集 · 消除", 22, 35, 12, "#786254");
    this.text(DISPLAY_NAME, 22, 66, 26, "#3c302a");
    this.text(
      PRESETS[g.state.preset].name + " · " + g.state.seed,
      22,
      88,
      11,
      "#786254",
    );
    this.text(
      `${Math.ceil(g.state.remaining / 1000 / 60) - (Math.ceil(g.state.remaining / 1000) % 60 === 0 ? 0 : 1)}:${String(Math.ceil(g.state.remaining / 1000) % 60).padStart(2, "0")}`,
      w - 24,
      46,
      28,
      g.state.remaining < 30_000 ? "#fb826f" : "#3c302a",
      "right",
    );
    this.text(
      `${g.board.score} 分  ·  +${g.state.added / 1000}秒`,
      w - 24,
      71,
      12,
      "#786254",
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
    this.drawMisclick();
    this.button(
      "pause",
      "暂停",
      w - 77,
      88,
      55,
      34,
      () => {
        g.pause();
      },
      !["active", "resolving", "rotating"].includes(g.phase),
    );
    this.text(
      "轻触正面顶球 · 横滑转动球仓",
      w / 2,
      boardBottom + 10,
      12,
      "#786254",
      "center",
    );
    this.text("三同消除", 22, trayY - 7, 12, "#786254");
    const cell = (w - 44) / 7;
    for (let i = 0; i < 7; i++) {
      this.rect(22 + i * cell, trayY, cell - 4, 43, "#eadbc8", 9);
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
    this.text(
      this.fit(g.message, Math.floor((w - 40) / 11)),
      w / 2,
      h - 20,
      11,
      "#6f5a4d",
      "center",
    );
    if (g.phase === "intro" || g.phase === "ready") {
      this.rect(
        18,
        Math.max(100, boardBottom - 103),
        w - 36,
        92,
        "#fff9ed",
        18,
      );
      this.text(
        "只取顶部 · 三同消除 · 逐层揭开",
        w / 2,
        boardBottom - 73,
        13,
        "#44352e",
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
    this.text(
      `第 ${view + 1} 面 / 3 · ${face.name}`,
      w / 2,
      top + 13,
      15,
      face.color,
      "center",
    );
    this.text(
      `${g.board.tubes.filter((t) => t.balls.length).length} 管待清空 · 仅正面顶部可取`,
      w / 2,
      top + 34,
      11,
      "#786254",
      "center",
    );
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
    c.beginPath();
    corners.forEach((t, i) =>
      i ? c.lineTo(t.x, t.y + 7) : c.moveTo(t.x, t.y + 7),
    );
    c.closePath();
    c.fillStyle = face.shell;
    c.fill();
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
        glass.addColorStop(0, face.color + "66");
        glass.addColorStop(0.09, "#efffffda");
        glass.addColorStop(0.19, "#d6f5ff38");
        glass.addColorStop(0.65, "#ffffff08");
        glass.addColorStop(0.85, face.color + "22");
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
      // Beveled jewel socket, metallic far edge and inset opening.
      const metal = c.createLinearGradient(
        x - radius,
        ty - opening,
        x + radius,
        ty + opening,
      );
      metal.addColorStop(0, "#fff8d8");
      metal.addColorStop(0.45, "#d5dfea");
      metal.addColorStop(1, "#8b939f");
      c.fillStyle = metal;
      c.beginPath();
      c.moveTo(x - radius, ty + 2);
      c.lineTo(x - radius * 0.63, ty - opening * 0.65);
      c.lineTo(x + radius * 0.52, ty - opening * 0.65);
      c.lineTo(x + radius, ty + 2);
      c.lineTo(x + radius * 0.68, ty + opening);
      c.lineTo(x - radius * 0.68, ty + opening);
      c.closePath();
      c.fill();
      c.stroke();
      const well = c.createLinearGradient(
        x - radius,
        ty - opening,
        x + radius,
        ty + opening,
      );
      well.addColorStop(0, "#768b9e");
      well.addColorStop(0.4, face.shell);
      well.addColorStop(1, "#f4ffff");
      c.fillStyle = well;
      c.beginPath();
      c.ellipse(x, ty + 2, radius * 0.72, opening * 0.58, 0, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = "#ffffffdd";
      c.beginPath();
      c.moveTo(x - radius * 0.55, ty + opening * 0.8);
      c.lineTo(x + radius * 0.55, ty + opening * 0.8);
      c.stroke();
      c.fillStyle = metal;
      this.chamberPath(x, y - 7, y + 3, radius);
      c.fill();
      c.fillStyle = face.color + "66";
      c.fillRect(x - radius * 0.6, y - 1, radius * 1.2, 1.5);
      if (!front)
        this.rearOpenings.push({
          id: t.id,
          x,
          y: ty + 3,
          rx: radius,
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
        c.fillStyle = "#ffffff14";
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
      c.strokeStyle = "#ffffff8c";
      c.lineWidth = Math.max(1, radius * 0.075);
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
      this.text(
        String(g.board.tubes.indexOf(t) + 1),
        x,
        ty - 7,
        11,
        face.color,
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
          c.fillStyle = part.text === "球" ? "#9b456f" : "#77628e";
          c.fillText(part.text, x + depth * 0.35, y + depth);
        }
        c.lineWidth = 3 * scale;
        c.strokeStyle = "#fffcf0";
        c.strokeText(part.text, x, y);
        const shine = c.createLinearGradient(0, y - size, 0, y);
        if (part.text === "球") {
          shine.addColorStop(0, "#fff0b9");
          shine.addColorStop(0.25, "#ffb53d");
          shine.addColorStop(0.53, "#fa6575");
          shine.addColorStop(1, "#c847a1");
        } else {
          shine.addColorStop(0, "#ffffff");
          shine.addColorStop(0.35, "#d4bef8");
          shine.addColorStop(1, "#7560b7");
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
    this.text("转一转 · 凑三颗", w / 2, 43, 13, "#786254", "center");
    this.homeTitle();
    this.text("转一个角度，发现下一组。", w / 2, 174, 14, "#786254", "center");
    const c = this.ctx;
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
      this.chamberPath(x, bottom - 5, bottom + 3, 23);
      c.fill();
      c.strokeStyle = "#ffffffe0";
      c.beginPath();
      c.moveTo(x - 19, top + 8);
      c.lineTo(x - 19, bottom - 8);
      c.stroke();
    }
    this.text(
      "取顶部球放入七格槽，凑齐三颗同类。",
      w / 2,
      343,
      13,
      "#594739",
      "center",
    );
    this.text(
      "外层清空后，新的球仓逐渐显露。",
      w / 2,
      367,
      13,
      "#786254",
      "center",
    );
    const y = Math.min(h - 280, 405);
    PRESETS.forEach((p, i) =>
      this.button(
        "start-" + i,
        `${p.name}  ·  ${((p.side * (p.side + 1)) / 2) * p.height} 颗  ·  5 分钟`,
        28,
        y + i * 53,
        w - 56,
        44,
        () => {
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
      "#786254",
      "center",
    );
    this.text(
      `原型 v${VERSION} · 难度与时长待试玩校准`,
      w / 2,
      h - 32,
      11,
      "#786254",
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
    this.rect(20, y - 30, w - 40, Math.min(460, h - y - 30), "#fffaf1", 22);
    this.text(title, w / 2, y + 20, 30, "#3c302a", "center");
    this.text(
      `${g.board.score} 分 · 已消除 ${g.board.cleared.length} 颗`,
      w / 2,
      y + 55,
      15,
      "#594739",
      "center",
    );
    this.text(
      `有效用时 ${Math.ceil((CONFIG.baseMs + g.state.added - g.state.remaining) / 1000)} 秒`,
      w / 2,
      y + 80,
      13,
      "#786254",
      "center",
    );
    if (g.phase === "ad") {
      this.text(
        "计时已暂停，等待广告结果",
        w / 2,
        y + 145,
        14,
        "#c94322",
        "center",
      );
      return;
    }
    this.text(
      `提示 ${g.state.hintsUsed} · 撤销 ${g.state.undosUsed} · 续时 ${g.state.extensions}`,
      w / 2,
      y + 102,
      11,
      "#786254",
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
      add("undo-blocked", "免费撤销一步", () => g.undo(), !g.canUndo);
    if (g.phase === "expired") {
      add(
        "extend",
        g.ads.available
          ? `自愿看广告 +30秒 (${g.state.extensions}/${CONFIG.maxExtensions})`
          : "广告未配置 · 可直接结束",
        () => void g.extend(),
        !g.ads.available || g.state.extensions >= CONFIG.maxExtensions,
      );
      this.text(g.ads.label, w / 2, by - 2, 11, "#786254", "center");
      by += 8;
    }
    if (g.phase !== "result") add("end", "结束并保留本局成绩", () => g.end());
    else
      add("again", "再来一局", () =>
        g.start(g.state.preset, (g.state.seed + 1) >>> 0),
      );
    add("home", "返回首页", () => g.home());

    this.text(
      this.fit(g.message, Math.floor((w - 55) / 12)),
      w / 2,
      Math.min(h - 25, by + 15),
      12,
      "#594739",
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
