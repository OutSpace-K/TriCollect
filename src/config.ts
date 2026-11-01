export const VERSION = "0.1.6";
export const RULE = "tricollect-4-fixedslots-front";
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
  rotateMs: 250,
  searchNodes: 12_000,
  searchMs: 40,
});
export const PRESETS = [
  { id: "learn", name: "初见", side: 6, height: 5, types: 5, seed: 104729 },
  { id: "normal", name: "探索", side: 6, height: 5, types: 6, seed: 130363 },
  { id: "deep", name: "深入", side: 8, height: 5, types: 7, seed: 155921 },
] as const;
export type Preset = {
  id: string;
  name: string;
  side: number;
  height: number;
  types: number;
  seed: number;
};
export const MECHANICAL: Preset = {
  id: "mechanical",
  name: "机械验证",
  side: 4,
  height: 3,
  types: 5,
  seed: 104729,
};
export const FACES = [
  { name: "珊瑚面", color: "#f1a48a", shell: "#773e37" },
  { name: "翡翠面", color: "#91d9bd", shell: "#285c50" },
  { name: "星蓝面", color: "#a4bdf4", shell: "#344e77" },
];
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
