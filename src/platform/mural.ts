import type { Store } from "./storage";

/** Offline composition IDs, not unique AI-generated artworks. */
export const MURAL_VARIANTS = 8192;
export const MURAL_RECENT_LIMIT = 64;
export const MURAL_RECENT_KEY = "tricollect.mural.recent.v1";
export function isMuralVariant(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) >= 0 &&
    (value as number) < MURAL_VARIANTS
  );
}
/** Stable migration for old saves; view, moves and hidden colors are excluded. */
export function muralVariantFor(state: {
  muralVariant?: number;
  session: string;
  seed: number;
  preset: number;
}): number {
  if (state.muralVariant !== undefined) return state.muralVariant;
  let hash = 2166136261;
  for (const ch of `${state.session}:${state.seed}:${state.preset}`)
    hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  return (hash >>> 0) % MURAL_VARIANTS;
}
export function readMuralRecent(store: Store): number[] {
  try {
    const parsed: unknown = JSON.parse(store.get(MURAL_RECENT_KEY) ?? "[]");
    if (
      !Array.isArray(parsed) ||
      parsed.length > MURAL_RECENT_LIMIT ||
      !parsed.every(isMuralVariant) ||
      new Set(parsed).size !== parsed.length
    )
      return [];
    return parsed;
  } catch {
    return [];
  }
}
export function chooseMuralVariant(
  excluded: ReadonlySet<number>,
  entropy: () => number = Math.random,
  previousVariant?: number,
): number {
  const allowed = (candidate: number) =>
    !excluded.has(candidate) &&
    (previousVariant === undefined || candidate % 4 !== previousVariant % 4);
  let candidate = (Date.now() >>> 0) % MURAL_VARIANTS;
  // Rejection sampling stays uniform among allowed IDs with a healthy source.
  // A bounded fallback handles constant, throwing or invalid entropy offline.
  for (let attempt = 0; attempt < 16; attempt++) {
    let sample = NaN;
    try {
      sample = entropy();
    } catch {
      /* use bounded fallback */
    }
    if (!Number.isFinite(sample) || sample < 0 || sample >= 1) break;
    candidate = Math.floor(sample * MURAL_VARIANTS);
    if (allowed(candidate)) return candidate;
  }
  // Odd stride visits all IDs and spreads degenerate-source choices.
  for (let i = 0; i < MURAL_VARIANTS; i++) {
    if (allowed(candidate)) return candidate;
    candidate = (candidate + 4051) % MURAL_VARIANTS;
  }
  throw Error("No available mural composition");
}
export function rememberMuralVariant(
  store: Store,
  recent: number[],
  variant: number,
): number[] {
  const next = [...recent.filter((v) => v !== variant), variant].slice(
    -MURAL_RECENT_LIMIT,
  );
  try {
    store.set(MURAL_RECENT_KEY, JSON.stringify(next));
  } catch {
    // Keep session-local avoidance even when durable preferences are unavailable.
  }
  return next;
}
