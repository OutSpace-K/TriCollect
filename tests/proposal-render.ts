// Optional offline pixel QA: set TRICOLLECT_CANVAS_MODULE to an installed @napi-rs/canvas.
const { createCanvas, loadImage, GlobalFonts } = await import(
  process.env.TRICOLLECT_CANVAS_MODULE ?? "@napi-rs/canvas"
);
import { CONFIG } from "../src/config";
import { Scene } from "../src/render/scene";
import { Controller } from "../src/controller";
import { viewport } from "../src/platform/viewport";
import { writeFileSync, mkdirSync } from "node:fs";
GlobalFonts.registerFromPath(
  "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
  "sans-serif",
);
mkdirSync("evidence/style-preview", { recursive: true });
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
  if (process.env.TRICOLLECT_HIDDEN_STYLE)
    s.setHiddenStyle(process.env.TRICOLLECT_HIDDEN_STYLE as any);
  if (process.env.TRICOLLECT_HIDDEN_ART)
    s.setHiddenArtwork(
      (await loadImage(process.env.TRICOLLECT_HIDDEN_ART)) as any,
      !!process.env.TRICOLLECT_HIDDEN_MURAL,
    );
  if (process.env.TRICOLLECT_MURAL_BANK) {
    s.setHiddenArtworkCanvasFactory((w, h) => createCanvas(w, h) as any);
    for (const [i, file] of [
      "hidden-mural.png",
      "hidden-mural-doodle.png",
      "hidden-mural-brush.png",
      "hidden-mural-night.png",
    ].entries())
      s.setMuralImage(i, (await loadImage("assets/" + file)) as any);
  }
  s.setHomeArt("logo", (await loadImage("assets/home-logo.png")) as any);
  s.setHomeArt("hero", (await loadImage("assets/home-hero.png")) as any);
  s.setBallAtlas((await loadImage("assets/balls-candy.png")) as any);
  s.setTubeGlass((await loadImage("assets/tube-glass.png")) as any);
  s.setTubeGlassRear((await loadImage("assets/tube-glass-rear.png")) as any);
  s.setTurntable((await loadImage("assets/turntable.png")) as any);
  s.setBackground(home as any);
  s.setPlayBackground(play as any);
  for (const page of ["home", "difficulty", "ready", "game", "pause"]) {
    if (page === "difficulty") s.homePanel = "difficulty";
    if (page === "ready") {
      s.homePanel = null;
      g.start(process.env.TRICOLLECT_PREVIEW_NORMAL ? 1 : 2);
      g.skipIntro();
    }
    if (page === "game") {
      s.homePanel = null;
      g.start(process.env.TRICOLLECT_PREVIEW_NORMAL ? 1 : 2);
      if (process.env.TRICOLLECT_MURAL_VARIANT !== undefined)
        g.state.muralVariant = Number(process.env.TRICOLLECT_MURAL_VARIANT);
      g.skipIntro();
      g.begin();
      if (process.env.TRICOLLECT_PREVIEW_TURN) {
        g.rotate(1);
        t += CONFIG.rotateMs * Number(process.env.TRICOLLECT_PREVIEW_TURN);
      }
    }
    if (page === "pause") g.pause();
    ctx.save();
    ctx.translate(0, vp.top);
    ctx.scale(vp.factor, vp.factor);
    s.render();
    ctx.restore();
    writeFileSync(
      `evidence/style-preview/${w}-${page}${process.env.TRICOLLECT_PREVIEW_TURN ? "-turn" : ""}${process.env.TRICOLLECT_PREVIEW_NORMAL ? "-normal" : ""}.png`,
      c.toBuffer("image/png"),
    );
  }
}
