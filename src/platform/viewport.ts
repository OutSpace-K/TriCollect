/** Keep game controls below the native WeChat capsule and above the home indicator. */
export function viewport(
  height: number,
  safeTop = 24,
  safeBottom = height,
  menuBottom?: number,
) {
  const status = Number.isFinite(safeTop) ? Math.max(24, safeTop) : 24;
  const capsule =
    menuBottom !== undefined &&
    Number.isFinite(menuBottom) &&
    menuBottom >= status &&
    menuBottom < height / 3
      ? menuBottom + 8
      : status + 44;
  const top = Math.max(status, capsule);
  const bottom = Number.isFinite(safeBottom)
    ? Math.max(0, height - safeBottom)
    : 0;
  const usable = Math.max(1, height - top - bottom),
    logicalHeight = Math.max(usable, 660);
  return {
    top,
    bottom,
    logicalHeight,
    factor: Math.min(1, usable / logicalHeight),
  };
}
