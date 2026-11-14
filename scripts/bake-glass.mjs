// Optional build-time raster cache for the production glass material.
// Run with TRICOLLECT_CANVAS_MODULE pointing to an installed @napi-rs/canvas.
import { writeFileSync } from "node:fs";
const { createCanvas, loadImage } = await import(
  process.env.TRICOLLECT_CANVAS_MODULE ?? "@napi-rs/canvas"
);
const source = await loadImage("assets/tube-glass.png");
const material = createCanvas(166, 603),
  m = material.getContext("2d");
m.drawImage(source, 0, 0, 166, 64, 0, 0, 166, 64);
m.drawImage(source, 0, 64, 166, 489, 0, 64, 166, 508);
const ry = 24.9,
  upper = 569,
  lower = 575,
  rx = 81.34;
m.beginPath();
m.moveTo(83 - rx, upper);
m.ellipse(83, upper, rx, ry, 0, Math.PI, 0, true);
m.lineTo(83 + rx, lower);
m.ellipse(83, lower, rx, ry, 0, 0, Math.PI);
m.closePath();
const edge = m.createLinearGradient(0, 0, 166, 0);
edge.addColorStop(0, "#b79b7766");
edge.addColorStop(0.45, "#fff8e888");
edge.addColorStop(1, "#98745555");
m.fillStyle = edge;
m.fill();
m.beginPath();
m.ellipse(83, lower, rx, ry, 0, 0, Math.PI);
m.strokeStyle = "#816342a0";
m.lineWidth = 3;
m.stroke();
m.beginPath();
m.ellipse(83, upper, 71.38, 17.93, 0, 0, Math.PI);
m.strokeStyle = "#fffdf1de";
m.lineWidth = 4.6;
m.stroke();
const width = 190,
  height = 627,
  pad = 12;
const atlas = createCanvas((width * 3) / 2, Math.ceil(height / 2)),
  c = atlas.getContext("2d");
c.scale(0.5, 0.5);
for (const [index, depth] of [0.15, 0.55, 1].entries()) {
  c.save();
  c.beginPath();
  c.rect(index * width, 0, width, height);
  c.clip();
  const spread = 3.2 + depth * 7.2;
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    c.globalAlpha = 0.07 - depth * 0.045;
    c.drawImage(
      material,
      index * width + pad + Math.cos(angle) * spread,
      pad + Math.sin(angle) * spread,
      166,
      603,
    );
  }
  c.restore();
}
writeFileSync("assets/tube-glass-rear.png", atlas.toBuffer("image/png"));
