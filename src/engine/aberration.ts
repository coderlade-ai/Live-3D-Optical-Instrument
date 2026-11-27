import * as THREE from 'three';

export interface ChromaticShiftParams {
  /** Normalized iris closure [0 = f/1.4 wide open .. 1 = f/16 stopped down] */
  apertureClosure: number;
  /** Normalized focus travel [0 = close focus .. 1 = far focus] */
  focusNorm: number;
  /** Horizontal studio tilt / parallax [-1..1] */
  envTiltX: number;
  /** Vertical studio tilt / parallax [-1..1] */
  envTiltY: number;
}

export interface ChromaticShiftResult {
  /** Normalized UV dispersion amplitude for lateral RGB channel shift */
  amount: number;
  /** Optical dispersion center X in UV space [0..1] */
  centerX: number;
  /** Optical dispersion center Y in UV space [0..1] */
  centerY: number;
  /** Spectral fringe contrast boost factor */
  fringeBoost: number;
}

export interface ChannelSampleUVs {
  r: [number, number];
  g: [number, number];
  b: [number, number];
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Computes physically motivated chromatic aberration dispersion parameters.
 * Wide-open fast prime lenses (f/1.4) exhibit stronger lateral/longitudinal
 * chromatic fringing than stopped-down apertures (f/16).
 */
export function computeChromaticShift(params: ChromaticShiftParams): ChromaticShiftResult {
  const closure = clamp01(params.apertureClosure);
  const focus = clamp01(params.focusNorm);
  const tiltX = Math.max(-1, Math.min(1, params.envTiltX));
  const tiltY = Math.max(-1, Math.min(1, params.envTiltY));

  // Wide open (closure = 0) yields stronger optical dispersion; stopping down tightens it
  const apertureFactor = 1.0 - closure * 0.36;
  // Close-focus extension slightly increases axial/lateral dispersion
  const focusFactor = 1.0 + (1.0 - focus) * 0.14;
  const amount = Math.max(0.003, Math.min(0.014, 0.0068 * apertureFactor * focusFactor));

  // Gentle optical-axis drift with viewing angle / studio parallax
  const centerX = clamp01(0.5 + tiltX * 0.045);
  const centerY = clamp01(0.5 - tiltY * 0.035);

  const fringeBoost = 1.0 + (1.0 - closure) * 0.12;

  return {
    amount,
    centerX,
    centerY,
    fringeBoost,
  };
}

/**
 * Pure TypeScript mirror of the chromatic aberration shader's RGB UV channel shift.
 * Red shifts radially outward (longer wavelength), Green remains anchored,
 * and Blue shifts radially inward (shorter wavelength).
 */
export function computeChannelSampleUVs(
  uv: [number, number],
  center: [number, number],
  amount: number,
  aspect = 1,
): ChannelSampleUVs {
  const dx = uv[0] - center[0];
  const dy = uv[1] - center[1];
  const safeAspect = Math.max(0.25, aspect);
  const dist = Math.hypot(dx * safeAspect, dy);
  const radialScale = 0.45 + Math.pow(dist, 1.15) * 1.45;
  const shiftX = dx * radialScale * amount;
  const shiftY = dy * radialScale * amount;

  return {
    r: [clamp01(uv[0] + shiftX), clamp01(uv[1] + shiftY)],
    g: [clamp01(uv[0]), clamp01(uv[1])],
    b: [clamp01(uv[0] - shiftX), clamp01(uv[1] - shiftY)],
  };
}

/**
 * Creates a Three.js ShaderPass-compatible post-processing shader that visualizes
 * lateral & subtle longitudinal chromatic aberration by separating R, G, and B channels.
 * Preserves transparent WebGL canvas alpha via max(aR, aG, aB) so spectral fringes
 * extending past the lens silhouette remain crisp over the dark studio backdrop.
 */
export function createChromaticAberrationShader() {
  return {
    uniforms: {
      tDiffuse: { value: null as THREE.Texture | null },
      uAmount: { value: 0.0068 },
      uCenter: { value: new THREE.Vector2(0.5, 0.5) },
      uAspect: { value: 1.6 },
      uFringeBoost: { value: 1.08 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float uAmount;
      uniform vec2 uCenter;
      uniform float uAspect;
      uniform float uFringeBoost;
      varying vec2 vUv;

      void main() {
        vec2 delta = vUv - uCenter;
        float dist = length(vec2(delta.x * uAspect, delta.y));

        // Optical lateral dispersion grows nonlinearly away from the optical axis,
        // plus a subtle prism tangent so off-center highlights display clean RGB separation
        vec2 radialShift = delta * (0.40 + pow(dist, 1.15) * 1.25) * uAmount;
        vec2 prismShift = vec2(uAmount * 0.18, -uAmount * 0.08);
        vec2 totalShift = radialShift + prismShift;

        vec2 uvR = clamp(vUv + totalShift * 1.08, 0.0, 1.0);
        vec2 uvG = vUv;
        vec2 uvB = clamp(vUv - totalShift * 1.08, 0.0, 1.0);

        vec4 texR = texture2D(tDiffuse, uvR);
        vec4 texG = texture2D(tDiffuse, uvG);
        vec4 texB = texture2D(tDiffuse, uvB);

        // Soft intermediate spectral samples for smoother prismatic fringing
        vec2 uvY = clamp(vUv + totalShift * 0.52, 0.0, 1.0);
        vec2 uvC = clamp(vUv - totalShift * 0.52, 0.0, 1.0);
        vec4 texY = texture2D(tDiffuse, uvY);
        vec4 texC = texture2D(tDiffuse, uvC);

        float r = mix(texR.r, texY.r, 0.24);
        float g = texG.g;
        float b = mix(texB.b, texC.b, 0.24);

        vec3 splitCol = vec3(r, g, b);
        vec3 baseCol = texG.rgb;

        // Emphasize spectral fringe difference on high-contrast bevel edges & specular glints
        vec3 fringeDiff = splitCol - baseCol;
        vec3 finalRgb = max(vec3(0.0), baseCol + fringeDiff * uFringeBoost);

        // Preserve silhouette alpha across shifted channels for transparent studio canvas
        float finalAlpha = max(max(texR.a, texG.a), max(texB.a, max(texY.a, texC.a)));
        gl_FragColor = vec4(finalRgb, finalAlpha);
      }
    `,
  };
}
