import { CONFIG } from "../config";
import { type Board, exposed, take, replay } from "./rules";
export type Solution =
  | { status: "safe"; path: string[]; nodes: number }
  | { status: "unknown" | "dead"; nodes: number };
export function solve(
  initial: Board,
  now: () => number,
  maxNodes: number = CONFIG.searchNodes,
  maxMs: number = CONFIG.searchMs,
): Solution {
  const start = now();
  let nodes = 0,
    exhausted = false;
  const seen = new Set<string>();
  function dfs(b: Board): string[] | null {
    if (b.status === "won") return [];
    if (b.status === "blocked") return null;
    if (++nodes > maxNodes || now() - start >= maxMs) {
      exhausted = true;
      return null;
    }
    const k =
      b.tubes.map((t) => t.balls.length).join(",") +
      "|" +
      b.tray
        .map((x) => x.type)
        .sort()
        .join(",");
    if (seen.has(k)) return null;
    seen.add(k);
    const ids = [...exposed(b)].sort((a, c) => {
      const count = (id: string) =>
        b.tray.filter(
          (x) =>
            x.type ===
            b.tubes.find((t) => t.id === id)!.balls.slice(-1)[0].type,
        ).length;
      return count(c) - count(a);
    });
    for (const id of ids) {
      const path = dfs(take(b, id, `solver-${nodes}-${id}`));
      if (path) return [id, ...path];
      if (exhausted) return null;
    }
    return null;
  }
  const path = dfs(initial);
  if (path && replay(initial, path).status === "won")
    return { status: "safe", path, nodes };
  return { status: exhausted ? "unknown" : "dead", nodes };
}
