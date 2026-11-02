import { Music } from "./platform/music";
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
for (const file of ["background.png", "play-background.png"]) {
  try {
    const image = new Image();
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
function resize() {
  const w = Math.min(innerWidth, 500),
    h = Math.max(innerHeight, 660),
    dpr = Math.min(devicePixelRatio, 2);
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  scene.width = w;
  scene.height = h;
}
resize();
addEventListener("resize", resize);
document.addEventListener("visibilitychange", () => {
  scene.setForeground(!document.hidden);
  if (document.hidden) {
    music.suspend();
    game.hide();
  }
});
addEventListener("pageshow", () => scene.setForeground(true));
addEventListener("pagehide", () => {
  scene.setForeground(false);
  music.suspend();
  game.hide();
});
let start: { x: number; y: number } | null = null;
canvas.addEventListener("pointerdown", (e) => {
  start = { x: e.offsetX, y: e.offsetY };
});
canvas.addEventListener("pointercancel", () => (start = null));
canvas.addEventListener("pointerup", (e) => {
  if (!start) return;
  const dx = e.offsetX - start.x,
    dy = e.offsetY - start.y;
  start = null;
  if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy))
    game.rotate(dx > 0 ? 1 : -1);
  else if (Math.hypot(dx, dy) < 15) scene.tap(e.offsetX, e.offsetY);
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
