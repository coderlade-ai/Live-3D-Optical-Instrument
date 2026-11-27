import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FRONT_ELEMENT_ND,
  HERO_REFERENCE_FRAME_MM,
  INNER_ELEMENT_ND,
  NOMINAL_ELEMENT_COUNT,
  computeOpticalData,
} from './opticalTelemetry';

test('computeOpticalData returns accurate nominal Kessler 50mm f/1.4 optical parameters at rest', () => {
  const data = computeOpticalData({
    frameMm: HERO_REFERENCE_FRAME_MM,
    explode: 0,
    focusNorm: 0.5,
    viewMode: 'studio',
  });

  assert.equal(data.elementCount, NOMINAL_ELEMENT_COUNT);
  assert.equal(data.groupCount, 5);
  assert.equal(data.frontRefractiveIndex, FRONT_ELEMENT_ND);
  assert.equal(data.innerRefractiveIndex, INNER_ELEMENT_ND);
  assert.equal(data.zoomFactor, 1);
  assert.ok(
    data.effectiveFocalLengthMm >= 48 && data.effectiveFocalLengthMm <= 53,
    `Expected nominal EFL near 50mm, got ${data.effectiveFocalLengthMm}`,
  );
  assert.equal(data.couplingState, 'Aligned');
});

test('computeOpticalData updates EFL, air gap, and effective refractive index when exploded', () => {
  const assembled = computeOpticalData({
    frameMm: HERO_REFERENCE_FRAME_MM,
    explode: 0,
    focusNorm: 0.5,
    viewMode: 'studio',
  });
  const exploded = computeOpticalData({
    frameMm: HERO_REFERENCE_FRAME_MM,
    explode: 0.85,
    focusNorm: 0.5,
    viewMode: 'studio',
  });

  assert.ok(exploded.airGapMm > assembled.airGapMm + 20);
  assert.ok(exploded.effectiveFocalLengthMm > assembled.effectiveFocalLengthMm + 5);
  assert.ok(exploded.effectiveRefractiveIndex < assembled.effectiveRefractiveIndex);
  assert.equal(exploded.couplingState, 'Exploded');
});

test('computeOpticalData responds dynamically to camera zoom framing changes', () => {
  const wide = computeOpticalData({
    frameMm: 180,
    explode: 0,
    focusNorm: 0.5,
    viewMode: 'studio',
  });
  const close = computeOpticalData({
    frameMm: 68,
    explode: 0,
    focusNorm: 0.5,
    viewMode: 'studio',
  });

  assert.ok(close.zoomFactor > wide.zoomFactor * 2);
  assert.ok(close.effectiveFocalLengthMm > wide.effectiveFocalLengthMm);
});
