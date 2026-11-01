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
const audio = wx.createInnerAudioContext();
audio.src = "assets/tap.wav";
const ads = AD_UNIT
  ? new WeChatAd(
      wx.createRewardedVideoAd({ adUnitId: AD_UNIT }) as unknown as Video,
    )
  : new UnavailableAd();
const game = new Controller(
  () => perf.now() / 1000,
  {
    get: (k) => {
      const value = wx.getStorageSync(k);
      return typeof value === "string" ? value : null;
    },
    set: (k, v) => wx.setStorageSync(k, v),
  },
  ads,
  () => {
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
});
wx.onHide(() => {
  pointer = null;
  game.hide();
  audio.stop();
});
wx.onShow(() => {
  pointer = null;
});
audio.onError(() => {});
function frame() {
  game.tick();
  ctx.save();
  ctx.translate(0, top);
  ctx.scale(factor, factor);
  scene.render();
  ctx.restore();
  requestAnimationFrame(frame);
}
frame();
