/** Calibrate only at startup. Wall time is never used to charge gameplay. */
export async function calibrateClock(
  raw: () => number,
  wall: () => number = () => Date.now(),
  wait: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<{ now: () => number; unitsPerMs: 1 | 1000 }> {
  let previous: 1 | 1000 | undefined;
  for (let attempt = 0; attempt < 5; attempt++) {
    const w0 = wall(),
      r0 = raw();
    await wait(80);
    const elapsed = wall() - w0,
      delta = raw() - r0;
    const ratio = delta / elapsed;
    const unit =
      elapsed >= 40 && elapsed < 2000 && Number.isFinite(delta) && delta > 0
        ? ratio >= 0.5 && ratio <= 2
          ? 1
          : ratio >= 500 && ratio <= 2000
            ? 1000
            : undefined
        : undefined;
    if (unit && previous === unit) {
      const origin = raw();
      let last = 0,
        progressedAt = wall();
      return {
        unitsPerMs: unit,
        now: () => {
          const value = (raw() - origin) / unit;
          if (!Number.isFinite(value) || value < last)
            throw Error("Monotonic clock unavailable");
          if (value > last) progressedAt = wall();
          else if (wall() - progressedAt > 1500)
            throw Error("Monotonic clock stopped");
          last = value;
          return value;
        },
      };
    }
    previous = unit;
  }
  throw Error("Clock calibration failed; no reliable progressing clock");
}
