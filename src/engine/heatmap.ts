import * as THREE from 'three';

export type ViewMode = 'studio' | 'blueprint' | 'heatmap' | 'aberration';

export interface OpticalSurfaceProfile {
  /** Base specular reflectance factor (0..1) */
  metalness: number;
  /** Surface micro-roughness (0.02 = mirror, 0.9 = matte) */
  roughness: number;
  /** Index of refraction for dielectric Fresnel curve (e.g. 1.72 for optical flint glass) */
  ior: number;
  /** Studio environment intensity multiplier */
  envIntensity: number;
  /** True for transmissive optical glass elements (studio-only Fresnel reflectance) */
  isGlass: boolean;
}

export interface ReflectionReadout {
  /** Peak specular reflection intensity on 0.05 mm bevels & strip-light highlights (0..100%) */
  peakSpecularPct: number;
  /** Grazing Fresnel reflection intensity on optical front glass element (0..100%) */
  glassGrazingPct: number;
  /** Mean brushed barrel reflection intensity (0..100%) */
  barrelMeanPct: number;
  /** Matte optical baffle stray-light reflection intensity (0..100%) */
  baffleStrayPct: number;
}

export interface HeatColorStop {
  t: number;
  hex: string;
  rgb: [number, number, number];
}

/**
 * 6-stop perceptually clear optical reflectance spectrum (0% deep indigo -> 100% white-hot peak).
 * Shared identically between TypeScript diagnostics, the CSS legend, and the WebGL GLSL shader.
 */
export const HEATMAP_STOPS: HeatColorStop[] = [
  { t: 0.0, hex: '#12184a', rgb: [0.071, 0.094, 0.29] },
  { t: 0.22, hex: '#0284c7', rgb: [0.008, 0.518, 0.78] },
  { t: 0.44, hex: '#10b981', rgb: [0.063, 0.725, 0.506] },
  { t: 0.66, hex: '#facc15', rgb: [0.98, 0.8, 0.082] },
  { t: 0.84, hex: '#f97316', rgb: [0.976, 0.451, 0.086] },
  { t: 0.95, hex: '#ef4444', rgb: [0.937, 0.267, 0.267] },
  { t: 1.0, hex: '#fff7ed', rgb: [1.0, 0.969, 0.929] },
];

/**
 * Normal-incidence Fresnel reflectance F0 for a dielectric with index of refraction `ior`.
 */
export function dielectricF0(ior: number): number {
  const safeIor = Math.max(1.0, ior);
  const r = (safeIor - 1) / (safeIor + 1);
  return r * r;
}

/**
 * Schlick Fresnel approximation: reflectance rises smoothly from F0 at normal incidence
 * (cosTheta = 1) toward 1.0 at grazing angles (cosTheta -> 0).
 */
export function schlickFresnel(cosTheta: number, f0: number): number {
  const clamped = Math.max(0, Math.min(1, cosTheta));
  return f0 + (1 - f0) * Math.pow(1 - clamped, 5);
}

/**
 * Evaluates normalized reflection intensity [0..1] for a surface point given view-normal alignment
 * (`nDotV`), specular studio alignment (`rDotL`), and optical material parameters.
 */
