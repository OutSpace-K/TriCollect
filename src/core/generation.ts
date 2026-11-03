import { PRESETS, type Preset } from "../config";
import {
  type Board,
  type Tube,
  available,
  faceVisible,
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
  views: number[];
  seed: number;
  preset: string;
  fallback: boolean;
};
export function generate(p: Preset, seed: number, revision: 1 | 2 = 2): Level {
  const rnd = random(seed),
    tubes: Tube[] = [];
  for (let q = 0; q < p.side; q++)
    for (let r = 0; r < p.side - q; r++)
      tubes.push({
        id: key(q, r),
        q,
        r,
        capacity: p.heights?.[tubes.length % p.heights.length] ?? p.height,
        balls: Array.from(
          { length: p.heights?.[tubes.length % p.heights.length] ?? p.height },
          (_, i) => ({
            id: `${q},${r}:${i}`,
            type: 0,
          }),
        ),
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
    order: { tube: string; index: number; view: number }[] = [];
  while (scratch.tubes.some((t) => t.balls.length)) {
    const e = [...available(scratch)],
      selected = e[Math.floor(rnd() * e.length)];
    const t = scratch.tubes.find((t) => t.id === selected)!;
    order.push({
      tube: t.id,
      index: t.balls.length - 1,
      view: [0, 1, 2].find((v) => faceVisible(scratch, v).has(t.id))!,
    });
    t.balls.pop();
  }
  // Revision 1 reproduces existing saved boards exactly. Revision 2 keeps
  // easy unchanged, raises normal to 3 groups, and safely interleaves 4 in hard.
  if (order.length % 3) throw Error("Total must be divisible by three");
  const types: number[] = [];
  const groups =
    (revision === 2 ? p.challengeGroups : p.groups) ?? p.groups ?? 2;
  for (let g = 0; g < order.length / 3; g += groups) {
    const window: number[] = [];
    for (let k = 0; k < groups && g + k < order.length / 3; k++)
      window.push(...Array(3).fill((g + k) % p.types));
    for (let i = window.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [window[i], window[j]] = [window[j], window[i]];
    }
    if (groups <= 3) types.push(...window);
    else {
      // Four concurrent colors increase planning pressure without changing geometry.
      // Draw only moves that leave at most six waiting balls. With <=4 colors,
      // six waiting balls necessarily contain a pair that can be completed.
      const waiting = new Map<number, number>();
      const emit = (type: number) => {
        window.splice(window.indexOf(type), 1);
        waiting.set(type, ((waiting.get(type) ?? 0) + 1) % 3);
        types.push(type);
      };
      for (const type of new Set(window)) emit(type);
      while (window.length) {
        const size = [...waiting.values()].reduce((a, b) => a + b, 0);
        const choices = [...new Set(window)].filter(
          (type) => size < 6 || waiting.get(type) === 2,
        );
        if (!choices.length) throw Error("No safe assignment");
        emit(choices[Math.floor(rnd() * choices.length)]);
      }
    }
  }
  order.forEach(
    (o, i) =>
      (b.tubes.find((t) => t.id === o.tube)!.balls[o.index].type = types[i]),
  );
  const witness = order.map((o) => o.tube),
    end = replay(b, witness);
  if (end.status !== "won" || !invariant(end, order.length))
    throw Error("Witness validation failed");
  return {
    board: b,
    witness,
    views: order.map((o) => o.view),
    seed,
    preset: p.id,
    fallback: false,
  };
}
export function createLevel(
  index: number,
  seed?: number,
  revision: 1 | 2 = 2,
): Level {
  const p = PRESETS[index] ?? PRESETS[0];
  try {
    return generate(p, seed ?? p.seed, revision);
  } catch {
    const level = generate(p, p.seed, revision);
    return { ...level, fallback: true };
  }
}
