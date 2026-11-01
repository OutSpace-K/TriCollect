import { Music } from "./platform/music";
import { calibrateClock } from "./platform/clock";
import { startFrames } from "./platform/frame";
import { Controller } from "./controller";
import { Scene } from "./render/scene";
import { WeChatAd, UnavailableAd, type Video } from "./platform/ads";
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
const ads = AD_UNIT
  ? new WeChatAd(
      wx.createRewardedVideoAd({ adUnitId: AD_UNIT }) as unknown as Video,
    )
  : new UnavailableAd();
async function boot() {
  ctx.fillStyle = "#102e36";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#e9edda";
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
  // Reserve the top system capsule area and bottom safe area without changing rule coordinates.
  const top = Math.max(info.safeArea?.top ?? 0, 24),
    bottom = Math.max(0, height - (info.safeArea?.bottom ?? height));
  const logicalHeight = Math.max(height - top - bottom, 660),
    factor = Math.min(1, (height - top - bottom) / logicalHeight);
  const scene = new Scene(ctx, game, width / factor, logicalHeight);
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
    pointer = null;
    music.suspend();
    game.hide();
    try {
      audio?.stop();
    } catch {}
  });
  wx.onShow(() => {
    pointer = null;
  });
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
  ctx.fillStyle = "#102e36";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#e9edda";
  ctx.font = "16px sans-serif";
  ctx.fillText("时钟无法正常运行，请重新打开游戏", 20, 100);
});
