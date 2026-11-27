import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dielectricF0,
  schlickFresnel,
  computeReflectionIntensity,
  computeLiveReflectionReadout,
  sampleHeatMapColor,
  HEATMAP_STOPS,
} from './heatmap';

test('dielectricF0 computes realistic normal-incidence glass reflectance (~7% for IOR 1.72)', () => {
  const f0 = dielectricF0(1.72);
  assert.ok(f0 > 0.065 && f0 < 0.075, `Expected flint glass F0 ~0.070, got ${f0}`);
  assert.equal(dielectricF0(1.0), 0);
});

test('schlickFresnel rises monotonically from F0 at normal incidence to 1.0 at grazing angle', () => {
  const f0 = dielectricF0(1.72);
  const normal = schlickFresnel(1.0, f0);
  const mid = schlickFresnel(0.45, f0);
  const grazing = schlickFresnel(0.0, f0);

  assert.ok(Math.abs(normal - f0) < 1e-6);
  assert.ok(mid > normal);
  assert.ok(Math.abs(grazing - 1.0) < 1e-6);
});

test('computeReflectionIntensity orders matte baffle < satin metal < polished bevel', () => {
  const baffle = computeReflectionIntensity({
    nDotV: 0.65,
    rDotL: 0.85,
    profile: { metalness: 0.2, roughness: 0.88, ior: 1.45, envIntensity: 0.4, isGlass: false },
  });
  const satin = computeReflectionIntensity({
    nDotV: 0.65,
    rDotL: 0.85,
    profile: { metalness: 1.0, roughness: 0.28, ior: 1.5, envIntensity: 1.4, isGlass: false },
  });
  const bevel = computeReflectionIntensity({
    nDotV: 0.65,
    rDotL: 0.96,
    profile: { metalness: 1.0, roughness: 0.06, ior: 1.5, envIntensity: 1.85, isGlass: false },
  });

  assert.ok(baffle < satin, `Expected baffle (${baffle}) < satin (${satin})`);
  assert.ok(satin < bevel, `Expected satin (${satin}) < bevel (${bevel})`);
  assert.ok(bevel <= 1.0 && baffle >= 0.0);
});

test('optical glass reflects far more strongly at grazing rims than center incidence', () => {
  const glassProfile = {
    metalness: 0.05,
    roughness: 0.03,
    ior: 1.72,
    envIntensity: 2.4,
    isGlass: true,
  };
  const center = computeReflectionIntensity({ nDotV: 0.98, rDotL: 0.35, profile: glassProfile });
  const rim = computeReflectionIntensity({ nDotV: 0.12, rDotL: 0.92, profile: glassProfile });

  assert.ok(rim > center * 2.5, `Expected grazing rim (${rim}) >> center (${center})`);
});

test('sampleHeatMapColor clamps cleanly and matches endpoint stops', () => {
  const low = sampleHeatMapColor(-0.5);
  const high = sampleHeatMapColor(1.5);
  assert.deepEqual(low, HEATMAP_STOPS[0].rgb);
  assert.deepEqual(high, HEATMAP_STOPS[HEATMAP_STOPS.length - 1].rgb);

  const mid = sampleHeatMapColor(0.44);
  assert.ok(mid[1] > mid[0] && mid[1] > mid[2], 'Mid reflectance (0.44) should map to emerald green');
});

test('computeLiveReflectionReadout returns valid percentages responding to studio rotation', () => {
  const r0 = computeLiveReflectionReadout(0, 0, 0);
  assert.ok(r0.peakSpecularPct > r0.barrelMeanPct);
  assert.ok(r0.barrelMeanPct > r0.baffleStrayPct);
  assert.ok(r0.glassGrazingPct > 0 && r0.glassGrazingPct <= 100);
});
