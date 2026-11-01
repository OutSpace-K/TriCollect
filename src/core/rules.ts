import { CONFIG } from "../config";
export type Ball = { id: string; type: number };
export type Tube = { id: string; q: number; r: number; balls: Ball[] };
export type Board = {
  side: number;
  tubes: Tube[];
  tray: Ball[];
  cleared: Ball[];
  score: number;
  status: "playing" | "blocked" | "won";
  applied: string[];
};
const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, -1],
  [-1, 1],
];
export const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
export const key = (q: number, r: number) => `${q},${r}`;
export const boundary = (t: Tube, n: number) =>
  t.q === 0 || t.r === 0 || t.q + t.r === n - 1;
export function exposed(b: Board): Set<string> {
  const lookup = new Map(b.tubes.map((t) => [key(t.q, t.r), t]));
  const empty = new Set<string>();
  const queue = b.tubes.filter((t) => !t.balls.length && boundary(t, b.side));
  for (const t of queue) empty.add(t.id);
  for (let i = 0; i < queue.length; i++)
    for (const [dq, dr] of DIRS) {
      const t = lookup.get(key(queue[i].q + dq, queue[i].r + dr));
      if (t && !t.balls.length && !empty.has(t.id)) {
        empty.add(t.id);
        queue.push(t);
      }
    }
  return new Set(
    b.tubes
      .filter(
        (t) =>
          t.balls.length &&
          (boundary(t, b.side) ||
            DIRS.some(([dq, dr]) => empty.has(key(t.q + dq, t.r + dr)))),
      )
      .map((t) => t.id),
  );
}
export function take(b: Board, tubeId: string, actionId: string): Board {
  if (
    b.status !== "playing" ||
    b.applied.includes(actionId) ||
    !exposed(b).has(tubeId)
  )
    return b;
  const n = clone(b),
    t = n.tubes.find((t) => t.id === tubeId)!;
  const ball = t.balls.pop()!;
  n.tray.push(ball);
  const group = n.tray.filter((x) => x.type === ball.type);
  if (group.length === CONFIG.match) {
    n.cleared.push(...group);
    n.tray = n.tray.filter((x) => x.type !== ball.type);
    n.score += CONFIG.matchScore;
  }
  if (!t.balls.length) n.score += CONFIG.tubeScore;
  if (n.tubes.every((t) => !t.balls.length) && !n.tray.length) {
    n.status = "won";
    n.score += CONFIG.winScore;
  } else if (n.tray.length >= CONFIG.capacity) n.status = "blocked";
  n.applied.push(actionId);
  return n;
}
export function invariant(b: Board, expected: number): boolean {
  if (
    !b ||
    !Number.isInteger(b.side) ||
    b.side < 4 ||
    b.side > 6 ||
    !Array.isArray(b.tubes) ||
    !Array.isArray(b.tray) ||
    !Array.isArray(b.cleared) ||
    !Array.isArray(b.applied)
  )
    return false;
  if (
    b.tubes.length !== (b.side * (b.side + 1)) / 2 ||
    new Set(b.tubes.map((t) => t.id)).size !== b.tubes.length
  )
    return false;
  if (
    b.tubes.some(
      (t) =>
        !Number.isInteger(t.q) ||
        !Number.isInteger(t.r) ||
        t.q < 0 ||
        t.r < 0 ||
        t.q + t.r >= b.side ||
        t.id !== key(t.q, t.r) ||
        !Array.isArray(t.balls),
    )
  )
    return false;
  const all = [...b.tubes.flatMap((t) => t.balls), ...b.tray, ...b.cleared];
  if (
    all.length !== expected ||
    new Set(all.map((x) => x.id)).size !== all.length ||
    all.some(
      (x) =>
        typeof x.id !== "string" ||
        !Number.isInteger(x.type) ||
        x.type < 0 ||
        x.type > 6,
    )
  )
    return false;
  if (
    b.tray.length > CONFIG.capacity ||
    new Set(b.applied).size !== b.applied.length ||
    b.applied.some((x) => typeof x !== "string")
  )
    return false;
  for (let type = 0; type < 7; type++)
    if (
      b.tray.filter((x) => x.type === type).length >= 3 ||
      b.cleared.filter((x) => x.type === type).length % 3 !== 0
    )
      return false;
  const won = b.tubes.every((t) => !t.balls.length) && !b.tray.length;
  const expectedStatus = won
    ? "won"
    : b.tray.length === CONFIG.capacity
      ? "blocked"
      : "playing";
  return (
    b.status === expectedStatus &&
    b.score ===
      (b.cleared.length / 3) * CONFIG.matchScore +
        b.tubes.filter((t) => !t.balls.length).length * CONFIG.tubeScore +
        (won ? CONFIG.winScore : 0)
  );
}
export function replay(initial: Board, path: string[]): Board {
  let b = clone(initial);
  for (let i = 0; i < path.length; i++) {
    let id = `replay-${i}`;
    while (b.applied.includes(id)) id += "-";
    const n = take(b, path[i], id);
    if (n === b) throw Error(`Illegal witness step ${i}`);
    b = n;
  }
  return b;
}
