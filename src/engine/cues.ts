export type BeatId = 'hero' | 'close' | 'apart' | 'around' | 'outro';

export interface CameraShot {
  /** Target diameter/size in millimetres to fit cleanly inside the viewport */
  frameMm: number;
  /** Polar elevation angle in degrees (0 = front optical axis, 90 = pure side profile) */
  polarDeg: number;
  /** Azimuth orbit angle in degrees */
  azimuthDeg: number;
  /** Horizontal screen offset ratio on desktop (-0.5..0.5); automatically attenuated on narrow mobile screens */
  offsetX: number;
  /** Vertical screen offset ratio (-0.5..0.5) */
  offsetY: number;
  /** Exploded-view separation factor (0 = assembled, 1 = fully exploded) */
  explode: number;
  /** Simulation clock multiplier (1 = real-time, 1/12 = true mechanical slow-motion) */
  timeScale: number;
}

export interface CameraCue {
  id: BeatId;
  label: string;
  at: number; // Normalized scroll progress [0..1]
  shot: CameraShot;
}

export interface LensPartSpec {
  id: string;
  code: string;
  name: string;
  materialNote: string;
  dimensionsMm: string;
  /** Base optical-axis Z offset in millimetres (front is +Z, rear bayonet is -Z) */
  baseZ: number;
  /** Additional lift along optical axis Z in millimetres when explode = 1 */
  liftZ: number;
  /** Stagger order: 1.0 leaves first & returns last; 0.1 leaves last & returns first */
  order: number;
  /** Desktop callout column alignment */
  column: 'left' | 'right';
  /** Anchor offset [x, y, z] relative to part center for callout leader line */
  anchorOffset: [number, number, number];
}

/**
 * Real-millimetre optical assembly specification for the Kessler 50mm f/1.4 Prime.
 * Every part has real mm dimensions, lift distance, and staggered explode order.
 */
export const LENS_PARTS: LensPartSpec[] = [
  {
    id: 'frontBezel',
    code: '01',
    name: 'Front Filter Bezel',
    materialNote: 'Satin titanium face, 0.05 mm mirror chamfer',
    dimensionsMm: 'Ø 58.0 × 4.6 mm',
    baseZ: 24.5,
    liftZ: 34,
    order: 1.0,
    column: 'left',
    anchorOffset: [-18, 16, 2],
  },
  {
    id: 'frontGlass',
    code: '02',
    name: 'Aspherical Front Element',
    materialNote: 'High-IOR optical flint, studio-only reflection',
    dimensionsMm: 'Ø 46.2 × 7.4 mm',
    baseZ: 18.8,
    liftZ: 25,
    order: 0.88,
    column: 'left',
    anchorOffset: [-16, 6, 2],
  },
  {
    id: 'focusBarrel',
    code: '03',
    name: 'Knurled Focus Barrel',
    materialNote: 'Circular brushed alloy, 72 milled grip ribs',
    dimensionsMm: 'Ø 62.0 × 15.2 mm',
    baseZ: 10.2,
    liftZ: 15,
    order: 0.74,
    column: 'left',
    anchorOffset: [-24, -6, 0],
  },
  {
    id: 'apertureRing',
    code: '04',
    name: 'Aperture Control Ring',
    materialNote: 'Clearcoat obsidian lacquer, engraved f-stops',
    dimensionsMm: 'Ø 60.4 × 7.0 mm',
    baseZ: 1.0,
    liftZ: 6,
    order: 0.6,
    column: 'left',
    anchorOffset: [-24, -14, 0],
  },
  {
    id: 'irisAssembly',
    code: '05',
    name: '10-Blade Iris Diaphragm',
    materialNote: '2D SDF extruded blades, 0.05 mm polished edge',
    dimensionsMm: 'Ø 44.0 × 2.4 mm',
    baseZ: -1.6,
    liftZ: -2,
    order: 0.48,
    column: 'right',
    anchorOffset: [16, 14, 0],
  },
  {
    id: 'innerOptics',
    code: '06',
    name: 'Double-Gauss Optical Group',
    materialNote: 'Cemented meniscus doublet, emerald coating',
    dimensionsMm: 'Ø 36.4 × 8.8 mm',
    baseZ: -9.5,
    liftZ: -12,
    order: 0.36,
    column: 'right',
    anchorOffset: [16, 4, 0],
  },
  {
    id: 'brassCam',
    code: '07',
    name: 'Helical Brass Cam Sleeve',
    materialNote: 'Anisotropic brushed brass & heat-tinted rails',
    dimensionsMm: 'Ø 48.0 × 14.0 mm',
    baseZ: -17.0,
    liftZ: -22,
    order: 0.24,
    column: 'right',
    anchorOffset: [20, -6, 0],
  },
  {
    id: 'mountPlate',
    code: '08',
    name: 'Bayonet Mount Flange',
    materialNote: 'SDF 3-lug steel plate, 6 gold contact pins',
    dimensionsMm: 'Ø 56.4 × 4.2 mm',
    baseZ: -25.2,
    liftZ: -33,
    order: 0.1,
    column: 'right',
    anchorOffset: [22, -14, -1],
  },
];

