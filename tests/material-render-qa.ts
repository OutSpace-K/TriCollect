// Optional actual-pixel audit; uses the same renderer as the game.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { Scene } from "../src/render/scene";
import { Controller } from "../src/controller";
import { viewport } from "../src/platform/viewport";
const { createCanvas, loadImage } = await import(
  process.env.TRICOLLECT_CANVAS_MODULE ?? "@napi-rs/canvas"
);
const atlas = await loadImage("assets/balls-candy.png");
let cases = 0,
  hidden = 0;
for (const [w, h] of [
  [320, 568],
  [360, 640],
  [390, 844],
  [430, 932],
])
  for (const preset of [0, 1, 2])
    for (const view of [0, 1, 2])
      for (const useAtlas of [false, true]) {
        (globalThis as any).gc?.();
        const vp = viewport(h, 24, h - 24, 64),
          canvas = createCanvas(w, h),
          ctx = canvas.getContext("2d"),
          saved = new Map<string, string>();
        const g = new Controller(
          () => 0,
          {
            get: (k) => saved.get(k) ?? null,
            set: (k, v) => {
              saved.set(k, v);
            },
          },
          { available: false, label: "none", request: async () => "failed" },
        );
        g.start(preset);
        g.skipIntro();
        g.begin();
        g.state.view = view;
        const s = new Scene(
          ctx as any,
          g,
          w / vp.factor,
          vp.logicalHeight,
          vp.factor,
        );
        if (useAtlas) s.setBallAtlas(atlas as any);
        ctx.translate(0, vp.top);
        ctx.scale(vp.factor, vp.factor);
        s.render();
        s.render(); // Warm the renderer state before isolating hidden-color changes.
        const before = canvas.toBuffer("image/png"),
          visible = new Set(s.visibleBalls.flatMap((t) => t.ids));
        for (const t of g.board.tubes)
          for (const b of t.balls)
            if (!visible.has(b.id)) {
              b.type = (b.type + 3) % 7;
              hidden++;
            }
        s.render();
        const after = canvas.toBuffer("image/png");
        if (!before.equals(after)) {
          writeFileSync("evidence/v0.1.30/material-before.png", before);
          writeFileSync("evidence/v0.1.30/material-after.png", after);
        }
        assert.ok(
          before.equals(after),
          `hidden pixels ${w}/${preset}/${view}/${useAtlas}`,
        );
        cases++;
        canvas.width = 1;
        canvas.height = 1;
      }
const result = {
  cases,
  hiddenColorMutations: hidden,
  result:
    "pixel-identical with hidden colors changed, with sprites and fallback",
};
writeFileSync(
  "evidence/v0.1.30/material-pixels.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(result);
