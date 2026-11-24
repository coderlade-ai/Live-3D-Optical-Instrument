export interface Point2D {
  x: number;
  y: number;
}

export type SDF2D = (x: number, y: number) => number;

/**
 * Signed distance to a circle centered at (cx, cy) with radius r (in millimetres).
 * Negative inside, positive outside.
 */
export function circle(cx: number, cy: number, r: number): SDF2D {
  return (x: number, y: number) => Math.hypot(x - cx, y - cy) - r;
}

/**
 * Signed distance to a rounded capsule segment from (ax, ay) to (bx, by) with radius r (in mm).
 */
export function capsule(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  r: number,
): SDF2D {
  const bax = bx - ax;
  const bay = by - ay;
  const baLenSq = bax * bax + bay * bay || 1e-9;

  return (x: number, y: number) => {
    const pax = x - ax;
    const pay = y - ay;
    const h = Math.max(0, Math.min(1, (pax * bax + pay * bay) / baLenSq));
    return Math.hypot(pax - bax * h, pay - bay * h) - r;
  };
}

/**
 * Polynomial smooth-minimum union (fillet radius k in mm) melting 2D shapes together.
 */
export function smoothUnion(k: number, ...shapes: SDF2D[]): SDF2D {
  if (shapes.length === 0) {
    return () => 1e6;
  }
  const radius = Math.max(k, 1e-4);
  return (x: number, y: number) => {
    let d = shapes[0](x, y);
    for (let i = 1; i < shapes.length; i++) {
      const b = shapes[i](x, y);
      const h = Math.max(radius - Math.abs(d - b), 0) / radius;
      d = Math.min(d, b) - h * h * radius * 0.25;
    }
    return d;
  };
}

/**
 * Smooth boolean subtraction: removes shapeB from shapeA with fillet radius k.
 */
export function smoothSubtract(k: number, shapeA: SDF2D, shapeB: SDF2D): SDF2D {
  const radius = Math.max(k, 1e-4);
  return (x: number, y: number) => {
    const dA = shapeA(x, y);
    const dB = -shapeB(x, y);
    const h = Math.max(radius - Math.abs(dA - dB), 0) / radius;
    return Math.max(dA, dB) + h * h * radius * 0.25;
  };
}

export interface TraceBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Marching Squares zero-contour tracer.
 * Evaluates a 2D SDF on a grid, extracts interpolated contour segments,
 * stitches them into closed 2D loops, and simplifies redundant collinear points.
 */
export function traceLoops(
  sdf: SDF2D,
  bounds: TraceBounds,
  resolution = 64,
): Point2D[][] {
  const cols = Math.max(8, resolution);
  const rows = Math.max(8, resolution);
  const dx = (bounds.maxX - bounds.minX) / cols;
  const dy = (bounds.maxY - bounds.minY) / rows;

  // Sample field
  const field = new Float32Array((cols + 1) * (rows + 1));
  for (let iy = 0; iy <= rows; iy++) {
    const y = bounds.minY + iy * dy;
    for (let ix = 0; ix <= cols; ix++) {
      const x = bounds.minX + ix * dx;
      field[iy * (cols + 1) + ix] = sdf(x, y);
    }
  }

  const val = (ix: number, iy: number) => field[iy * (cols + 1) + ix];
  const interp = (v0: number, v1: number) => {
    const denom = v1 - v0;
    if (Math.abs(denom) < 1e-8) return 0.5;
    return Math.max(0, Math.min(1, -v0 / denom));
  };

  const segments: Segment[] = [];

  for (let iy = 0; iy < rows; iy++) {
    const y0 = bounds.minY + iy * dy;
    const y1 = y0 + dy;
    for (let ix = 0; ix < cols; ix++) {
      const x0 = bounds.minX + ix * dx;
      const x1 = x0 + dx;

      const vBL = val(ix, iy);
      const vBR = val(ix + 1, iy);
      const vTR = val(ix + 1, iy + 1);
      const vTL = val(ix, iy + 1);

      let mask = 0;
      if (vBL < 0) mask |= 1;
      if (vBR < 0) mask |= 2;
      if (vTR < 0) mask |= 4;
      if (vTL < 0) mask |= 8;

      if (mask === 0 || mask === 15) continue;

      const eBottom: Point2D = { x: x0 + interp(vBL, vBR) * dx, y: y0 };
      const eRight: Point2D = { x: x1, y: y0 + interp(vBR, vTR) * dy };
      const eTop: Point2D = { x: x0 + interp(vTL, vTR) * dx, y: y1 };
      const eLeft: Point2D = { x: x0, y: y0 + interp(vBL, vTL) * dy };

      const pushSeg = (a: Point2D, b: Point2D) => {
        segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
      };

      switch (mask) {
        case 1:
        case 14:
          pushSeg(eLeft, eBottom);
          break;
        case 2:
        case 13:
          pushSeg(eBottom, eRight);
          break;
        case 3:
        case 12:
          pushSeg(eLeft, eRight);
          break;
        case 4:
        case 11:
          pushSeg(eRight, eTop);
          break;
        case 5: {
          const center = (vBL + vBR + vTR + vTL) * 0.25;
          if (center < 0) {
            pushSeg(eLeft, eTop);
            pushSeg(eBottom, eRight);
          } else {
            pushSeg(eLeft, eBottom);
            pushSeg(eRight, eTop);
          }
          break;
        }
        case 6:
        case 9:
          pushSeg(eBottom, eTop);
          break;
        case 7:
        case 8:
          pushSeg(eLeft, eTop);
          break;
        case 10: {
          const center = (vBL + vBR + vTR + vTL) * 0.25;
          if (center < 0) {
            pushSeg(eLeft, eBottom);
            pushSeg(eRight, eTop);
          } else {
            pushSeg(eLeft, eTop);
            pushSeg(eBottom, eRight);
          }
          break;
        }
      }
    }
  }

  // Stitch unordered segments into closed polylines using quantized spatial keys
  const quantKey = (x: number, y: number) =>
    `${Math.round(x * 1e4)},${Math.round(y * 1e4)}`;

  const adjacency = new Map<string, number[]>();
  const addAdj = (k: string, idx: number) => {
    const list = adjacency.get(k);
    if (list) list.push(idx);
    else adjacency.set(k, [idx]);
  };

  segments.forEach((seg, idx) => {
    addAdj(quantKey(seg.x1, seg.y1), idx);
    addAdj(quantKey(seg.x2, seg.y2), idx);
  });

  const used = new Uint8Array(segments.length);
  const rawLoops: Point2D[][] = [];

  for (let i = 0; i < segments.length; i++) {
    if (used[i]) continue;
    used[i] = 1;

    const first = segments[i];
    const loop: Point2D[] = [
      { x: first.x1, y: first.y1 },
      { x: first.x2, y: first.y2 },
    ];

    let extended = true;
    while (extended) {
      extended = false;
      const tail = loop[loop.length - 1];
      const tailKey = quantKey(tail.x, tail.y);
      const candidates = adjacency.get(tailKey);
      if (!candidates) break;

      for (const segIdx of candidates) {
        if (used[segIdx]) continue;
        const seg = segments[segIdx];
        const k1 = quantKey(seg.x1, seg.y1);
        const k2 = quantKey(seg.x2, seg.y2);
        if (k1 === tailKey) {
          used[segIdx] = 1;
          loop.push({ x: seg.x2, y: seg.y2 });
          extended = true;
          break;
        } else if (k2 === tailKey) {
          used[segIdx] = 1;
          loop.push({ x: seg.x1, y: seg.y1 });
          extended = true;
          break;
        }
      }
    }

    if (loop.length >= 4) {
      rawLoops.push(simplifyClosedLoop(loop, Math.min(dx, dy) * 0.12));
    }
  }

  return rawLoops.filter((loop) => loop.length >= 3);
}

