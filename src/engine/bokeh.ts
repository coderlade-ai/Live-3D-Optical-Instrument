import * as THREE from 'three';

export type BokehShape = 'hexagonal' | 'circular';

export interface BokehParamsInput {
  /** Normalized iris closure [0 = f/1.4 wide open .. 1 = f/16 stopped down] */
  apertureClosure: number;
  /** Normalized focus travel [0..1] */
  focusNorm: number;
  /** Exploded separation factor [0..1] */
  explode: number;
  /** Aperture kernel geometry */
  shape: BokehShape;
}

export interface BokehUniformState {
  /** Kernel blur / circle-of-confusion radius in UV Y units */
  radius: number;
  /** 1.0 for hexagonal 6-blade aperture kernel, 0.0 for circular disc kernel */
  shapeMix: number;
  /** Specular highlight luminance gain to make bokeh shapes clearly legible */
  highlightGain: number;
  /** Radius of sharp in-focus sweet spot around optical axis */
  focusWindow: number;
  /** Subtle aperture rotation angle in radians */
  bladeRotation: number;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Computes physically motivated bokeh simulation parameters from the lens's live
 * aperture closure, focus travel, exploded spacing, and selected kernel shape.
 */
export function computeBokehParams(input: BokehParamsInput): BokehUniformState {
  const closure = clamp01(input.apertureClosure);
  const focus = clamp01(input.focusNorm);
  const explode = clamp01(input.explode);

  // Fast f/1.4 produces a wide bokeh disc; stopping down shrinks CoC smoothly
  const apertureRadius = 0.022 * (1.0 - closure * 0.42);
  // Close focus or exploded optical separation increases out-of-focus defocus blur
  const defocusBoost = 1.0 + (1.0 - focus) * 0.14 + explode * 0.22;
  const radius = Math.max(0.01, Math.min(0.034, apertureRadius * defocusBoost));

  return {
    radius,
    shapeMix: input.shape === 'hexagonal' ? 1.0 : 0.0,
    highlightGain: 2.5 + (1.0 - closure) * 0.75,
    focusWindow: 0.14 + closure * 0.12,
    bladeRotation: 0.22 + closure * 0.3,
  };
}

/**
 * Pure TypeScript generator for the 2-ring (19-tap) custom bokeh aperture kernel.
 * - 'hexagonal': points lie strictly on concentric regular hexagons (6 vertices + 6 edge midpoints
 *   on the outer ring, 6 vertices on the inner ring, plus center).
 * - 'circular': points lie on concentric circles of uniform radius 0.52 and 1.0.
 */
export function generateBokehKernelOffsets(shape: BokehShape): Array<[number, number]> {
  const offsets: Array<[number, number]> = [[0, 0]];

  // Inner ring: 6 samples
  const innerRadius = 0.52;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    offsets.push([Math.cos(a) * innerRadius, Math.sin(a) * innerRadius]);
  }

  // Outer ring: 12 samples (6 vertices + 6 edge midpoints for hexagon; uniform circle for circular)
  const hexMidpointScale = Math.cos(Math.PI / 6); // sqrt(3)/2 ≈ 0.8660254
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const isEdgeMidpoint = i % 2 === 1;
    const r = shape === 'hexagonal' && isEdgeMidpoint ? hexMidpointScale : 1.0;
    offsets.push([Math.cos(a) * r, Math.sin(a) * r]);
  }

  return offsets;
}

/**
 * Creates a Three.js ShaderPass-compatible custom-kernel Bokeh Simulation shader.
 * Combines:
 * 1. A dense multi-ring hexagonal/circular aperture convolution kernel over the rendered 3D lens
 *    with nonlinear bright-specular dilation so bevel glints bloom into smooth bokeh shapes.
 * 2. Analytical aperture-shaped background studio bokeh discs (governed by the exact same
 *    hexagon vs circle SDF, CoC radius, and blade rotation uniforms) behind the lens silhouette
 *    so toggling Hex Bokeh vs Circle Bokeh produces unmistakable optical aperture bokeh geometry.
 */
