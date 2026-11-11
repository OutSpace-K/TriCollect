import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const file = readFileSync("assets/ambience.wav");
const rate = file.readUInt32LE(24);
const samples = Array.from(
  { length: (file.length - 44) / 2 },
  (_, i) => file.readInt16LE(44 + i * 2) / 32768,
);
const rms = (values: number[]) =>
  Math.sqrt(
    values.reduce((sum, value) => sum + value * value, 0) / values.length,
  );

test("music keeps its exact 18-bar PCM loop without clipping or a silent seam", () => {
  assert.equal(file.toString("ascii", 0, 4), "RIFF");
  assert.equal(file.toString("ascii", 8, 12), "WAVE");
  assert.equal(file.toString("ascii", 12, 16), "fmt ");
  assert.equal(file.readUInt32LE(16), 16);
  assert.equal(file.readUInt16LE(20), 1, "uncompressed PCM");
  assert.equal(file.readUInt16LE(22), 1, "mono");
  assert.equal(file.readUInt16LE(34), 16);
  assert.equal(file.toString("ascii", 36, 40), "data");
  assert.equal(file.readUInt32LE(40), file.length - 44);
  assert.equal(rate, 22050);
  assert.equal(samples.length, 705600);
  assert.equal(samples.length / rate, (18 * 4 * 60) / 135);
  assert.ok(samples.every((value) => Math.abs(value) < 0.72));

  // Endpoint equality alone accepted the old 44ms silent tail. Inspect every
  // 10ms window across the join, including samples from both repeated cycles.
  const window = Math.round(rate * 0.01);
  const seam = [...samples.slice(-window * 4), ...samples.slice(0, window * 4)];
  for (let i = 0; i <= seam.length - window; i += Math.round(window / 2)) {
    assert.ok(
      rms(seam.slice(i, i + window)) > 0.005,
      `quiet seam at sample ${i}`,
    );
  }
  const step = samples[0] - samples.at(-1)!;
  const previous = samples.at(-1)! - samples.at(-2)!;
  const next = samples[1] - samples[0];
  assert.ok(Math.abs(step) < 0.02, "no large amplitude jump at the join");
  assert.ok(Math.abs(step - previous) < 0.01, "continuous incoming waveform");
  assert.ok(Math.abs(next - step) < 0.01, "continuous outgoing waveform");
});

test("both prebuilt platforms contain the exact tested music asset", () => {
  for (const platform of ["wechat", "browser"])
    assert.deepEqual(
      readFileSync(`dist/${platform}/assets/ambience.wav`),
      file,
    );
});
