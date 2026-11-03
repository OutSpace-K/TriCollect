import { CONFIG } from "../config";
export type Ball = { id: string; type: number };
export type Tube = {
  id: string;
  q: number;
  r: number;
  capacity: number;
  balls: Ball[];
};
export type Board = {
  side: number;
  tubes: Tube[];
  tray: Ball[];
  cleared: Ball[];
  /** One ball held outside the seven slots; absent in legacy saves. */
  pocket?: Ball[];
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
/** Cyclic barycentric view of the SAME triangular lattice; each ray peels inward. */
export function faceCoordinates(t: Tube, side: number, view: number) {
  const axes = [t.q, t.r, side - 1 - t.q - t.r];
  return { lane: axes[view], depth: axes[(view + 1) % 3] };
}
/** Front projection is centered: horizontal center = 2*lane + depth.
 * Each opaque tube covers two half-width segments. Both half-width segments must be uncovered to grant front access. Height NEVER grants access over an occupied front segment; taller rear tubes remain neutral silhouettes. */
export function faceWindows(b: Board, view: number): Map<string, number[]> {
  const result = new Map<string, number[]>();
  if (!Number.isInteger(view) || view < 0 || view > 2) return result;
  const outside = exposed(b),
    covered = new Set<number>();
  const ordered = b.tubes
    .filter((t) => t.balls.length)
    .sort(
      (a, c) =>
        faceCoordinates(a, b.side, view).depth -
        faceCoordinates(c, b.side, view).depth,
    );
  for (const t of ordered) {
    const { lane, depth } = faceCoordinates(t, b.side, view),
      center = 2 * lane + depth;
    const segments = [center - 1, center],
      windows = segments.filter((i) => !covered.has(i));
    if (windows.length === 2 && outside.has(t.id)) result.set(t.id, windows);
    for (const segment of segments) covered.add(segment);
  }
  return result;
}
export function faceVisible(b: Board, view: number): Set<string> {
  return new Set(faceWindows(b, view).keys());
}
export function available(b: Board): Set<string> {
  return new Set([0, 1, 2].flatMap((v) => [...faceVisible(b, v)]));
}
export function take(b: Board, tubeId: string, actionId: string): Board {
  if (
    b.status !== "playing" ||
    b.applied.includes(actionId) ||
    !available(b).has(tubeId)
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
  if (
    n.tubes.every((t) => !t.balls.length) &&
    !n.tray.length &&
    !n.pocket?.length
  ) {
    n.status = "won";
    n.score += CONFIG.winScore;
  } else if (n.tray.length >= CONFIG.capacity) n.status = "blocked";
  n.applied.push(actionId);
  return n;
}
/** Rewarded lift preserves identities and triples; return is always free. */
export function lift(b: Board, actionId: string): Board {
  if (
    b.status === "won" ||
    !b.tray.length ||
    b.pocket?.length ||
    b.applied.includes(actionId)
  )
    return b;
  const n = clone(b);
  n.pocket = [n.tray.pop()!];
  n.status = "playing";
  n.applied.push(actionId);
  return n;
}
export const RETURN_POCKET = "@return-pocket";
export function returnPocket(b: Board, actionId: string): Board {
  if (
    b.status !== "playing" ||
    !b.pocket?.length ||
    b.applied.includes(actionId)
  )
    return b;
  const n = clone(b),
    ball = n.pocket!.pop()!;
  n.tray.push(ball);
  const group = n.tray.filter((x) => x.type === ball.type);
  if (group.length === CONFIG.match) {
    n.cleared.push(...group);
    n.tray = n.tray.filter((x) => x.type !== ball.type);
    n.score += CONFIG.matchScore;
  }
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
    b.side > 8 ||
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
        !Array.isArray(t.balls) ||
        !Number.isInteger(t.capacity) ||
        t.capacity < 1 ||
        t.capacity > 8 ||
        t.balls.length > t.capacity,
    )
  )
    return false;
  const all = [
    ...b.tubes.flatMap((t) => t.balls),
    ...b.tray,
    ...b.cleared,
    ...(b.pocket ?? []),
  ];
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
    (b.pocket !== undefined &&
      (!Array.isArray(b.pocket) || b.pocket.length > 1)) ||
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
  const won =
    b.tubes.every((t) => !t.balls.length) &&
    !b.tray.length &&
    !b.pocket?.length;
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
    const n =
      path[i] === RETURN_POCKET ? returnPocket(b, id) : take(b, path[i], id);
    if (n === b) throw Error(`Illegal witness step ${i}`);
    b = n;
  }
  return b;
}