/**
 * 5-Beat Scroll Camera Script (Step 01C & Step 06).
 * Hero -> Close-Up (1/12 slow-mo) -> Apart (exploded) -> Around (studio orbit) -> Outro (reassembled).
 */
export const CAMERA_CUES: CameraCue[] = [
  {
    id: 'hero',
    label: 'Hero',
    at: 0.0,
    shot: {
      frameMm: 88,
      polarDeg: 28,
      azimuthDeg: -26,
      offsetX: 0.18,
      offsetY: 0.04,
      explode: 0,
      timeScale: 1,
    },
  },
  {
    id: 'close',
    label: 'Close-Up',
    at: 0.25,
    shot: {
      frameMm: 46,
      polarDeg: 14,
      azimuthDeg: 14,
      offsetX: -0.15,
      offsetY: 0.03,
      explode: 0.04,
      timeScale: 1 / 12,
    },
  },
  {
    id: 'apart',
    label: 'Exploded',
    at: 0.54,
    shot: {
      frameMm: 168,
      polarDeg: 62,
      azimuthDeg: 44,
      offsetX: 0.0,
      offsetY: 0.04,
      explode: 1,
      timeScale: 0.65,
    },
  },
  {
    id: 'around',
    label: 'Studio',
    at: 0.78,
    shot: {
      frameMm: 92,
      polarDeg: 58,
      azimuthDeg: 48,
      offsetX: 0.16,
      offsetY: 0.03,
      explode: 0.22,
      timeScale: 0.85,
    },
  },
  {
    id: 'outro',
    label: 'Rebuild',
    at: 1.0,
    shot: {
      frameMm: 88,
      polarDeg: 32,
      azimuthDeg: -16,
      offsetX: 0.17,
      offsetY: 0.04,
      explode: 0,
      timeScale: 1,
    },
  },
];

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function smoothstep(t: number): number {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
}

