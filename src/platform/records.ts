import type { Store, Saved } from "./storage";
import { CONFIG, PRESETS, roundBaseMs } from "../config";
export const RECORDS_KEY = "tricollect.records.v1",
  RECORD_LIMIT = 30;
export type MatchRecord = {
  session: string;
  endedAt: number;
  preset: number;
  difficulty: string;
  outcome: "won" | "lost";
  score: number;
  cleared: number;
  total: number;
  /** Saved round budget; absent historical records retain legacy bounds. */
  baseMs?: number;
  elapsedMs: number;
  addedMs: number;
  /** Optional for compatibility; absent legacy entries are not experiment data. */
  generation?: 1 | 2;
  hintsUsed?: number;
  undosUsed?: number;
  rewardedAds?: number;
};
export type RecordRead = {
  entries: MatchRecord[];
  available: boolean;
  recovered: boolean;
};
function parse(raw: string | null): MatchRecord[] | null {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (
      v.schema !== 1 ||
      !Array.isArray(v.entries) ||
      v.entries.length > RECORD_LIMIT
    )
      return null;
    const a = v.entries as MatchRecord[];
    if (
      new Set(a.map((r) => r.session)).size !== a.length ||
      a.some(
        (r) =>
          typeof r.session !== "string" ||
          !r.session ||
          !Number.isFinite(r.endedAt) ||
          r.endedAt < 0 ||
          !Number.isInteger(r.preset) ||
          !PRESETS[r.preset] ||
          typeof r.difficulty !== "string" ||
          !["won", "lost"].includes(r.outcome) ||
          ![r.score, r.cleared, r.total, r.elapsedMs, r.addedMs].every(
            (n) => Number.isFinite(n) && n >= 0,
          ) ||
          (r.generation !== undefined &&
            r.generation !== 1 &&
            r.generation !== 2) ||
          [r.hintsUsed, r.undosUsed, r.rewardedAds].some(
            (n) => n !== undefined && (!Number.isInteger(n) || n < 0),
          ) ||
          r.total < 1 ||
          r.cleared > r.total ||
          (r.baseMs !== undefined &&
            r.baseMs !== roundBaseMs(r.preset) &&
            r.baseMs !== CONFIG.baseMs) ||
          r.elapsedMs >
            (r.baseMs === undefined
              ? CONFIG.baseMs + CONFIG.extraMs * CONFIG.maxExtensions
              : r.baseMs + r.addedMs),
      )
    )
      return null;
    return a;
  } catch {
    return null;
  }
}
export function readRecords(store: Store): RecordRead {
  try {
    const raw = store.get(RECORDS_KEY),
      a = parse(raw);
    if (a) return { entries: a, available: true, recovered: false };
    const backupRaw = store.get(RECORDS_KEY + ".backup");
    const backup = backupRaw ? parse(backupRaw) : null;
    return {
      entries: backup ?? [],
      available: backup !== null,
      recovered: true,
    };
  } catch {
    return { entries: [], available: false, recovered: false };
  }
}
export function appendResult(
  store: Store,
  s: Saved,
  correctVictory = false,
): boolean {
  if (!s.started || s.phase !== "result" || s.finishedAt === undefined)
    return true;
  const loaded = readRecords(store);
  if (!loaded.available) return false;
  const existing = loaded.entries.find((r) => r.session === s.session);
  if (
    existing &&
    !(correctVictory && existing.outcome === "lost" && s.board.status === "won")
  )
    return true;
  const entry: MatchRecord = {
    session: s.session,
    endedAt: s.finishedAt,
    preset: s.preset,
    difficulty: PRESETS[s.preset].name,
    outcome: s.board.status === "won" ? "won" : "lost",
    score: s.board.score,
    cleared: s.board.cleared.length,
    total: s.board.tubes.reduce((n, t) => n + t.capacity, 0),
    baseMs: s.baseMs ?? CONFIG.baseMs,
    elapsedMs: Math.max(0, (s.baseMs ?? CONFIG.baseMs) + s.added - s.remaining),
    addedMs: s.added,
    generation: s.generation ?? 1,
    hintsUsed: s.hintsUsed,
    undosUsed: s.undosUsed,
    rewardedAds: s.rewards.filter((r) => r.redeemed).length,
  };
  const payload = JSON.stringify({
    schema: 1,
    entries: existing
      ? loaded.entries.map((r) => (r.session === s.session ? entry : r))
      : [entry, ...loaded.entries].slice(0, RECORD_LIMIT),
  });
  try {
    store.set(
      RECORDS_KEY + ".backup",
      JSON.stringify({ schema: 1, entries: loaded.entries }),
    );
    store.set(RECORDS_KEY, payload);
    return store.get(RECORDS_KEY) === payload;
  } catch {
    return false;
  }
}

/** Descriptive local sample only: not a population win-rate or a difficulty guarantee. */
export function hardSample(entries: MatchRecord[]) {
  const eligible = entries.filter(
    (r) =>
      r.preset === 2 &&
      r.generation === 2 &&
      r.rewardedAds === 0 &&
      r.addedMs === 0 &&
      r.hintsUsed !== undefined &&
      r.undosUsed !== undefined,
  );
  const wins = eligible.filter((r) => r.outcome === "won").length;
  return {
    completed: eligible.length,
    wins,
    rate: eligible.length ? wins / eligible.length : null,
    excluded: entries.length - eligible.length,
    limit: RECORD_LIMIT,
  };
}
