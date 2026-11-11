/** Distances are screen pixels, before any short-screen canvas scaling. */
export function gesture(
  dx: number,
  dy: number,
): "tap" | "left" | "right" | null {
  if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy))
    return dx > 0 ? "right" : "left";
  return Math.hypot(dx, dy) <= 18 ? "tap" : null;
}
