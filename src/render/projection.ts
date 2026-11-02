import type { Tube } from "../core/rules";
/** Equilateral lattice centered on its geometric centroid, not the remaining tubes. */
export function worldPosition(t: Pick<Tube, "q" | "r">, side: number) {
  const edge = side - 1;
  return {
    x: t.q + t.r / 2 - edge / 2,
    z: ((t.r - edge / 3) * Math.sqrt(3)) / 2,
  };
}
export function rotateWorld(p: { x: number; z: number }, angle: number) {
  return {
    x: p.x * Math.cos(angle) + p.z * Math.sin(angle),
    z: -p.x * Math.sin(angle) + p.z * Math.cos(angle),
  };
}
export function projection(
  side: number,
  width: number,
  top: number,
  bottom: number,
  angle: number,
  maxCapacity = 5,
) {
  const edge = side - 1;
  // Reserve the complete circumcircle so intermediate angles never crop the bundle.
  const lane = (width - 32) / ((2 * edge) / Math.sqrt(3) + 1),
    radius = lane / 2;
  const originalDepth = Math.min(108, edge * 18, (bottom - top) * 0.24);
  const depthSpace = originalDepth * 0.8;
  const zScale = depthSpace / ((edge * Math.sqrt(3)) / 2),
    extent = (depthSpace * 2) / 3;
  const maxHeight = Math.min(220, bottom - top - 48 - (originalDepth * 4) / 3);
  const ballRadius = Math.min(
      radius * 0.78,
      (maxHeight - 20) / (maxCapacity * 2),
    ),
    step = ballRadius * 2,
    height = step * maxCapacity + 20;
  const axis = {
    x: width / 2,
    y:
      top +
      30 +
      height +
      extent +
      Math.max(0, (bottom - top - 48 - height - extent * 2) / 2),
  };
  const point = (t: Pick<Tube, "q" | "r">) => {
    const p = rotateWorld(worldPosition(t, side), angle);
    return { x: axis.x + p.x * lane, y: axis.y - p.z * zScale, depth: p.z };
  };
  return { axis, lane, radius, height, step, ballRadius, zScale, point };
}
