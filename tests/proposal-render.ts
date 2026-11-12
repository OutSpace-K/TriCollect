// Optional offline pixel QA: set TRICOLLECT_CANVAS_MODULE to an installed @napi-rs/canvas.
const { createCanvas, loadImage, GlobalFonts } = await import(
  process.env.TRICOLLECT_CANVAS_MODULE ?? "@napi-rs/canvas"
);
import { Scene } from "../src/render/scene";
import { Controller } from "../src/controller";
import { viewport } from "../src/platform/viewport";
import { writeFileSync, mkdirSync } from "node:fs";
GlobalFonts.registerFromPath(
  "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
  "sans-serif",
);
mkdirSync("evidence/v0.1.29", { recursive: true });
const home = await loadImage("assets/background.png"),
  play = await loadImage("assets/play-background.png");
for (const [w, h] of [
  [390, 844],
  [320, 568],
  [360, 640],
  [430, 932],
]) {
  const vp = viewport(h, 24, h - 24, 64);
  const c = createCanvas(w, h);
  const ctx = c.getContext("2d");
  let t = 0;
  const storage = new Map<string, string>();
  const g = new Controller(
    () => t,
    {
      get: (key: string) => storage.get(key) ?? null,
      set: (key: string, value: string) => {
        storage.set(key, value);
      },
    },
    { available: false, label: "none", request: async () => "failed" },
  );
  const s = new Scene(
    ctx as any,
    g,
    w / vp.factor,
    vp.logicalHeight,
    vp.factor,
  );
  s.setHomeArt("logo", (await loadImage("assets/home-logo.png")) as any);
  s.setHomeArt("hero", (await loadImage("assets/home-hero.png")) as any);
  s.setBackground(home as any);
  s.setPlayBackground(play as any);
  for (const page of ["home", "difficulty", "game", "pause"]) {
    if (page === "difficulty") s.homePanel = "difficulty";
    if (page === "game") {
      s.homePanel = null;
      g.start(process.env.TRICOLLECT_PREVIEW_NORMAL ? 1 : 2);
      g.skipIntro();
      g.begin();
    }
    if (page === "pause") g.pause();
    ctx.save();
    ctx.translate(0, vp.top);
    ctx.scale(vp.factor, vp.factor);
    s.render();
    ctx.restore();
    writeFileSync(
      `evidence/v0.1.29/${w}-${page}${process.env.TRICOLLECT_PREVIEW_NORMAL ? "-normal" : ""}.png`,
      c.toBuffer("image/png"),
    );
  }
}
