import { ViewMode } from './heatmap';

export interface OpticalDataInput {
  /** Current camera framing span in millimetres (smaller frameMm = zoomed closer) */
  frameMm: number;
  /** Current exploded assembly separation factor [0..1] */
  explode: number;
  /** Normalized focus travel [0 = close focus .. 1 = far focus] */
  focusNorm: number;
  /** Current active view mode */
  viewMode: ViewMode;
}

export interface OpticalDataSnapshot {
  /** Total optical glass elements in the Double-Gauss prime design */
  elementCount: number;
  /** Number of cemented/air-spaced optical groups */
  groupCount: number;
  /** Number of physical mechanical & optical assemblies in the 3D column */
  assemblyCount: number;
  /** Effective focal length in millimetres (Gullstrand thick-lens response to zoom & explode) */
  effectiveFocalLengthMm: number;
  /** Optical zoom / framing magnification factor relative to Hero 148 mm view */
  zoomFactor: number;
  /** Front aspherical lanthanum flint refractive index (Fraunhofer d-line 587.6 nm) */
  frontRefractiveIndex: number;
  /** Inner Double-Gauss barium crown refractive index (nD) */
  innerRefractiveIndex: number;
  /** Rear high-index flint element refractive index (nD) */
  rearRefractiveIndex: number;
  /** Mean effective refractive index along optical path (shifts with exploded air-gap) */
  effectiveRefractiveIndex: number;
  /** Abbe dispersion number Vd of the front aspherical element */
  abbeNumber: number;
  /** Inter-group optical air gap in millimetres (expands in exploded view) */
  airGapMm: number;
  /** Concise state badge describing current optical coupling */
  couplingState: 'Aligned' | 'Focus Shift' | 'Exploded';
}

export const NOMINAL_ELEMENT_COUNT = 7;
export const NOMINAL_GROUP_COUNT = 5;
export const NOMINAL_ASSEMBLY_COUNT = 8;
export const HERO_REFERENCE_FRAME_MM = 148;

// Glass catalog constants for the Kessler 50mm f/1.4 Double-Gauss optical column
export const FRONT_ELEMENT_ND = 1.72; // Lanthanum flint asphere (matches materials.ts IOR 1.72)
export const INNER_ELEMENT_ND = 1.62; // Barium crown Double-Gauss doublet (matches materials.ts IOR 1.62)
export const REAR_ELEMENT_ND = 1.689; // High-index rear flint element
export const AIR_ND = 1.0003;
export const FRONT_ABBE_VD = 50.2;

/**
 * Computes real-time optical telemetry for the Kessler 50 mm f/1.4 lens using the
 * Gullstrand thick-lens focal length equation:
 *   1 / f_eff = 1 / f1 + 1 / f2 - d / (f1 * f2)
 * where inter-group principal plane separation `d` expands as the lens explodes and
 * focus breathing + zoom framing dynamically modulate effective focal length and mean nD.
 */
export function computeOpticalData(input: OpticalDataInput): OpticalDataSnapshot {
  const explode = Math.max(0, Math.min(1, input.explode));
  const focusNorm = Math.max(0, Math.min(1, input.focusNorm));
  const safeFrameMm = Math.max(40, Math.min(260, input.frameMm));

  // Principal group focal lengths calibrated so assembled nominal state (d = 18.8 mm) yields ~50.0 mm EFL
  const f1 = 84.0;
  const f2 = 96.0;
  const nominalAirGapMm = 18.8;

  // Exploding separates the front asphere (+36 mm lift) from the inner Double-Gauss group (+4 mm lift)
  const airGapMm = nominalAirGapMm + explode * 32.0 + (1 - focusNorm) * 1.8;

  // Gullstrand thick-lens EFL
  const invF = 1 / f1 + 1 / f2 - airGapMm / (f1 * f2);
  const thickLensEfl = 1 / Math.max(0.005, invF);

  // Relative framing zoom factor (Hero 148 mm = 1.00x; Macro Close 68 mm ≈ 2.18x; Exploded 196 mm ≈ 0.76x)
  const zoomFactor = HERO_REFERENCE_FRAME_MM / safeFrameMm;

  // Subtle focus breathing & optical framing response keep assembled Hero locked near 50.0 mm
  const breathingDeltaMm = (1 - focusNorm) * 1.4;
  const zoomCouplingFactor = 1 + (zoomFactor - 1) * 0.14;
  const effectiveFocalLengthMm = Math.max(
    35,
    Math.min(135, (thickLensEfl - breathingDeltaMm) * zoomCouplingFactor),
  );

  // Mean optical-path refractive index decreases realistically as air-gap fraction expands when exploded
  const glassMeanNd = (FRONT_ELEMENT_ND + INNER_ELEMENT_ND * 2 + REAR_ELEMENT_ND) / 4;
  const airPathFraction = Math.min(0.68, 0.18 + explode * 0.44);
  const effectiveRefractiveIndex =
    glassMeanNd * (1 - airPathFraction) + AIR_ND * airPathFraction;

  // Chromatic aberration mode highlights spectral dispersion slightly across d-line
  const dispersionShift = input.viewMode === 'aberration' ? 0.004 : 0;

  let couplingState: OpticalDataSnapshot['couplingState'] = 'Aligned';
  if (explode > 0.12) {
    couplingState = 'Exploded';
  } else if (focusNorm < 0.25 || focusNorm > 0.78) {
    couplingState = 'Focus Shift';
  }

  return {
    elementCount: NOMINAL_ELEMENT_COUNT,
    groupCount: NOMINAL_GROUP_COUNT,
    assemblyCount: NOMINAL_ASSEMBLY_COUNT,
    effectiveFocalLengthMm: Number(effectiveFocalLengthMm.toFixed(1)),
    zoomFactor: Number(zoomFactor.toFixed(2)),
    frontRefractiveIndex: Number((FRONT_ELEMENT_ND + dispersionShift).toFixed(3)),
    innerRefractiveIndex: INNER_ELEMENT_ND,
    rearRefractiveIndex: REAR_ELEMENT_ND,
    effectiveRefractiveIndex: Number(effectiveRefractiveIndex.toFixed(3)),
    abbeNumber: FRONT_ABBE_VD,
    airGapMm: Number(airGapMm.toFixed(1)),
    couplingState,
  };
}
