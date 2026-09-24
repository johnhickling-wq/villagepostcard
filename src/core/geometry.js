// Geometry helpers shared by the mess generator, hit-testing, the renderer
// and the bot. Polygons are arrays of [x, y] in scene units.

export function bbox(poly) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly) {
    if (x < x0) x0 = x; if (y < y0) y0 = y;
    if (x > x1) x1 = x; if (y > y1) y1 = y;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function pointInPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function polyArea(poly) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  return Math.abs(a / 2);
}

export function centroid(poly) {
  let x = 0, y = 0;
  for (const p of poly) { x += p[0]; y += p[1]; }
  return [x / poly.length, y / poly.length];
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

export function distToPoly(px, py, poly) {
  if (pointInPoly(px, py, poly)) return 0;
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    d = Math.min(d, distToSegment(px, py, poly[j][0], poly[j][1], poly[i][0], poly[i][1]));
  }
  return d;
}

/** Rotated rectangle -> polygon. (cx, cy) is the centre. */
export function rectPoly(cx, cy, w, h, rot = 0) {
  const c = Math.cos(rot), s = Math.sin(rot);
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
}

/**
 * Hit shapes: {kind:'circle', x, y, r} | {kind:'poly', pts}.
 * Returns distance from the point to the shape (0 when inside).
 */
export function distToShape(px, py, shape) {
  if (shape.kind === 'circle') return Math.max(0, Math.hypot(px - shape.x, py - shape.y) - shape.r);
  return distToPoly(px, py, shape.pts);
}

export function shapeBounds(shape) {
  if (shape.kind === 'circle') return { x: shape.x - shape.r, y: shape.y - shape.r, w: shape.r * 2, h: shape.r * 2 };
  return bbox(shape.pts);
}

export function shapeCenter(shape) {
  if (shape.kind === 'circle') return [shape.x, shape.y];
  const b = bbox(shape.pts);
  return [b.x + b.w / 2, b.y + b.h / 2];
}

/** Approximate size (diameter-ish) of a shape, used for on-screen size checks. */
export function shapeSize(shape) {
  const b = shapeBounds(shape);
  return Math.sqrt(b.w * b.h);
}

/** Uniform random point inside a polygon (rejection sampling). */
export function randomPointInPoly(poly, rng, tries = 60) {
  const b = bbox(poly);
  for (let i = 0; i < tries; i++) {
    const x = b.x + rng.next() * b.w, y = b.y + rng.next() * b.h;
    if (pointInPoly(x, y, poly)) return [x, y];
  }
  return centroid(poly);
}

/** Overlap estimate between two shapes' bounding boxes, as a fraction of the smaller. */
export function boundsOverlap(a, b) {
  const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
  if (x1 <= x0 || y1 <= y0) return 0;
  const inter = (x1 - x0) * (y1 - y0);
  return inter / Math.max(1, Math.min(a.w * a.h, b.w * b.h));
}

/** Random point along a polyline (used for "edge" zones like wall bases). */
export function randomPointOnPolyline(line, rng) {
  const lens = [];
  let total = 0;
  for (let i = 1; i < line.length; i++) {
    const l = Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
    lens.push(l); total += l;
  }
  let r = rng.next() * total;
  for (let i = 0; i < lens.length; i++) {
    if (r <= lens[i]) {
      const t = lens[i] ? r / lens[i] : 0;
      return [line[i][0] + (line[i + 1][0] - line[i][0]) * t, line[i][1] + (line[i + 1][1] - line[i][1]) * t];
    }
    r -= lens[i];
  }
  return line[line.length - 1].slice();
}
