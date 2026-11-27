import test from 'node:test';
import assert from 'node:assert/strict';
import { computeBokehParams, generateBokehKernelOffsets } from './bokeh';

test('computeBokehParams yields larger bokeh radius wide open and maps shapeMix cleanly', () => {
  const wideHex = computeBokehParams({
    apertureClosure: 0,
    focusNorm: 0.2,
    explode: 0,
    shape: 'hexagonal',
  });
  const stoppedCircle = computeBokehParams({
    apertureClosure: 1,
    focusNorm: 0.2,
    explode: 0,
    shape: 'circular',
  });

  assert.equal(wideHex.shapeMix, 1.0);
  assert.equal(stoppedCircle.shapeMix, 0.0);
  assert.ok(wideHex.radius > stoppedCircle.radius);
  assert.ok(wideHex.highlightGain > stoppedCircle.highlightGain);
  assert.ok(wideHex.radius >= 0.012 && wideHex.radius <= 0.044);
});

test('generateBokehKernelOffsets produces uniform circle radius vs regular hexagon flat sides', () => {
  const circular = generateBokehKernelOffsets('circular');
  const hexagonal = generateBokehKernelOffsets('hexagonal');

  assert.equal(circular.length, 19);
  assert.equal(hexagonal.length, 19);

  // Outer ring starts at index 7 (1 center + 6 inner = 7)
  const outerCircularRadii = circular.slice(7).map(([x, y]) => Math.hypot(x, y));
  const outerHexRadii = hexagonal.slice(7).map(([x, y]) => Math.hypot(x, y));

  for (const r of outerCircularRadii) {
    assert.ok(Math.abs(r - 1.0) < 1e-6, `Expected circular outer tap radius 1.0, got ${r}`);
  }

  const expectedApothem = Math.cos(Math.PI / 6);
  for (let i = 0; i < outerHexRadii.length; i++) {
    const expected = i % 2 === 0 ? 1.0 : expectedApothem;
    assert.ok(
      Math.abs(outerHexRadii[i] - expected) < 1e-6,
      `Expected hex outer tap ${i} radius ${expected}, got ${outerHexRadii[i]}`,
    );
  }
});
