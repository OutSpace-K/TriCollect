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
  const lane = (width - 20) / ((2 * edge) / Math.sqrt(3) + 1),
    radius = lane / 2;
  const originalDepth = Math.min(108, edge * 18, (bottom - top) * 0.24);
  // Preserve the original oblique viewing angle. Larger spheres use recovered
  // vertical margins, never a flattened board or changed world geometry.
  const depthSpace = originalDepth * 0.52;
  const zScale = depthSpace / ((edge * Math.sqrt(3)) / 2),
    extent = (depthSpace * 2) / 3;
  const maxHeight = Math.min(380, bottom - top - 24 - (depthSpace * 4) / 3);
  const ballRadius = Math.min(
      radius * 0.96,
      (maxHeight - 20) / (maxCapacity * 2),
    ),
    step = ballRadius * 2,
    height = step * maxCapacity + 20;
  const axis = {
    x: width / 2,
    y:
      top +
      14 +
      height +
      extent +
      Math.max(0, (bottom - top - 24 - height - extent * 2) / 2),
  };
  // The front row and turntable use the same elliptical arc, rather than
  // independently chosen bends. Rotation happens in world coordinates first.
  const arcDepth = depthSpace * 0.9;
  const worldExtent = edge / Math.sqrt(3);
  const ellipseRadiusX = worldExtent * lane + radius + 4;
  const curve = (screenX: number) =>
    Math.sqrt(Math.max(0, 1 - (screenX / ellipseRadiusX) ** 2));
  let meanCurve = 0,
    count = 0;
  for (let q = 0; q <= edge; q++)
    for (let r = 0; r <= edge - q; r++) {
      const p = rotateWorld(worldPosition({ q, r }, side), angle);
      meanCurve += curve(p.x * lane);
      count++;
    }
  meanCurve /= count;
  const trayCurve = {
    x: axis.x,
    y: axis.y + depthSpace / 3 - arcDepth * meanCurve,
    rx: ellipseRadiusX,
    ry: arcDepth,
  };
  const point = (t: Pick<Tube, "q" | "r">) => {
    const p = rotateWorld(worldPosition(t, side), angle);
    const bow = arcDepth * (curve(p.x * lane) - meanCurve);
    return {
      x: axis.x + p.x * lane,
      y: axis.y - p.z * zScale + bow,
      depth: p.z,
    };
  };
  // Fit the full foot ellipse, including its back and lateral edges, not just
  // the frontmost center. The extra 2 px is a material/rim clearance.
  const footRy = Math.min(9, Math.max(4, (radius * zScale) / lane)) * 0.8;
  let traySurfaceRy = arcDepth + 8;
  for (let q = 0; q <= edge; q++)
    for (let r = 0; r <= edge - q; r++) {
      const p = point({ q, r });
      traySurfaceRy = Math.max(
        traySurfaceRy,
        (p.y + 5 - trayCurve.y) / curve(p.x - trayCurve.x),
      );
      for (let sample = 0; sample < 16; sample++) {
        const a = (sample * Math.PI * 2) / 16;
        const dx = p.x + (radius + 2) * Math.cos(a) - trayCurve.x;
        const dy = p.y - 2 + (footRy + 2) * Math.sin(a) - trayCurve.y;
        traySurfaceRy = Math.max(traySurfaceRy, Math.abs(dy) / curve(dx));
      }
    }
  return {
    axis,
    lane,
    radius,
    height,
    step,
    ballRadius,
    zScale,
    arcDepth,
    trayCurve,
    traySurfaceRy,
    point,
  };
}
