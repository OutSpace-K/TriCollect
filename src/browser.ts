import { Music } from "./platform/music";
import { gesture } from "./platform/gesture";
import { startFrames } from "./platform/frame";
import { Controller } from "./controller";
import { Scene } from "./render/scene";
import { MockAd } from "./platform/mock-ad";
import { createLevel } from "./core/generation";
const canvas = document.querySelector("canvas")!,
  ctx = canvas.getContext("2d")!;
let audio: AudioContext | undefined;
const ads = new MockAd();
const game = new Controller(
  () => performance.now(),
  {
    get: (k) => localStorage.getItem(k),
    set: (k, v) => localStorage.setItem(k, v),
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
    try {
      audio ??= new AudioContext();
      void audio.resume();
      const o = audio.createOscillator(),
        gain = audio.createGain();
      o.connect(gain);
      gain.connect(audio.destination);
      o.frequency.value = 650;
      gain.gain.setValueAtTime(0.05, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.1);
      o.start();
      o.stop(audio.currentTime + 0.1);
    } catch {}
  },
);
const music = new Music(() => {
  const player = new Audio("assets/ambience.wav");
  player.loop = true;
  player.volume = 0.22;
  return player;
});
const scene = new Scene(ctx, game, 390, 844);
for (const file of [
  "background.png",
  "play-background.png",
  "home-logo.png",
  "home-hero.png",
  "balls-candy.png",
]) {
  try {
    const image = new Image();
    image.onload = () =>
      file === "background.png"
        ? scene.setBackground(image as unknown as CanvasImageSource)
        : file === "play-background.png"
          ? scene.setPlayBackground(image as unknown as CanvasImageSource)
          : file === "balls-candy.png"
            ? scene.setBallAtlas(image as unknown as CanvasImageSource)
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
let displayFactor = 1;
function resize() {
  const w = Math.min(innerWidth, 500),
    h = Math.max(innerHeight, 1),
    dpr = Math.min(devicePixelRatio, 2);
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  displayFactor = Math.min(1, h / 660);
  scene.displayScale = displayFactor;
  ctx.setTransform(dpr * displayFactor, 0, 0, dpr * displayFactor, 0, 0);
  scene.width = w / displayFactor;
  scene.height = h / displayFactor;
}
resize();
music.setForeground(!document.hidden);
addEventListener("resize", resize);
document.addEventListener("visibilitychange", () => {
  scene.setForeground(!document.hidden);
  music.setForeground(!document.hidden);
  if (document.hidden) {
    music.suspend();
    game.hide();
  }
});
addEventListener("pageshow", () => {
  scene.setForeground(true);
  music.setForeground(!document.hidden);
});
addEventListener("pagehide", () => {
  scene.setForeground(false);
  music.setForeground(false);
  game.hide();
});
let start: { x: number; y: number } | null = null;
canvas.addEventListener("pointerdown", (e) => {
  start = { x: e.offsetX, y: e.offsetY };
});
canvas.addEventListener("pointercancel", () => (start = null));
canvas.addEventListener("pointerup", (e) => {
  if (!start) return;
  const action = gesture(e.offsetX - start.x, e.offsetY - start.y);
  start = null;
  if (action === "right" || action === "left")
    game.rotate(action === "right" ? 1 : -1);
  else if (action === "tap")
    scene.tap(e.offsetX / displayFactor, e.offsetY / displayFactor);
  music.gesture(game.state.sound, game.phase);
});
startFrames(
  requestAnimationFrame,
  () => {
    game.tick();
    music.update(game.state.sound, game.phase);
    scene.render();
  },
  (error) => {
    music.suspend();
    game.interrupt(error);
  },
);
// Browser-only test surface; never imported by the WeChat entry.
Object.assign(window, { tri: { game, scene, createLevel } });
