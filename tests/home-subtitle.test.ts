import { test } from "node:test";
import assert from "node:assert/strict";
import { Scene } from "../src/render/scene";
import { Controller } from "../src/controller";
import { viewport } from "../src/platform/viewport";
test("subtitle rounded strokes do not overlap title or hero on four screen sizes and resume layouts", async (t) => {
  let canvasModule;
  try {
    canvasModule = await import(
      process.env.TRICOLLECT_CANVAS_MODULE ?? "@napi-rs/canvas"
    );
  } catch {
    t.skip("optional native canvas is not installed");
    return;
  }
  const { createCanvas, loadImage } = canvasModule;
  const logo = await loadImage("assets/home-logo.png"),
    hero = await loadImage("assets/home-hero.png");
  for (const [sw, sh] of [
    [320, 568],
    [360, 640],
    [390, 844],
    [430, 932],
  ])
    for (const resumed of [false, true]) {
      const vp = viewport(sh, 24, sh - 24, 64),
        w = sw / vp.factor,
        h = vp.logicalHeight;
      const canvas = createCanvas(sw, sh),
        c = canvas.getContext("2d");
      c.translate(0, vp.top);
      c.scale(vp.factor, vp.factor);
      const g = new Controller(
        () => 0,
        { get: () => null, set: () => {} },
        { available: false, label: "none", request: async () => "failed" },
      );
      const s = new Scene(c as any, g, w, h, vp.factor);
      s.setHomeArt("logo", logo as any);
      (s as any).homeSubtitle();
      const a = c.getImageData(0, 0, sw, sh).data;
      c.clearRect(0, 0, w, h);
      const lw = Math.min(w - 26, 420, h * 0.5),
        bottom = 70 + lw * 0.5,
        y = h - (resumed ? 208 : 184),
        hh = Math.min((w - 16) * 0.8, y - bottom - 24),
        hw = hh / 0.8;
      c.drawImage(logo, (w - lw) / 2, 70, lw, lw * 0.5);
      c.drawImage(hero, (w - hw) / 2, y - hh - 12, hw, hh);
      const b = c.getImageData(0, 0, sw, sh).data;
      let overlap = 0;
      for (let i = 3; i < a.length; i += 4)
        if (a[i] > 32 && b[i] > 32) overlap++;
      assert.equal(overlap, 0, `${sw}x${sh} resume=${resumed}`);
    }
});
