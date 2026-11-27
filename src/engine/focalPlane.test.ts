import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_FOCUS_METERS,
  MIN_FOCUS_METERS,
  computeFocalDistanceState,
} from './focalPlane';

test('computeFocalDistanceState stays within optical focus bounds and formats distance cleanly', () => {
  const near = computeFocalDistanceState({ focusAngle: -0.25, engageAmount: 0, explode: 0 });
  const far = computeFocalDistanceState({ focusAngle: 0.9, engageAmount: 1, explode: 0 });

  assert.equal(near.distanceMeters, MIN_FOCUS_METERS);
  assert.ok(Math.abs(far.distanceMeters - MAX_FOCUS_METERS) < 1e-6);
  assert.equal(near.label, '0.45 m');
  assert.equal(far.label, '3.20 m');
  assert.ok(far.dofBandMm > near.dofBandMm);
});

test('computeFocalDistanceState keeps focal plane safely ahead of front lens bezel at all explode states', () => {
  for (const explode of [0, 0.5, 1]) {
    const frontApexZ = 28.4 + explode * 44.0;
    const state = computeFocalDistanceState({ focusAngle: 0, engageAmount: 0.25, explode });
    assert.ok(
      state.zMm >= frontApexZ + 6,
      `Expected focal plane z (${state.zMm}) to clear front apex (${frontApexZ}) at explode=${explode}`,
    );
  }
});

test('computeFocalDistanceState advances plane Z monotonically with focus travel', () => {
  const near = computeFocalDistanceState({ focusAngle: -0.1, engageAmount: 0, explode: 0 });
  const mid = computeFocalDistanceState({ focusAngle: 0.25, engageAmount: 0.4, explode: 0 });
  const far = computeFocalDistanceState({ focusAngle: 0.7, engageAmount: 1, explode: 0 });

  assert.ok(mid.zMm > near.zMm);
  assert.ok(far.zMm > mid.zMm);
  assert.ok(mid.distanceMeters > near.distanceMeters);
  assert.ok(far.distanceMeters > mid.distanceMeters);
});
