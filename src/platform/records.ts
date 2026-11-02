import type { Store, Saved } from "./storage";
import { CONFIG, PRESETS } from "../config";
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
  elapsedMs: number;
  addedMs: number;
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
          r.total < 1 ||
          r.cleared > r.total ||
          r.elapsedMs > CONFIG.baseMs + CONFIG.extraMs * CONFIG.maxExtensions,
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
export function appendResult(store: Store, s: Saved): boolean {
  if (!s.started || s.phase !== "result" || s.finishedAt === undefined)
    return true;
  const loaded = readRecords(store);
  if (!loaded.available) return false;
  if (loaded.entries.some((r) => r.session === s.session)) return true;
  const entry: MatchRecord = {
    session: s.session,
    endedAt: s.finishedAt,
    preset: s.preset,
    difficulty: PRESETS[s.preset].name,
    outcome: s.board.status === "won" ? "won" : "lost",
    score: s.board.score,
    cleared: s.board.cleared.length,
    total: s.board.tubes.reduce((n, t) => n + t.capacity, 0),
    elapsedMs: Math.max(0, CONFIG.baseMs + s.added - s.remaining),
    addedMs: s.added,
  };
  const payload = JSON.stringify({
    schema: 1,
    entries: [entry, ...loaded.entries].slice(0, RECORD_LIMIT),
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