export function easeOutCubic(t: number): number {
  const c = clamp01(t);
  return 1 - Math.pow(1 - c, 3);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Samples and smoothly interpolates the camera cue list for a normalized scroll progress [0..1].
 */
export function sampleCameraCue(
  scrollProgress: number,
  cues: CameraCue[] = CAMERA_CUES,
): { shot: CameraShot; activeBeat: BeatId; activeIndex: number } {
  const p = clamp01(scrollProgress);

  if (p <= cues[0].at) {
    return { shot: { ...cues[0].shot }, activeBeat: cues[0].id, activeIndex: 0 };
  }
  const lastIdx = cues.length - 1;
  if (p >= cues[lastIdx].at) {
    return {
      shot: { ...cues[lastIdx].shot },
      activeBeat: cues[lastIdx].id,
      activeIndex: lastIdx,
    };
  }

  let segIdx = 0;
  for (let i = 0; i < lastIdx; i++) {
    if (p >= cues[i].at && p <= cues[i + 1].at) {
      segIdx = i;
      break;
    }
  }

  const a = cues[segIdx];
  const b = cues[segIdx + 1];
  const span = Math.max(1e-5, b.at - a.at);
  const localT = smoothstep((p - a.at) / span);

  const shot: CameraShot = {
    frameMm: lerp(a.shot.frameMm, b.shot.frameMm, localT),
    polarDeg: lerp(a.shot.polarDeg, b.shot.polarDeg, localT),
    azimuthDeg: lerp(a.shot.azimuthDeg, b.shot.azimuthDeg, localT),
    offsetX: lerp(a.shot.offsetX, b.shot.offsetX, localT),
    offsetY: lerp(a.shot.offsetY, b.shot.offsetY, localT),
    explode: lerp(a.shot.explode, b.shot.explode, localT),
    timeScale: lerp(a.shot.timeScale, b.shot.timeScale, localT),
  };

  // Nearest cue determines the active chapter label
  let nearestIdx = 0;
  let nearestDist = Infinity;
  for (let i = 0; i < cues.length; i++) {
    const d = Math.abs(p - cues[i].at);
    if (d < nearestDist) {
      nearestDist = d;
      nearestIdx = i;
    }
  }

  return {
    shot,
    activeBeat: cues[nearestIdx].id,
    activeIndex: nearestIdx,
  };
}

/**
 * Step 06 Rule: "Frame by size, not distance: 'fit 52 mm on screen'.
 * The same cue then works on a phone and a monitor."
 *
 * Computes the camera distance needed so a bounding size `frameMm` fits comfortably
 * across BOTH vertical and horizontal frustum dimensions on any viewport aspect ratio.
 */
export function computeFramedDistance(
  frameMm: number,
  fovDeg: number,
  aspect: number,
  fillRatio = 0.72,
): number {
  const safeAspect = Math.max(0.32, aspect);
  const safeFill = Math.max(0.25, Math.min(0.95, fillRatio));
  const vFovRad = (fovDeg * Math.PI) / 180;
  const tanHalfV = Math.tan(vFovRad * 0.5);
  const tanHalfH = tanHalfV * safeAspect;

  const halfSize = (frameMm * 0.5) / safeFill;
  const distV = halfSize / tanHalfV;
  const distH = halfSize / tanHalfH;

  // On portrait mobile (aspect < 1), distH dominates so the lens never clips off left/right edges
  return Math.max(distV, distH);
}

/**
 * Computes responsive horizontal screen offset so desktop keeps editorial copy clear
 * on the left while narrow mobile/tablet screens center the 3D object cleanly.
 */
export function computeResponsiveOffsetX(
  baseOffsetX: number,
  viewportWidth: number,
): number {
  if (viewportWidth < 900) return 0;
  if (viewportWidth < 1180) return baseOffsetX * 0.6;
  return baseOffsetX;
}

/**
 * Step 07 Exact Staggered Explode Formula:
 *   const delay = (1 - p.order) * 0.42
 *   const t = ease((e - delay) / 0.58)
 * Top parts (order 1.0) leave first and come back last.
 */
export function computePartLiftProgress(explode: number, order: number): number {
  const e = clamp01(explode);
  const delay = (1 - clamp01(order)) * 0.42;
  return easeOutCubic((e - delay) / 0.58);
}

/**
 * Bug 04 Fix: Drive text/panel reveal emphasis smoothly from scroll progress
 * rather than brittle IntersectionObservers, while guaranteeing readability.
 */
export function computeScrollReveal(
  scrollProgress: number,
  center: number,
  halfWindow = 0.22,
): number {
  const dist = Math.abs(scrollProgress - center);
  if (dist >= halfWindow) return 0.35;
  return 0.35 + 0.65 * smoothstep(1 - dist / halfWindow);
}