export function computeReflectionIntensity(params: {
  nDotV: number;
  rDotL: number;
  profile: OpticalSurfaceProfile;
}): number {
  const { nDotV, rDotL, profile } = params;
  const clampedNdotV = Math.max(0, Math.min(1, nDotV));
  const clampedRdotL = Math.max(0, Math.min(1, rDotL));

  const rough = Math.max(0.03, Math.min(0.98, profile.roughness));
  const gloss = 1 - rough;

  // Specular lobe tightens sharply on low-roughness mirror bevels & polished glass
  const specPower = 3 + gloss * gloss * 46;
  const studioLobe = Math.pow(clampedRdotL, specPower) * (0.55 + gloss * 0.65);

  const baseF0 = profile.isGlass
    ? dielectricF0(profile.ior)
    : dielectricF0(profile.ior) * (1 - profile.metalness) + 0.84 * profile.metalness;
  const fresnel = schlickFresnel(clampedNdotV, baseF0);

  let intensity: number;
  if (profile.isGlass) {
    // Optical multi-coated glass reflects low energy at normal incidence and surges at grazing rims
    const coatingAtten = 0.55;
    intensity = (fresnel * 0.85 + studioLobe * (0.45 + fresnel * 0.65)) * coatingAtten * profile.envIntensity * 0.58;
  } else {
    // Metallic & anodized parts combine ambient studio bounce, Fresnel, and sharp strip-light specular
    const envFill = (0.12 + 0.42 * profile.metalness) * (0.35 + 0.65 * gloss);
    intensity =
      (envFill * (0.65 + 0.35 * fresnel) + studioLobe * (0.35 + 0.75 * profile.metalness)) *
      Math.min(1.4, profile.envIntensity * 0.72);
  }

  return Math.max(0, Math.min(1, intensity));
}

/**
 * Evaluates live optical reflection diagnostics across key lens material classes
 * as studio environment rotation (envX, envY) and aperture engagement shift.
 */
export function computeLiveReflectionReadout(
  envX: number,
  envY: number,
  engageAmount: number,
): ReflectionReadout {
  const tiltMag = Math.min(1, Math.hypot(envX, envY));
  // Rotating the virtual studio panels shifts specular strip-light alignment smoothly
  const stripAlign = 0.88 + Math.cos(envX * 1.4) * 0.08 + Math.sin(envY * 1.2) * 0.04;
  const barrelAlign = 0.68 + Math.sin(envX * 1.1 + 0.4) * 0.12 + engageAmount * 0.06;
  const glassAngle = 0.24 - tiltMag * 0.08; // grazing cosine

  const peakBevel = computeReflectionIntensity({
    nDotV: 0.48,
    rDotL: Math.min(1, stripAlign),
    profile: { metalness: 1.0, roughness: 0.06, ior: 1.5, envIntensity: 1.85, isGlass: false },
  });

  const glassGrazing = computeReflectionIntensity({
    nDotV: Math.max(0.08, glassAngle),
    rDotL: Math.min(1, 0.84 + tiltMag * 0.1),
    profile: { metalness: 0.05, roughness: 0.03, ior: 1.72, envIntensity: 2.4, isGlass: true },
  });

  const barrelMean = computeReflectionIntensity({
    nDotV: 0.62,
    rDotL: Math.max(0.25, Math.min(1, barrelAlign)),
    profile: { metalness: 1.0, roughness: 0.28, ior: 1.5, envIntensity: 1.4, isGlass: false },
  });

  const baffleStray = computeReflectionIntensity({
    nDotV: 0.72,
    rDotL: 0.32,
    profile: { metalness: 0.2, roughness: 0.88, ior: 1.45, envIntensity: 0.4, isGlass: false },
  });

  return {
    peakSpecularPct: Math.round(peakBevel * 100),
    glassGrazingPct: Math.round(glassGrazing * 100),
    barrelMeanPct: Math.round(barrelMean * 100),
    baffleStrayPct: Math.round(baffleStray * 100),
  };
}

/**
 * Samples the 6-stop heat map color ramp for a normalized reflectance intensity [0..1].
 */
export function sampleHeatMapColor(intensity: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, intensity));
  for (let i = 0; i < HEATMAP_STOPS.length - 1; i++) {
    const a = HEATMAP_STOPS[i];
    const b = HEATMAP_STOPS[i + 1];
    if (x >= a.t && x <= b.t) {
      const span = Math.max(1e-5, b.t - a.t);
      const u = (x - a.t) / span;
      return [
        a.rgb[0] + (b.rgb[0] - a.rgb[0]) * u,
        a.rgb[1] + (b.rgb[1] - a.rgb[1]) * u,
        a.rgb[2] + (b.rgb[2] - a.rgb[2]) * u,
      ];
    }
  }
  return [...HEATMAP_STOPS[HEATMAP_STOPS.length - 1].rgb];
}

