import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMERA_CUES,
  LENS_PARTS,
  sampleCameraCue,
  computeFramedDistance,
  computeResponsiveOffsetX,
  computePartLiftProgress,
} from './cues';

test('sampleCameraCue returns hero at scroll 0, close slow-mo at 0.25, and full explode at 0.54', () => {
  const hero = sampleCameraCue(0);
  assert.equal(hero.activeBeat, 'hero');
  assert.equal(hero.shot.explode, 0);
  assert.equal(hero.shot.timeScale, 1);

  const close = sampleCameraCue(0.25);
  assert.equal(close.activeBeat, 'close');
  assert.ok(close.shot.timeScale < 0.1, 'Close-up must engage 1/12 slow motion');

  const apart = sampleCameraCue(0.54);
  assert.equal(apart.activeBeat, 'apart');
  assert.equal(apart.shot.explode, 1);

  const outro = sampleCameraCue(1);
  assert.equal(outro.activeBeat, 'outro');
  assert.equal(outro.shot.explode, 0);
});

test('computeFramedDistance pulls camera further back on portrait mobile so object never clips horizontally', () => {
  const desktopDist = computeFramedDistance(78, 36, 1440 / 900);
  const mobileDist = computeFramedDistance(78, 36, 390 / 844);

  assert.ok(
    mobileDist > desktopDist * 1.8,
    `Expected portrait mobile distance (${mobileDist.toFixed(1)}) to exceed landscape desktop (${desktopDist.toFixed(1)})`,
  );
});

test('computeResponsiveOffsetX centers object on mobile and offsets on desktop', () => {
  assert.equal(computeResponsiveOffsetX(0.17, 390), 0);
  assert.equal(computeResponsiveOffsetX(0.17, 768), 0);
  assert.equal(computeResponsiveOffsetX(0.17, 1440), 0.17);
});

test('computePartLiftProgress enforces staggered order: top parts leave first and return last', () => {
  const topOrder = 1.0;
  const bottomOrder = 0.1;

  // At e = 0, nothing has lifted
  assert.equal(computePartLiftProgress(0, topOrder), 0);
  assert.equal(computePartLiftProgress(0, bottomOrder), 0);

  // At e = 0.35, top part is well underway while bottom part has not even started lifting
  const topMid = computePartLiftProgress(0.35, topOrder);
  const bottomMid = computePartLiftProgress(0.35, bottomOrder);
  assert.ok(topMid > 0.7, `Expected top part lift > 0.7, got ${topMid}`);
  assert.equal(bottomMid, 0, `Expected bottom part lift to still be 0 at e=0.35, got ${bottomMid}`);

  // At e = 1.0, both parts reach full extension
  assert.equal(computePartLiftProgress(1, topOrder), 1);
  assert.equal(computePartLiftProgress(1, bottomOrder), 1);
});

test('LENS_PARTS are strictly ordered from front (1.0) to rear (0.1) and balanced across two columns', () => {
  assert.equal(LENS_PARTS.length, 8);
  const leftCount = LENS_PARTS.filter((p) => p.column === 'left').length;
  const rightCount = LENS_PARTS.filter((p) => p.column === 'right').length;
  assert.equal(leftCount, 4);
  assert.equal(rightCount, 4);

  for (let i = 1; i < LENS_PARTS.length; i++) {
    assert.ok(LENS_PARTS[i - 1].order > LENS_PARTS[i].order);
  }
  assert.equal(CAMERA_CUES.length, 5);
});
