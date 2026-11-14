import { viewport } from "./platform/viewport";
import { gesture } from "./platform/gesture";
import { Music } from "./platform/music";
import { createWechatMusic } from "./platform/wechat-music";
import {
  configureWechatAudio,
  createWechatPlayer,
} from "./platform/wechat-audio";
import { calibrateClock } from "./platform/clock";
import { startFrames } from "./platform/frame";
import { Controller } from "./controller";
import { Scene } from "./render/scene";
import { NoAdsService } from "./platform/ads";
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
configureWechatAudio(wx);
const music = new Music(() => createWechatMusic(wx));
let audioInterrupted = false;
wx.onAudioInterruptionBegin?.(() => {
  audioInterrupted = true;
  music.setInterrupted(true);
  try {
    audio?.stop();
  } catch {}
});
wx.onAudioInterruptionEnd?.(() => {
  audioInterrupted = false;
  music.setInterrupted(false);
});
const ads = new NoAdsService();
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
      },
    },
    () => {
      if (audioInterrupted) return;
      audio ??= createWechatPlayer(wx, "assets/tap.wav");
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
  const scene = new Scene(ctx, game, width / factor, logicalHeight, factor);
  scene.setHiddenArtworkCanvasFactory((width, height) => {
    const c = wx.createCanvas();
    c.width = width;
    c.height = height;
    return c as unknown as HTMLCanvasElement;
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
    "hidden-mural-night.png",
  ]) {
    try {
      const image = wx.createImage();
      image.onload = () =>
        file.startsWith("hidden-mural")
          ? scene.setMuralImage(
              [
                "hidden-mural.png",
                "hidden-mural-doodle.png",
                "hidden-mural-brush.png",
                "hidden-mural-night.png",
              ].indexOf(file),
              image as unknown as CanvasImageSource,
            )
          : file === "background.png"
            ? scene.setBackground(image as unknown as CanvasImageSource)
            : file === "play-background.png"
              ? scene.setPlayBackground(image as unknown as CanvasImageSource)
              : file === "tube-glass-rear.png"
                ? scene.setTubeGlassRear(image as unknown as CanvasImageSource)
                : file === "tube-glass.png"
                  ? scene.setTubeGlass(image as unknown as CanvasImageSource)
                  : file === "turntable.png"
                    ? scene.setTurntable(image as unknown as CanvasImageSource)
                    : file === "balls-candy.png"
                      ? scene.setBallAtlas(
                          image as unknown as CanvasImageSource,
                        )
                      : scene.setHomeArt(
                          file === "home-logo.png" ? "logo" : "hero",
                          image as unknown as CanvasImageSource,
                        );
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
    pointer =
      e.touches.length === 1 && t ? { x: t.clientX, y: t.clientY } : null;
  });
  wx.onTouchCancel(() => (pointer = null));
  wx.onTouchEnd((e) => {
    const t = e.changedTouches[0];
    if (!pointer || !t) return;
    const x = t.clientX / factor,
      y = (t.clientY - top) / factor,
      action = gesture(t.clientX - pointer.x, t.clientY - pointer.y);
    pointer = null;
    if (action === "right" || action === "left")
      game.rotate(action === "right" ? 1 : -1);
    else if (action === "tap") scene.tap(x, y);
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
