import { PRESETS, type Preset } from "../config";
import {
  type Board,
  type Tube,
  exposed,
  key,
  replay,
  invariant,
} from "./rules";
export function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export type Level = {
  board: Board;
  witness: string[];
  seed: number;
  preset: string;
  fallback: boolean;
};
export function generate(p: Preset, seed: number): Level {
  const rnd = random(seed),
    tubes: Tube[] = [];
  for (let q = 0; q < p.side; q++)
    for (let r = 0; r < p.side - q; r++)
      tubes.push({
        id: key(q, r),
        q,
        r,
        balls: Array.from({ length: p.height }, (_, i) => ({
          id: `${q},${r}:${i}`,
          type: 0,
        })),
      });
  const b: Board = {
    side: p.side,
    tubes,
    tray: [],
    cleared: [],
    score: 0,
    status: "playing",
    applied: [],
  };
  // Find a legal geometry order before assigning types. Fixed O(ball count * tube count).
  const scratch = JSON.parse(JSON.stringify(b)) as Board,
    order: { tube: string; index: number }[] = [];
  while (scratch.tubes.some((t) => t.balls.length)) {
    const e = [...exposed(scratch)],
      selected = e[Math.floor(rnd() * e.length)];
    const t = scratch.tubes.find((t) => t.id === selected)!;
    order.push({ tube: t.id, index: t.balls.length - 1 });
    t.balls.pop();
  }
  // Two interleaved triples per window: at most four balls wait in the tray.
  // Type quotas round-robin over triple groups, then shuffle each bounded window.
  const types: number[] = [];
  for (let g = 0; g < order.length / 3; g += 2) {
    const window = [g % p.types, g % p.types, g % p.types];
    if ((g + 1) * 3 < order.length)
      window.push((g + 1) % p.types, (g + 1) % p.types, (g + 1) % p.types);
    for (let i = window.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [window[i], window[j]] = [window[j], window[i]];
    }
    types.push(...window);
  }
  order.forEach(
    (o, i) =>
      (b.tubes.find((t) => t.id === o.tube)!.balls[o.index].type = types[i]),
  );
  const witness = order.map((o) => o.tube),
    end = replay(b, witness);
  if (end.status !== "won" || !invariant(end, order.length))
    throw Error("Witness validation failed");
  return { board: b, witness, seed, preset: p.id, fallback: false };
}
export function createLevel(index: number, seed?: number): Level {
  const p = PRESETS[index] ?? PRESETS[0];
  try {
    return generate(p, seed ?? p.seed);
  } catch {
    const level = generate(p, p.seed);
    return { ...level, fallback: true };
  }
}
