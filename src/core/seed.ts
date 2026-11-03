/** Game variety, not security: tolerate missing/throwing/degenerate entropy. */
export function nextSeed(
  excluded: ReadonlySet<number>,
  entropy: () => number = Math.random,
): number {
  let value = NaN;
  try {
    value = entropy();
  } catch {
    /* Fall back to time, then collision stepping. */
  }
  let seed =
    Number.isFinite(value) && value >= 0 && value < 1
      ? Math.floor(value * 0x100000000) >>> 0
      : Date.now() >>> 0;
  while (excluded.has(seed)) seed = (seed + 1) >>> 0;
  return seed;
}
