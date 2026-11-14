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
    step = ballRadius * 1.94,
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

  const worldExtent = edge / Math.sqrt(3);
  const ellipseRadiusX = worldExtent * lane + radius + 4;
  const curve = (screenX: number) =>
    Math.sqrt(Math.max(0, 1 - (screenX / ellipseRadiusX) ** 2));
  // Reference right-panel foot centers span ~397 px with a 37 px center drop.
  // Normalize to front-row width, not unrelated board height or tube capacity.
  const frontHalfSpan = (edge * lane) / 2;
  const referenceSagRatio = 37 / 397;
  let arcDepth =
    (frontHalfSpan * 2 * referenceSagRatio) / (1 - curve(frontHalfSpan));
  let meanCurve = 0,
    count = 0;
  for (let q = 0; q <= edge; q++)
    for (let r = 0; r <= edge - q; r++) {
      const p = rotateWorld(worldPosition({ q, r }, side), angle);
      meanCurve += curve(p.x * lane);
      count++;
    }
  meanCurve /= count;
  // The deeper reference arc can lift a rear corner during rotation. Translate
  // the whole arrangement only when needed; never shrink balls or change slots.
  const offsets = (bend: number) => {
    let min = Infinity,
      max = -Infinity;
    for (let q = 0; q <= edge; q++)
      for (let r = 0; r <= edge - q; r++) {
        const p = rotateWorld(worldPosition({ q, r }, side), angle);
        const offset = -p.z * zScale + bend * (curve(p.x * lane) - meanCurve);
        min = Math.min(min, offset);
        max = Math.max(max, offset);
      }
    return { min, max };
  };
  // Exception for extremely wide/short layouts: prioritize uncropped original
  // ball size over the artistic target. Regular phone sizes retain full sag.
  let fit = offsets(arcDepth);
  if (fit.max - fit.min > bottom - top - height) {
    let lo = 0,
      hi = arcDepth;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2,
        trial = offsets(mid);
      if (trial.max - trial.min <= bottom - top - height) lo = mid;
      else hi = mid;
    }
    arcDepth = lo;
    fit = offsets(arcDepth);
  }
  const minOffset = fit.min,
    maxOffset = fit.max;
  axis.y = Math.max(
    top + height - minOffset,
    Math.min(bottom - maxOffset, axis.y),
  );
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
  // The arrangement arc is not the platter outline. Fit an independent,
  // minimum-height surface to the complete foot perimeter with 2 px clearance.
  const footRy = radius * 0.3 + Math.max(1.5, radius * 0.08) / 2;
  const samples: { y: number; c: number }[] = [];
  for (let q = 0; q <= edge; q++)
    for (let r = 0; r <= edge - q; r++) {
      const p = point({ q, r });
      samples.push({ y: p.y + 5, c: curve(p.x - trayCurve.x) });
      for (let sample = 0; sample < 16; sample++) {
        const a = (sample * Math.PI * 2) / 16;
        samples.push({
          y: p.y - 2 + (footRy + 2) * Math.sin(a),
          c: curve(p.x + (radius + 2) * Math.cos(a) - trayCurve.x),
        });
      }
    }
  let lowY = Infinity,
    highY = -Infinity;
  for (const p of samples) {
    lowY = Math.min(lowY, p.y);
    highY = Math.max(highY, p.y);
  }
  const requiredRadius = (cy: number) => {
    let ry = 0;
    for (const p of samples) ry = Math.max(ry, Math.abs(p.y - cy) / p.c);
    return ry;
  };
  // Convex minimax objective; fixed iterations produce deterministic fit.
  for (let i = 0; i < 28; i++) {
    const left = (lowY * 2 + highY) / 3,
      right = (lowY + highY * 2) / 3;
    if (requiredRadius(left) < requiredRadius(right)) highY = right;
    else lowY = left;
  }
  const minFitY = (lowY + highY) / 2;
  // Preserve the production artwork's native aspect ratio so its arrows/clasp
  // are never crushed by an otherwise geometrically sufficient shallow ellipse.
  const traySurfaceRy = Math.max(
    requiredRadius(minFitY) + 0.1,
    (ellipseRadiusX * 84) / 380,
  );
  // Of all feasible centers at this radius, prefer the highest to keep the
  // front fascia clear of the held-ball control below the board.
  let traySurfaceY = -Infinity;
  for (const p of samples)
    traySurfaceY = Math.max(traySurfaceY, p.y - traySurfaceRy * p.c);
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
    traySurfaceY,
    traySurfaceRy,
    point,
  };
}
