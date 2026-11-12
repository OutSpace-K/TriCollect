import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  BufferedMusic,
  type LoopContext,
} from "../src/platform/buffered-music";

// Independent offline WebAudio implementation, not a browser or WeChat device.
const require = createRequire(import.meta.url);
const { OfflineAudioContext } = require("web-audio-engine");
const file = readFileSync("assets/ambience.wav");
const rate = file.readUInt32LE(24);
const pcm = Array.from(
  { length: (file.length - 44) / 2 },
  (_, i) => file.readInt16LE(44 + 2 * i) / 32768,
);
const seconds = 100;
const context = new OfflineAudioContext(1, seconds * rate, rate);
let state: AudioContextState = "suspended";
let sources = 0,
  decodes = 0,
  fallbacks = 0;
let decodedPcm = new Float32Array(0);
const adapter = {
  get currentTime() {
    return context.currentTime;
  },
  get state() {
    return state;
  },
  destination: context.destination,
  onstatechange: null,
  createGain: () => context.createGain(),
  createBufferSource: () => {
    sources++;
    return context.createBufferSource();
  },
  resume: async () => {
    state = "running";
  },
  suspend: async () => {
    state = "suspended";
  },
  close: async () => {
    state = "closed";
  },
} as LoopContext;
const player = new BufferedMusic(
  adapter,
  async () => {
    decodes++;
    const buffer = await context.decodeAudioData(
      file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
    );
    decodedPcm = buffer.getChannelData(0);
    return buffer;
  },
  () => {
    fallbacks++;
    throw Error("Offline buffered playback must not fall back");
  },
);
await new Promise<void>((resolve, reject) => {
  player.onPlay(resolve);
  player.onError(() => reject(Error("Buffered playback failed")));
  player.play();
});
// Render without calling play, update, onended or a per-loop scheduling timer.
const rendered = await context.startRendering();
const output: Float32Array = rendered.getChannelData(0);
assert.equal(output.length, rate * seconds);
assert.equal(sources, 1);
assert.equal(decodes, 1);
assert.equal(fallbacks, 0);
assert.equal(decodedPcm.length, pcm.length);
let maxDecodeQuantizationError = 0;
for (let i = 0; i < pcm.length; i++)
  maxDecodeQuantizationError = Math.max(
    maxDecodeQuantizationError,
    Math.abs(decodedPcm[i] - pcm[i]),
  );
// The independent WAV decoder normalizes positive PCM by 32767. Allow that
// sub-LSB conversion, then compare every rendered sample with the decoded loop.
assert.ok(maxDecodeQuantizationError < 1 / 32768);
let maxSampleError = 0;
for (let i = 0; i < output.length; i++)
  maxSampleError = Math.max(
    maxSampleError,
    Math.abs(output[i] - decodedPcm[i % decodedPcm.length] * 0.22),
  );
assert.ok(maxSampleError < 1e-7, `PCM loop mismatch: ${maxSampleError}`);
const boundaries = [32, 64, 96].map((time) => {
  const center = time * rate;
  const window = Math.round(rate * 0.01);
  let minimumRms = Infinity;
  for (
    let i = center - window * 4;
    i < center + window * 3;
    i += (window / 2) | 0
  ) {
    let energy = 0;
    for (let j = i; j < i + window; j++) energy += output[j] ** 2;
    minimumRms = Math.min(minimumRms, Math.sqrt(energy / window));
  }
  assert.ok(minimumRms > 0.001, `silent gap at ${time}s`);
  return { seconds: time, minimum10msRms: minimumRms };
});
player.pause();
const report = {
  passed: true,
  scope:
    "Actual 100-second offline PCM render using web-audio-engine 0.13.4 and production BufferedMusic. Not a browser or real WeChat device; no human listening.",
  durationSeconds: seconds,
  sampleRate: rate,
  renderedFrames: output.length,
  sourceNodesCreated: sources,
  decodes,
  nativeFallbacks: fallbacks,
  maxDecodeQuantizationError,
  maxSampleError,
  boundaries,
  realWechatDeviceTested: false,
  humanListeningPerformed: false,
};
writeFileSync(
  "evidence/v0.1.27-audio-offline.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