const HEATMAP_VERTEX_SHADER = `
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;

  void main() {
    vec4 localPos = vec4(position, 1.0);
    vec3 localNormal = normal;

    #ifdef USE_INSTANCING
      localPos = instanceMatrix * localPos;
      localNormal = mat3(instanceMatrix) * localNormal;
    #endif

    vec4 worldPosition = modelMatrix * localPos;
    vWorldPos = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * localNormal);

    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const HEATMAP_FRAGMENT_SHADER = `
  uniform float uMetalness;
  uniform float uRoughness;
  uniform float uIor;
  uniform float uEnvIntensity;
  uniform float uIsGlass;
  uniform float uOpacity;
  uniform vec2 uEnvRotation;

  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;

  vec3 rotateStudioDir(vec3 d, vec2 rot) {
    // Rotate light direction inversely by studio environmentRotation (Y then X)
    float cy = cos(-rot.y);
    float sy = sin(-rot.y);
    vec3 ry = vec3(d.x * cy + d.z * sy, d.y, -d.x * sy + d.z * cy);

    float cx = cos(-rot.x);
    float sx = sin(-rot.x);
    return normalize(vec3(ry.x, ry.y * cx - ry.z * sx, ry.y * sx + ry.z * cx));
  }

  vec3 heatRamp(float t) {
    float x = clamp(t, 0.0, 1.0);
    vec3 c0 = vec3(0.071, 0.094, 0.290); // 0.00 Deep indigo
    vec3 c1 = vec3(0.008, 0.518, 0.780); // 0.22 Cobalt / cyan
    vec3 c2 = vec3(0.063, 0.725, 0.506); // 0.44 Emerald
    vec3 c3 = vec3(0.980, 0.800, 0.082); // 0.66 Warm yellow
    vec3 c4 = vec3(0.976, 0.451, 0.086); // 0.84 Amber orange
    vec3 c5 = vec3(0.937, 0.267, 0.267); // 0.95 Crimson
    vec3 c6 = vec3(1.000, 0.969, 0.929); // 1.00 Peak white-hot

    vec3 col = mix(c0, c1, smoothstep(0.00, 0.22, x));
    col = mix(col, c2, smoothstep(0.22, 0.44, x));
    col = mix(col, c3, smoothstep(0.44, 0.66, x));
    col = mix(col, c4, smoothstep(0.66, 0.84, x));
    col = mix(col, c5, smoothstep(0.84, 0.95, x));
    col = mix(col, c6, smoothstep(0.95, 1.00, x));
    return col;
  }

  void main() {
    vec3 N = normalize(vWorldNormal);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 R = reflect(-V, N);

    float nDotV = clamp(dot(N, V), 0.0, 1.0);
    float rough = clamp(uRoughness, 0.03, 0.98);
    float gloss = 1.0 - rough;
    float specPower = 3.0 + gloss * gloss * 44.0;

    // Exact virtual studio panel directions matching src/engine/studio.ts
    vec3 LKey    = rotateStudioDir(normalize(vec3(-22.0, 20.0, 22.0)), uEnvRotation);
    vec3 LStripR = rotateStudioDir(normalize(vec3( 30.0,  4.0, 14.0)), uEnvRotation);
    vec3 LStripL = rotateStudioDir(normalize(vec3(-28.0, -4.0, 14.0)), uEnvRotation);
    vec3 LTop    = rotateStudioDir(normalize(vec3(  2.0, 34.0, -4.0)), uEnvRotation);
    vec3 LRear   = rotateStudioDir(normalize(vec3( -8.0, 12.0,-32.0)), uEnvRotation);

    float sKey    = pow(max(dot(R, LKey),    0.0), specPower * 0.55) * 0.95;
    float sStripR = pow(max(dot(R, LStripR), 0.0), specPower * 1.15) * 1.25;
    float sStripL = pow(max(dot(R, LStripL), 0.0), specPower * 1.05) * 0.90;
    float sTop    = pow(max(dot(R, LTop),    0.0), specPower * 0.60) * 0.55;
    float sRear   = pow(max(dot(R, LRear),   0.0), specPower * 0.70) * 0.50;

    float studioSpec = clamp((sKey + sStripR + sStripL + sTop + sRear) * (0.45 + 0.65 * gloss), 0.0, 1.35);

    // Physical Schlick Fresnel curve
    float r0 = (uIor - 1.0) / (uIor + 1.0);
    float f0Dielectric = r0 * r0;
    float f0 = mix(f0Dielectric, 0.86, uMetalness * (1.0 - uIsGlass));
    float fresnel = f0 + (1.0 - f0) * pow(1.0 - nDotV, 5.0);

    float intensity;
    if (uIsGlass > 0.5) {
      // Optical glass: dark low-reflection center (anti-reflective coating) -> fiery grazing Fresnel rim
      intensity = (fresnel * 0.88 + studioSpec * (0.38 + fresnel * 0.72)) * uEnvIntensity * 0.38;
    } else {
      float diffuseWrap = max(dot(N, LKey) * 0.5 + 0.5, 0.0) * 0.18 * (1.0 - uMetalness * 0.4);
      float envBase = (0.09 + 0.36 * uMetalness) * (0.3 + 0.7 * gloss);
      intensity = (diffuseWrap + envBase * (0.65 + 0.35 * fresnel) + studioSpec * (0.35 + 0.72 * uMetalness)) * min(1.35, uEnvIntensity * 0.68);
    }

    intensity = clamp(intensity, 0.0, 1.0);
    vec3 heatCol = heatRamp(intensity);

    // Subtle 10%-step iso-reflectance contour lines for precision optical metrology
    float isoCoord = intensity * 10.0;
    float isoDist = abs(fract(isoCoord - 0.5) - 0.5);
    float isoLine = 1.0 - smoothstep(0.0, 0.055, isoDist);
    heatCol = mix(heatCol, vec3(1.0, 0.98, 0.95), isoLine * 0.16);

    float alpha = uIsGlass > 0.5 ? mix(0.32, 0.92, clamp(intensity * 1.15 + fresnel * 0.45, 0.0, 1.0)) : uOpacity;
    gl_FragColor = vec4(heatCol, alpha);
  }
