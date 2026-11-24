import test from 'node:test';
import assert from 'node:assert/strict';
import {
  circle,
  capsule,
  smoothUnion,
  traceLoops,
  signedPolygonArea,
  ensureCounterClockwise,
  createIrisBladeSDF,
  createBayonetPlateSDF,
} from './sdf';

test('circle SDF returns negative inside, zero on boundary, positive outside', () => {
  const c = circle(0, 0, 5);
  assert.equal(c(0, 0), -5);
  assert.equal(c(5, 0), 0);
  assert.equal(c(8, 0), 3);
});

test('smoothUnion melts overlapping primitives without sharp seam', () => {
  const a = circle(0, 0, 3);
  const b = capsule(0, 0, 10, 0, 1.5);
  const fused = smoothUnion(1.2, a, b);

  // Inside junction must be strictly deeper (more negative) than raw min
  const rawMin = Math.min(a(3, 1.5), b(3, 1.5));
  assert.ok(fused(3, 1.5) < rawMin);
});

test('traceLoops extracts valid closed contours from iris blade SDF', () => {
  const blade = createIrisBladeSDF();
  const loops = traceLoops(blade, { minX: -5, maxX: 20, minY: -5, maxY: 8 }, 48);
  assert.ok(loops.length >= 1, 'Expected at least 1 traced contour loop');
  const mainLoop = loops.sort((a, b) => Math.abs(signedPolygonArea(b)) - Math.abs(signedPolygonArea(a)))[0];
  assert.ok(mainLoop.length >= 10, 'Expected smooth detailed blade contour');
  assert.ok(Math.abs(signedPolygonArea(mainLoop)) > 40, 'Blade area in mm^2 should be realistic');
});

test('traceLoops extracts outer + inner loops for bayonet flange plate', () => {
  const plate = createBayonetPlateSDF();
  const loops = traceLoops(plate, { minX: -32, maxX: 32, minY: -32, maxY: 32 }, 56);
  assert.ok(loops.length >= 2, 'Bayonet plate must have outer lug loop and inner bore hole');
});

test('ensureCounterClockwise fixes clockwise profiles for LatheGeometry outward normals', () => {
  const cwSquare = [
    { x: 0, y: 0 },
    { x: 0, y: 10 },
    { x: 10, y: 10 },
    { x: 10, y: 0 },
  ];
  assert.ok(signedPolygonArea(cwSquare) < 0);
  const ccw = ensureCounterClockwise(cwSquare);
  assert.ok(signedPolygonArea(ccw) > 0);
});
