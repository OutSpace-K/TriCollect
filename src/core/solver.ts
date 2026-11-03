import { CONFIG } from "../config";
import {
  type Board,
  available,
  take,
  replay,
  returnPocket,
  RETURN_POCKET,
} from "./rules";
export type Solution =
  | { status: "safe"; path: string[]; nodes: number }
  | { status: "unknown" | "dead"; nodes: number };
export function solve(
  initial: Board,
  now: () => number,
  maxNodes: number = CONFIG.searchNodes,
  maxMs: number = CONFIG.searchMs,
  firstVisible?: Set<string>,
): Solution {
  const start = now();
  let nodes = 0,
    exhausted = false;
  const seen = new Set<string>();
  function dfs(b: Board, first = false): string[] | null {
    if (b.status === "won") return [];
    if (b.status === "blocked") return null;
    if (++nodes > maxNodes || now() - start >= maxMs) {
      exhausted = true;
      return null;
    }
    const k =
      b.tubes.map((t) => t.balls.length).join(",") +
      "|" +
      [...b.tray, ...(b.pocket ?? []).map((x) => ({ ...x, type: x.type + 10 }))]
        .map((x) => x.type)
        .sort()
        .join(",");
    if (seen.has(k)) return null;
    seen.add(k);
    const ids = [...available(b)]
      .filter((id) => !first || !firstVisible || firstVisible.has(id))
      .sort((a, c) => {
        const count = (id: string) =>
          b.tray.filter(
            (x) =>
              x.type ===
              b.tubes.find((t) => t.id === id)!.balls.slice(-1)[0].type,
          ).length;
        return count(c) - count(a);
      });
    if (b.pocket?.length) ids.unshift(RETURN_POCKET);
    for (const id of ids) {
      const path = dfs(
        id === RETURN_POCKET
          ? returnPocket(b, `solver-${nodes}-${id}`)
          : take(b, id, `solver-${nodes}-${id}`),
      );
      if (path) return [id, ...path];
      if (exhausted) return null;
    }
    return null;
  }
  const path = dfs(initial, true);
  if (path && replay(initial, path).status === "won")
    return { status: "safe", path, nodes };
  return { status: exhausted ? "unknown" : "dead", nodes };
}