`;

export interface HeatMapMaterialHandle {
  material: THREE.ShaderMaterial;
  setEnvRotation: (rotX: number, rotY: number) => void;
}

/**
 * Creates a physical reflection-intensity heat map ShaderMaterial calibrated to a specific
 * lens element's optical properties (metalness, roughness, IOR, envIntensity, glass flag).
 */
export function createHeatMapMaterial(
  profile: OpticalSurfaceProfile,
): HeatMapMaterialHandle {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMetalness: { value: profile.metalness },
      uRoughness: { value: profile.roughness },
      uIor: { value: profile.ior },
      uEnvIntensity: { value: profile.envIntensity },
      uIsGlass: { value: profile.isGlass ? 1.0 : 0.0 },
      uOpacity: { value: profile.isGlass ? 0.82 : 1.0 },
      uEnvRotation: { value: new THREE.Vector2(0, 0) },
    },
    vertexShader: HEATMAP_VERTEX_SHADER,
    fragmentShader: HEATMAP_FRAGMENT_SHADER,
    transparent: profile.isGlass,
    depthWrite: !profile.isGlass,
    side: profile.isGlass ? THREE.DoubleSide : THREE.FrontSide,
    toneMapped: false,
  });

  return {
    material: mat,
    setEnvRotation: (rotX: number, rotY: number) => {
      mat.uniforms.uEnvRotation.value.set(rotX, rotY);
    },
  };
}
