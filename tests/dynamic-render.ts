// Actual code-rendered state comparison, optional local Canvas dependency.
const { createCanvas, loadImage, GlobalFonts } = await import(
  process.env.TRICOLLECT_CANVAS_MODULE ?? "@napi-rs/canvas"
);
import { Scene } from "../src/render/scene";
import { Controller } from "../src/controller";
import { viewport } from "../src/platform/viewport";
import { writeFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
GlobalFonts.registerFromPath(
  "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
  "sans-serif",
);
let now = 0;
const memory = new Map<string, string>();
const g = new Controller(
  () => now,
  {
    get: (k) => memory.get(k) ?? null,
    set: (k, v) => {
      memory.set(k, v);
    },
  },
  { available: false, label: "none", request: async () => "failed" },
);
g.start(1);
g.skipIntro();
g.begin();
const vp = viewport(844, 24, 820, 64),
  canvas = createCanvas(390, 844),
  ctx = canvas.getContext("2d");
const s = new Scene(
  ctx as any,
  g,
  390 / vp.factor,
  vp.logicalHeight,
  vp.factor,
);
if (process.env.TRICOLLECT_HIDDEN_ART)
  s.setHiddenArtwork(
    await loadImage(process.env.TRICOLLECT_HIDDEN_ART),
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
s.setPlayBackground(await loadImage("assets/play-background.png"));
s.setBallAtlas(await loadImage("assets/balls-candy.png"));
s.setTurntable(await loadImage("assets/turntable.png"));
s.setTubeGlass(await loadImage("assets/tube-glass.png"));
s.setTubeGlassRear(await loadImage("assets/tube-glass-rear.png"));
mkdirSync("evidence/style-preview", { recursive: true });
const paint = (name: string) => {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, 390, 844);
  ctx.save();
  ctx.translate(0, vp.top);
  ctx.scale(vp.factor, vp.factor);
  s.render();
  ctx.restore();
  writeFileSync(
    "evidence/style-preview/dynamic-" + name + ".png",
    canvas.toBuffer("image/png"),
  );
};
paint("initial");
const id = s.targets[0].id;
const coordinates = () =>
  [...s.ballPositions, ...s.ghostPositions].filter((b) => b.tube === id);
const before = coordinates(),
  cap = s.capStates.find((t) => t.id === id)!.y;
g.pick(id);
paint("departing");
assert.equal(s.capStates.find((t) => t.id === id)!.y, cap);
now += 250;
g.tick();
paint("after");
for (const b of coordinates())
  assert.deepEqual(
    b,
    before.find((old) => old.id === b.id),
  );
assert.ok(Math.abs(s.capStates.find((t) => t.id === id)!.y - cap) < 1e-8);
g.undo();
paint("undo");
assert.deepEqual(coordinates(), before);
assert.equal(s.capStates.find((t) => t.id === id)!.y, cap);
console.log(
  "4 actual frames: fixed coordinates, fixed-capacity vessel, and undo verified",
);
// Reach a three-ball window through legal picks, without rewriting the board.
while (g.board.tubes.find((tube) => tube.id === id)!.balls.length > 3) {
  g.pick(id);
  now += 250;
  g.tick();
}
paint("three-left");
for (const b of coordinates())
  assert.deepEqual(
    b,
    before.find((old) => old.id === b.id),
  );
