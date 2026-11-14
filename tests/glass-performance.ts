// Offscreen draw-call audit, not a phone frame-rate benchmark.
import { writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { Scene } from "../src/render/scene";
import { Controller } from "../src/controller";
const { createCanvas, loadImage } = await import(
  process.env.TRICOLLECT_CANVAS_MODULE ?? "@napi-rs/canvas"
);
const front = await loadImage("assets/tube-glass.png"),
  rear = await loadImage("assets/tube-glass-rear.png");
const results = [];
for (const preset of [0, 1, 2]) {
  let time = 0;
  const g = new Controller(
    () => time,
    { get: () => null, set: () => {} },
    { available: false, label: "none", request: async () => "failed" },
  );
  g.start(preset);
  g.skipIntro();
  g.begin();
  const ctx = createCanvas(390, 748).getContext("2d");
  let calls = 0;
  const draw = ctx.drawImage.bind(ctx);
  ctx.drawImage = (...args: any[]) => {
    if (args[0] === front || args[0] === rear) calls++;
    return draw(...args);
  };
  const s = new Scene(ctx, g, 390, 748);
  s.setTubeGlass(front);
  s.setTubeGlassRear(rear);
  for (const state of ["rest", "turn"]) {
    if (state === "turn") {
      g.rotate(1);
      time += 110;
      g.tick();
    }
    calls = 0;
    s.render();
    const tubes = s.tubeLayout.length;
    assert.equal(
      calls,
      s.silhouetteIds.length * 3 + (tubes - s.silhouetteIds.length) * 2,
    );
    results.push({ preset, state, tubes, glassImageDraws: calls });
  }
}
writeFileSync(
  "evidence/style-preview/glass-performance.json",
  JSON.stringify(
    {
      results,
      scope: "actual offscreen image-call counts; not true-device FPS",
    },
    null,
    2,
  ) + "\n",
);
console.log(results);
