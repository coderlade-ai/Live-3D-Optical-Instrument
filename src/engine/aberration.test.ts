import test from 'node:test';
import assert from 'node:assert/strict';
import { computeChannelSampleUVs, computeChromaticShift } from './aberration';

test('computeChromaticShift produces stronger dispersion wide open than stopped down', () => {
  const wideOpen = computeChromaticShift({
    apertureClosure: 0,
    focusNorm: 0.2,
    envTiltX: 0,
    envTiltY: 0,
  });
  const stoppedDown = computeChromaticShift({
    apertureClosure: 1,
    focusNorm: 0.2,
    envTiltX: 0,
    envTiltY: 0,
  });

  assert.ok(wideOpen.amount > stoppedDown.amount);
  assert.ok(wideOpen.fringeBoost > stoppedDown.fringeBoost);
  assert.ok(wideOpen.amount >= 0.003 && wideOpen.amount <= 0.014);
  assert.ok(stoppedDown.amount >= 0.003 && stoppedDown.amount <= 0.014);
});

test('computeChromaticShift keeps optical center safely bounded under extreme tilt', () => {
  const extreme = computeChromaticShift({
    apertureClosure: 0.5,
    focusNorm: 0.5,
    envTiltX: 5,
    envTiltY: -5,
  });

  assert.ok(extreme.centerX > 0.4 && extreme.centerX < 0.6);
  assert.ok(extreme.centerY > 0.4 && extreme.centerY < 0.6);
});

test('computeChannelSampleUVs produces zero shift at center and radial R/B separation away from center', () => {
  const atCenter = computeChannelSampleUVs([0.5, 0.5], [0.5, 0.5], 0.018, 1.6);
  assert.deepEqual(atCenter.r, [0.5, 0.5]);
  assert.deepEqual(atCenter.g, [0.5, 0.5]);
  assert.deepEqual(atCenter.b, [0.5, 0.5]);

  const outer = computeChannelSampleUVs([0.85, 0.5], [0.5, 0.5], 0.018, 1.6);
  const inner = computeChannelSampleUVs([0.65, 0.5], [0.5, 0.5], 0.018, 1.6);

  // Red shifts radially outward (> uv.x), green anchored, blue shifts inward (< uv.x)
  assert.ok(outer.r[0] > outer.g[0]);
  assert.ok(outer.b[0] < outer.g[0]);
  assert.equal(outer.g[0], 0.85);

  // Dispersion increases monotonically with distance from optical center
  const outerShift = outer.r[0] - outer.g[0];
  const innerShift = inner.r[0] - inner.g[0];
  assert.ok(outerShift > innerShift);
});
