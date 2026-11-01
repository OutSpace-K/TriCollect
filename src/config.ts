export const VERSION = "0.1.1";
export const RULE = "tricollect-1";
export const CONFIG = Object.freeze({
  baseMs: 300_000,
  capacity: 7,
  match: 3,
  matchScore: 100,
  tubeScore: 20,
  winScore: 500,
  extraMs: 30_000,
  maxExtensions: 2,
  animationMs: 240,
  rotateMs: 360,
  searchNodes: 12_000,
  searchMs: 40,
});
export const PRESETS = [
  { id: "learn", name: "初见", side: 4, height: 3, types: 5, seed: 104729 },
  { id: "normal", name: "探索", side: 5, height: 3, types: 5, seed: 130363 },
  { id: "deep", name: "深入", side: 6, height: 3, types: 7, seed: 155921 },
] as const;
export type Preset = (typeof PRESETS)[number];
export const PALETTE = [
  "#fb826f",
  "#6dcbb7",
  "#f3c667",
  "#9b9ee9",
  "#72bce5",
  "#e7a2cf",
  "#b8cf78",
];
export const SYMBOLS = ["●", "◆", "▲", "✚", "■", "★", "♥"];
