export const VERSION = "0.1.10";
export const DISPLAY_NAME = "转个“球”";
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
  misclickMs: 280,
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
  { name: "珊瑚面", color: "#c44c30", shell: "#f4d4bf" },
  { name: "翡翠面", color: "#237e68", shell: "#d8e6cb" },
  { name: "星蓝面", color: "#6552bc", shell: "#e4dcf0" },
];
export const PALETTE = [
  "#f34462",
  "#00bc98",
  "#ffbf26",
  "#7d60f0",
  "#16a9ef",
  "#e64fc2",
  "#8bc72d",
];
export const SYMBOLS = ["●", "◆", "▲", "✚", "■", "★", "♥"];
