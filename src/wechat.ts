import { viewport } from "./platform/viewport";
import { Music } from "./platform/music";
import { calibrateClock } from "./platform/clock";
import { startFrames } from "./platform/frame";
import { Controller } from "./controller";
import { Scene } from "./render/scene";
import { createAdService, type Video } from "./platform/ads";
declare const AD_UNIT: string;
const canvas = wx.createCanvas();
const info = wx.getWindowInfo();
const width = info.windowWidth,
  height = info.windowHeight,
  dpr = Math.min(info.pixelRatio, 2);
canvas.width = width * dpr;
canvas.height = height * dpr;
const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
ctx.scale(dpr, dpr);
const perf = wx.getPerformance();
let audio: WechatMinigame.InnerAudioContext | undefined;
const music = new Music(() => {
  const player = wx.createInnerAudioContext();
  player.src = "assets/ambience.wav";
  player.loop = true;
  player.volume = 0.22;
  return player;
});
const ads = createAdService(
  AD_UNIT,
  (unit) => wx.createRewardedVideoAd({ adUnitId: unit }) as unknown as Video,
);
async function boot() {
  ctx.fillStyle = "#dbe6cf";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#294d3c";
  ctx.font = "16px sans-serif";
  ctx.fillText("正在准备球仓…", 24, 80);
  const clock = await calibrateClock(() => perf.now());
  console.info("TriCollect clock units/ms", clock.unitsPerMs);
  const game = new Controller(
    clock.now,
    {
      get: (k) => {
        const value = wx.getStorageSync(k);
        return typeof value === "string" ? value : null;
      },
      set: (k, v) => wx.setStorageSync(k, v),
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
      },
    },
    () => {
      if (!audio) {
        audio = wx.createInnerAudioContext();
        audio.src = "assets/tap.wav";
        audio.onError(() => {});
      }
      audio.stop();
      audio.play();
    },
  );
  let menuBottom: number | undefined;
  try {
    menuBottom = wx.getMenuButtonBoundingClientRect?.().bottom;
  } catch {
    /* Conservative capsule fallback. */
  }
  const { top, bottom, logicalHeight, factor } = viewport(
    height,
    info.safeArea?.top,
    info.safeArea?.bottom,
    menuBottom,
  );
  const scene = new Scene(ctx, game, width / factor, logicalHeight);
  for (const file of ["background.png", "play-background.png"]) {
    try {
      const image = wx.createImage();
      image.onload = () =>
        file === "background.png"
          ? scene.setBackground(image as unknown as CanvasImageSource)
          : scene.setPlayBackground(image as unknown as CanvasImageSource);
      image.onerror = () => {
        /* Keep the available backdrop if loading fails. */
      };
      image.src = "assets/" + file;
    } catch {
      /* Image capability failure must not stop play. */
    }
  }
  let pointer: { x: number; y: number } | null = null;
  wx.onTouchStart((e) => {
    const t = e.touches[0];
    if (t) pointer = { x: t.clientX / factor, y: (t.clientY - top) / factor };
  });
  wx.onTouchCancel(() => (pointer = null));
  wx.onTouchEnd((e) => {
    const t = e.changedTouches[0];
    if (!pointer || !t) return;
    const x = t.clientX / factor,
      y = (t.clientY - top) / factor,
      dx = x - pointer.x,
      dy = y - pointer.y;
    pointer = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy))
      game.rotate(dx > 0 ? 1 : -1);
    else if (Math.hypot(dx, dy) < 15) scene.tap(x, y);
    music.gesture(game.state.sound, game.phase);
  });
  wx.onHide(() => {
    scene.setForeground(false);
    music.setForeground(false);
    pointer = null;
    music.suspend();
    game.hide();
    try {
      audio?.stop();
    } catch {}
  });
  wx.onShow(() => {
    scene.setForeground(true);
    music.setForeground(true);
    pointer = null;
  });
  // Remove bootstrap text from the reserved system area before the first scene.
  ctx.fillStyle = "#dbe6cf";
  ctx.fillRect(0, 0, width, height);
  startFrames(
    requestAnimationFrame,
    () => {
      game.tick();
      music.update(game.state.sound, game.phase);
      ctx.save();
      try {
        ctx.translate(0, top);
        ctx.scale(factor, factor);
        scene.render();
      } finally {
        ctx.restore();
      }
    },
    (error) => {
      music.suspend();
      game.interrupt(error);
    },
  );
}
void boot().catch((error) => {
  console.error("TriCollect startup failed", error);
  ctx.fillStyle = "#dbe6cf";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#294d3c";
  ctx.font = "16px sans-serif";
  ctx.fillText("时钟无法正常运行，请重新打开游戏", 20, 100);
});