/**
 * Signed area of a 2D polygon (positive = counter-clockwise, negative = clockwise).
 */
export function signedPolygonArea(points: Point2D[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area * 0.5;
}

/**
 * Ensures a 2D lathe profile or contour is wound counter-clockwise so Three.js
 * LatheGeometry / ExtrudeGeometry face normals always point outward.
 */
export function ensureCounterClockwise<T extends Point2D>(points: T[]): T[] {
  if (points.length < 3) return [...points];
  return signedPolygonArea(points) < 0 ? [...points].reverse() : [...points];
}

function simplifyClosedLoop(points: Point2D[], tolerance: number): Point2D[] {
  const cleaned: Point2D[] = [];
  const tolSq = tolerance * tolerance;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const prev = cleaned[cleaned.length - 1];
    if (!prev || (p.x - prev.x) ** 2 + (p.y - prev.y) ** 2 > tolSq) {
      cleaned.push(p);
    }
  }

  // Remove closing duplicate if it matches the start
  if (cleaned.length > 2) {
    const first = cleaned[0];
    const last = cleaned[cleaned.length - 1];
    if ((first.x - last.x) ** 2 + (first.y - last.y) ** 2 <= tolSq) {
      cleaned.pop();
    }
  }

  // Light angular decimation to keep extrusion mesh crisp and lightweight
  const decimated: Point2D[] = [];
  const n = cleaned.length;
  for (let i = 0; i < n; i++) {
    const prev = cleaned[(i - 1 + n) % n];
    const curr = cleaned[i];
    const next = cleaned[(i + 1) % n];
    const ax = curr.x - prev.x;
    const ay = curr.y - prev.y;
    const bx = next.x - curr.x;
    const by = next.y - curr.y;
    const cross = Math.abs(ax * by - ay * bx);
    const lenA = Math.hypot(ax, ay) || 1;
    const lenB = Math.hypot(bx, by) || 1;
    if (cross / (lenA * lenB) > 0.015 || decimated.length < 3) {
      decimated.push(curr);
    }
  }

  return decimated.length >= 3 ? decimated : cleaned;
}

/**
 * Builds the 2D SDF for one curved mechanical iris diaphragm blade (in mm).
 * Follows Step 03 of the guide: simple circles & capsule melted together with smoothUnion.
 */
export function createIrisBladeSDF(): SDF2D {
  return smoothUnion(
    1.8,
    circle(0, 0, 3.1),
    capsule(0, 0, 8.8, 3.2, 2.2),
    capsule(8.8, 3.2, 16.4, 2.1, 1.55),
    circle(16.8, 1.8, 1.45),
  );
}

/**
 * Builds the 2D SDF for the rear bayonet mount flange plate with 3 precision locking lugs (in mm).
 */
export function createBayonetPlateSDF(): SDF2D {
  const baseRing = circle(0, 0, 27.2);
  const lugAngles = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3];
  const lugs = lugAngles.map((a) => {
    const x1 = Math.cos(a - 0.16) * 26.8;
    const y1 = Math.sin(a - 0.16) * 26.8;
    const x2 = Math.cos(a + 0.16) * 26.8;
    const y2 = Math.sin(a + 0.16) * 26.8;
    return capsule(x1, y1, x2, y2, 2.5);
  });
  const outerShape = smoothUnion(1.4, baseRing, ...lugs);
  const innerBore = circle(0, 0, 18.2);
  return smoothSubtract(0.6, outerShape, innerBore);
}
