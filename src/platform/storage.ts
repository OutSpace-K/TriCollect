import { isMuralVariant } from "./mural";
import { RULE, PRESETS, CONFIG } from "../config";
import { invariant, type Board } from "../core/rules";
import { createLevel } from "../core/generation";
export interface Store {
  get(k: string): string | null;
  set(k: string, v: string): void;
}
export type Reward = {
  id: string;
  session: string;
  state: "requested" | "completed" | "cancelled" | "failed";
  redeemed: boolean;
  kind?: "extend" | "lift";
};
export type Saved = {
  schema: 1;
  /** Missing means the original generator, retained for existing saves. */
  generation?: 1 | 2;
  rule: string;
  session: string;
  seed: number;
  /** Missing in older saves uses a stable session hash. Independent of puzzle seed. */
  muralVariant?: number;
  preset: number;
  board: Board;
  history: Board[];
  /** Absent in older saves: one latest undo is available if history exists. */
  undoAvailable?: boolean;
  remaining: number;
  added: number;
  extensions: number;
  rewards: Reward[];
  sequence: number;
  view: number;
  hintsUsed: number;
  undosUsed: number;
  phase: "ready" | "paused" | "blocked" | "expired" | "result";
  sound: boolean;
  started?: boolean;
  finishedAt?: number;
};
export const SAVE_KEY = "tricollect.save.v1";
export function hash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++)
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
}
const originals = new Map<string, Board>();
function originalFor(preset: number, seed: number, generation: 1 | 2) {
  const key = `${generation}:${preset}:${seed}`;
  if (!originals.has(key)) {
    if (originals.size >= 32) originals.delete(originals.keys().next().value!);
    originals.set(key, createLevel(preset, seed, generation).board);
  }
  return originals.get(key)!;
}
const lastStored = new WeakMap<Store, string>();
export function valid(s: Saved): boolean {
  try {
    if (
      s.schema !== 1 ||
      (s.generation !== undefined &&
        s.generation !== 1 &&
        s.generation !== 2) ||
      s.rule !== RULE ||
      typeof s.session !== "string" ||
      !Number.isInteger(s.seed) ||
      (s.muralVariant !== undefined && !isMuralVariant(s.muralVariant)) ||
      !Number.isInteger(s.preset) ||
      !PRESETS[s.preset]
    )
      return false;
    if (
      !Number.isFinite(s.remaining) ||
      s.remaining < 0 ||
      s.remaining > CONFIG.baseMs + CONFIG.extraMs * CONFIG.maxExtensions ||
      !Number.isInteger(s.extensions) ||
      s.extensions < 0 ||
      s.extensions > CONFIG.maxExtensions ||
      s.added !== s.extensions * CONFIG.extraMs
    )
      return false;
    if (
      !Number.isInteger(s.hintsUsed) ||
      s.hintsUsed < 0 ||
      (s.undoAvailable !== undefined && typeof s.undoAvailable !== "boolean") ||
      !Number.isInteger(s.undosUsed) ||
      s.undosUsed < 0
    )
      return false;
    if (
      !Number.isInteger(s.sequence) ||
      s.sequence < 0 ||
      !Number.isInteger(s.view) ||
      s.view < 0 ||
      s.view > 2 ||
      typeof s.sound !== "boolean" ||
      (s.started !== undefined && typeof s.started !== "boolean") ||
      (s.finishedAt !== undefined &&
        (!Number.isFinite(s.finishedAt) || s.finishedAt < 0)) ||
      !["ready", "paused", "blocked", "expired", "result"].includes(s.phase)
    )
      return false;
    if (
      !Array.isArray(s.rewards) ||
      new Set(s.rewards.map((r) => r.id)).size !== s.rewards.length ||
      s.rewards.some(
        (r) =>
          (r.kind !== undefined && !["extend", "lift"].includes(r.kind)) ||
          r.session !== s.session ||
          typeof r.id !== "string" ||
          !["requested", "completed", "cancelled", "failed"].includes(
            r.state,
          ) ||
          typeof r.redeemed !== "boolean" ||
          r.redeemed !== (r.state === "completed"),
      )
    )
      return false;
    if (
      s.rewards.filter((r) => r.redeemed && r.kind !== "lift").length !==
        s.extensions ||
      s.rewards.filter((r) => r.redeemed && r.kind === "lift").length > 1
    )
      return false;
    const original = originalFor(s.preset, s.seed, s.generation ?? 1),
      all = original.tubes.flatMap((t) => t.balls),
      identities = new Map(all.map((b) => [b.id, b.type]));
    const check = (b: Board) =>
      invariant(b, all.length) &&
      (!b.pocket?.length ||
        s.rewards.some((r) => r.kind === "lift" && r.redeemed)) &&
      b.side === original.side &&
      [
        ...b.tubes.flatMap((t) => t.balls),
        ...b.tray,
        ...b.cleared,
        ...(b.pocket ?? []),
      ].every((b) => identities.get(b.id) === b.type) &&
      b.tubes.every(
        (t) =>
          t.capacity === original.tubes.find((x) => x.id === t.id)?.capacity &&
          t.balls.every(
            (b, i) =>
              original.tubes.find((x) => x.id === t.id)?.balls[i]?.id === b.id,
          ),
      );
    return (
      check(s.board) &&
      Array.isArray(s.history) &&
      s.history.length <= all.length &&
      s.history.every(check)
    );
  } catch {
    return false;
  }
}
export function encode(s: Saved) {
  const payload = JSON.stringify(s);
  return JSON.stringify({ checksum: hash(payload), payload });
}
export function decode(raw: string | null): Saved | null {
  try {
    if (!raw) return null;
    const e = JSON.parse(raw);
    if (typeof e.payload !== "string" || hash(e.payload) !== e.checksum)
      return null;
    const s = JSON.parse(e.payload);
    return valid(s) ? s : null;
  } catch {
    return null;
  }
}
export function save(store: Store, s: Saved) {
  if (!valid(s)) throw Error("Refusing invalid save");
  // Only one undo is permitted; older snapshots are never usable after reload.
  const encoded = encode({
    ...s,
    history: s.phase === "result" ? [] : s.history.slice(-1),
  });
  store.set(SAVE_KEY + ".tmp", encoded);
  if (store.get(SAVE_KEY + ".tmp") !== encoded)
    throw Error("Storage readback failed");
  const previous = store.get(SAVE_KEY);
  if (previous && (previous === lastStored.get(store) || decode(previous)))
    store.set(SAVE_KEY + ".backup", previous);
  store.set(SAVE_KEY, encoded);
  if (store.get(SAVE_KEY) !== encoded)
    throw Error("Main storage readback failed");
  lastStored.set(store, encoded);
}
export function restore(store: Store): { save: Saved | null; message: string } {
  try {
    const raw = store.get(SAVE_KEY),
      s = decode(raw);
    if (s) return { save: s, message: "已找到未完成的一局" };
    const backup = decode(store.get(SAVE_KEY + ".backup"));
    return {
      save: backup,
      message: backup
        ? "主存档损坏，已恢复上一有效记录"
        : raw
          ? "存档损坏或版本不兼容，请重新开始"
          : "",
    };
  } catch {
    return { save: null, message: "本地存储不可用，本次可继续游玩" };
  }
}