export function createBokehSimulationShader(isSoftwareGl: boolean) {
  const outerTaps = isSoftwareGl ? 12 : 18;

  return {
    uniforms: {
      tDiffuse: { value: null as THREE.Texture | null },
      uRadius: { value: 0.02 },
      uShapeMix: { value: 1.0 }, // 1.0 = hexagonal, 0.0 = circular
      uHighlightGain: { value: 2.8 },
      uFocusWindow: { value: 0.16 },
      uBladeRotation: { value: 0.22 },
      uAspect: { value: 1.6 },
      uCenter: { value: new THREE.Vector2(0.5, 0.5) },
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
      uniform float uRadius;
      uniform float uShapeMix;
      uniform float uHighlightGain;
      uniform float uFocusWindow;
      uniform float uBladeRotation;
      uniform float uAspect;
      uniform vec2 uCenter;
      varying vec2 vUv;

      const float PI = 3.14159265359;
      const float TAU = 6.28318530718;

      // Polar radius of a unit regular hexagon at angle theta
      float hexPerimeterScale(float angle) {
        float sector = PI / 3.0;
        float a = mod(angle + sector * 0.5, sector) - sector * 0.5;
        return cos(PI / 6.0) / max(0.5, cos(a));
      }

      // Signed distance to a regular hexagon of apothem r (IQ formula)
      float sdHexagon(vec2 p, float r) {
        const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
        p = abs(p);
        p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
        p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
        return length(p) * sign(p.y);
      }

      // Evaluates a single optical bokeh disc (smooth circle <-> sharp 6-blade hexagon with rim glow)
      float bokehDiscProfile(vec2 delta, float size) {
        float c = cos(-uBladeRotation * uShapeMix);
        float s = sin(-uBladeRotation * uShapeMix);
        vec2 rp = vec2(delta.x * c - delta.y * s, delta.x * s + delta.y * c);

        float dCircle = length(rp) - size;
        float dHex = sdHexagon(rp, size * 0.89);
        float d = mix(dCircle, dHex, uShapeMix);

        float fill = 1.0 - smoothstep(-size * 0.06, size * 0.08, d);
        // Subtle optical spherical-aberration bright rim
        float rim = (1.0 - smoothstep(0.0, size * 0.16, abs(d + size * 0.08))) * 0.45;
        return fill * (0.48 + rim);
      }

      vec2 bokehOffset(float angle, float ringRadius) {
        float polyScale = mix(1.0, hexPerimeterScale(angle), uShapeMix);
        float rot = angle + uBladeRotation * uShapeMix;
        vec2 dir = vec2(cos(rot), sin(rot)) * (ringRadius * polyScale);
        return vec2(dir.x / max(0.35, uAspect), dir.y);
      }

      float luma(vec3 c) {
        return dot(c, vec3(0.2126, 0.7152, 0.0722));
      }

      void main() {
        vec4 centerTex = texture2D(tDiffuse, vUv);

        // Aspect-corrected radial distance from optical focus center
        vec2 d = (vUv - uCenter) * vec2(uAspect, 1.0);
        float radialDist = length(d);
        float coc = smoothstep(uFocusWindow, uFocusWindow + 0.34, radialDist);
        float kernelR = uRadius * mix(0.22, 1.0, coc);

        vec3 accumColor = vec3(0.0);
        float accumWeight = 0.0;
        vec3 peakHighlight = centerTex.rgb;
        float maxAlpha = centerTex.a;

        // Center tap
        accumColor += centerTex.rgb * 1.1;
        accumWeight += 1.1;

        // Ring 1 (6 taps at 0.36R)
        for (int i = 0; i < 6; i++) {
          float ang = (float(i) / 6.0) * TAU;
          vec2 uv = clamp(vUv + bokehOffset(ang, 0.36) * kernelR, 0.0, 1.0);
          vec4 s = texture2D(tDiffuse, uv);
          float lum = luma(s.rgb);
          float w = 1.0 + pow(max(lum - 0.35, 0.0), 2.0) * uHighlightGain * 2.0;
          accumColor += s.rgb * w;
          accumWeight += w;
          if (lum > 0.62) peakHighlight = max(peakHighlight, s.rgb * 0.92);
          maxAlpha = max(maxAlpha, s.a * 0.94);
        }

        // Ring 2 (12 taps at 0.68R)
        for (int i = 0; i < 12; i++) {
          float ang = ((float(i) + 0.5) / 12.0) * TAU;
          vec2 uv = clamp(vUv + bokehOffset(ang, 0.68) * kernelR, 0.0, 1.0);
          vec4 s = texture2D(tDiffuse, uv);
          float lum = luma(s.rgb);
          float w = 1.05 + pow(max(lum - 0.32, 0.0), 2.1) * uHighlightGain * 2.5;
          accumColor += s.rgb * w;
          accumWeight += w;
          if (lum > 0.66) peakHighlight = max(peakHighlight, s.rgb * 0.86);
          maxAlpha = max(maxAlpha, s.a * 0.88);
        }

        // Ring 3 (${outerTaps} taps at 1.0R — crisp aperture perimeter)
        for (int i = 0; i < ${outerTaps}; i++) {
          float ang = (float(i) / ${outerTaps}.0) * TAU;
          vec2 uv = clamp(vUv + bokehOffset(ang, 1.0) * kernelR, 0.0, 1.0);
          vec4 s = texture2D(tDiffuse, uv);
          float lum = luma(s.rgb);
          float w = 1.15 + pow(max(lum - 0.28, 0.0), 2.2) * uHighlightGain * 3.1;
          accumColor += s.rgb * w;
          accumWeight += w;
          if (lum > 0.70) peakHighlight = max(peakHighlight, s.rgb * 0.82);
          maxAlpha = max(maxAlpha, s.a * 0.80);
        }

        vec3 convolved = accumColor / max(0.0001, accumWeight);
        // Gently fold in specular aperture bloom without harsh ghost artifacts
        vec3 bokehLens = mix(convolved, max(convolved, peakHighlight), 0.28 * coc);
        vec3 lensRgb = mix(centerTex.rgb, bokehLens, clamp(coc * 0.92, 0.14, 0.92));

        // Optical darkroom studio bokeh point-light field behind the lens
        // Uses the exact same hexagonal/circular SDF & CoC radius so aperture shape is unmistakable
        float scale = 1.0 + (uRadius - 0.018) * 18.0;
        vec3 bgBokeh = vec3(0.0);
        float bgAlpha = 0.0;

        vec2 p1 = (vUv - (uCenter + vec2( 0.24 / uAspect,  0.29))) * vec2(uAspect, 1.0);
        vec2 p2 = (vUv - (uCenter + vec2(-0.27 / uAspect,  0.24))) * vec2(uAspect, 1.0);
        vec2 p3 = (vUv - (uCenter + vec2( 0.31 / uAspect, -0.22))) * vec2(uAspect, 1.0);
        vec2 p4 = (vUv - (uCenter + vec2(-0.25 / uAspect, -0.27))) * vec2(uAspect, 1.0);
        vec2 p5 = (vUv - (uCenter + vec2( 0.06 / uAspect,  0.35))) * vec2(uAspect, 1.0);
        vec2 p6 = (vUv - (uCenter + vec2(-0.34 / uAspect, -0.02))) * vec2(uAspect, 1.0);
        vec2 p7 = (vUv - (uCenter + vec2( 0.34 / uAspect,  0.07))) * vec2(uAspect, 1.0);
        vec2 p8 = (vUv - (uCenter + vec2(-0.08 / uAspect, -0.34))) * vec2(uAspect, 1.0);

        float b1 = bokehDiscProfile(p1, 0.068 * scale);
        float b2 = bokehDiscProfile(p2, 0.052 * scale);
        float b3 = bokehDiscProfile(p3, 0.078 * scale);
        float b4 = bokehDiscProfile(p4, 0.058 * scale);
        float b5 = bokehDiscProfile(p5, 0.044 * scale);
        float b6 = bokehDiscProfile(p6, 0.062 * scale);
        float b7 = bokehDiscProfile(p7, 0.048 * scale);
        float b8 = bokehDiscProfile(p8, 0.054 * scale);

        vec3 warmTungsten = vec3(0.96, 0.78, 0.56);
        vec3 coolStudio   = vec3(0.56, 0.80, 0.98);
        vec3 crimsonBounce = vec3(0.90, 0.28, 0.24);

        bgBokeh += warmTungsten * (b1 * 0.42 + b4 * 0.36 + b7 * 0.34);
        bgBokeh += coolStudio   * (b2 * 0.36 + b5 * 0.38 + b8 * 0.32);
        bgBokeh += crimsonBounce * (b3 * 0.44 + b6 * 0.32);
        bgAlpha = clamp((b1 + b2 + b3 + b4 + b5 + b6 + b7 + b8) * 0.52, 0.0, 0.72);

        // Composite background bokeh orbs smoothly behind the 3D lens silhouette
        float lensCoverage = smoothstep(0.05, 0.65, maxAlpha);
        vec3 finalRgb = mix(bgBokeh, lensRgb + bgBokeh * 0.16, lensCoverage);
        float finalAlpha = max(maxAlpha, bgAlpha);

        gl_FragColor = vec4(finalRgb, clamp(finalAlpha, 0.0, 1.0));
      }
    `,
  };
}
