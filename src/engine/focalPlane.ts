import * as THREE from 'three';

export interface FocalDistanceInput {
  /** Current focus barrel rotation angle in radians */
  focusAngle: number;
  /** User hold-to-engage amount [0..1] */
  engageAmount: number;
  /** Current exploded separation factor [0..1] */
  explode: number;
}

export interface FocalDistanceState {
  /** Optical subject focus distance in metres (0.45 m minimum focus to 3.20 m) */
  distanceMeters: number;
  /** Normalized focus travel [0..1] */
  focusNorm: number;
  /** Z position along the lens optical axis (+Z) in millimetres */
  zMm: number;
  /** Indicative depth-of-field slab thickness in millimetres */
  dofBandMm: number;
  /** Human-readable metric focus readout (e.g. "0.85 m") */
  label: string;
}

export const MIN_FOCUS_METERS = 0.45;
export const MAX_FOCUS_METERS = 3.2;

/**
 * Maps the lens's live mechanical focus barrel rotation, aperture engagement, and exploded state
 * to an optical focal distance (metres) and a safely framed 3D helper plane position along +Z (mm).
 * Always stays comfortably ahead of the front filter bezel (baseZ 26 + 2.4 + 44 * explode).
 */
export function computeFocalDistanceState(input: FocalDistanceInput): FocalDistanceState {
  const explode = Math.max(0, Math.min(1, input.explode));
  const engage = Math.max(0, Math.min(1, input.engageAmount));

  // Focus barrel oscillates roughly in [-0.16..+0.81] rad; map smoothly into [0..1]
  const rawNorm = (input.focusAngle + 0.18) / 0.96;
  const focusNorm = Math.max(0, Math.min(1, rawNorm));

  // Exponential distance scale mirrors real engraved prime lens helicoid travel
  const distanceMeters =
    MIN_FOCUS_METERS * Math.pow(MAX_FOCUS_METERS / MIN_FOCUS_METERS, focusNorm);

  // Front bezel front face sits at 28.4 mm assembled and 72.4 mm at full explode.
  // Keep the translucent focal plane clearly ahead of the front element and cleanly inside the viewport frustum.
  const frontApexZ = 28.4 + explode * 44.0;
  const zMm = frontApexZ + 6.5 + focusNorm * 16.5;

  // Wider aperture (engage = 0 -> f/1.4) has razor-thin DoF; stopping down deepens the focal band
  const dofBandMm = 2.0 + engage * 8.0;

  return {
    distanceMeters,
    focusNorm,
    zMm,
    dofBandMm,
    label: `${distanceMeters.toFixed(2)} m`,
  };
}

const FOCAL_PLANE_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FOCAL_PLANE_FRAGMENT_SHADER = `
  uniform float uTime;
  uniform float uFocusNorm;
  varying vec2 vUv;

  void main() {
    // Centered coordinates in [-1..1]
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    vec2 ap = abs(p);

    // Translucent cyan-ice optical plane base with delicate clarity so lens remains unobstructed
    float squareMask = step(max(ap.x, ap.y), 0.995);
    float innerField = mix(0.035, 0.085, smoothstep(0.25, 0.98, max(ap.x, ap.y)));

    // Precision outer frame border
    float edgeDist = 1.0 - max(ap.x, ap.y);
    float outerBorder = 1.0 - smoothstep(0.008, 0.020, edgeDist);

    // Subtle 8x8 optical calibration grid
    vec2 gridCell = abs(fract(vUv * 8.0 - 0.5) - 0.5);
    float gridLine = (1.0 - smoothstep(0.0, 0.018, min(gridCell.x, gridCell.y))) * 0.22;

    // Concentric optical clear-aperture target rings
    float ringOuter = 1.0 - smoothstep(0.005, 0.014, abs(r - 0.68));
    float ringInner = 1.0 - smoothstep(0.004, 0.012, abs(r - 0.34));

    // Precision axis crosshairs with open central aperture window
    float crossX = (1.0 - smoothstep(0.003, 0.010, ap.y)) * step(0.16, ap.x) * step(ap.x, 0.88);
    float crossY = (1.0 - smoothstep(0.003, 0.010, ap.x)) * step(0.16, ap.y) * step(ap.y, 0.88);
    float crossHair = max(crossX, crossY) * 0.58;

    // Corner metrology L-brackets
    float cornerZone = step(0.76, max(ap.x, ap.y)) * step(0.76, min(ap.x, ap.y));
    float cornerTick = outerBorder * cornerZone;

    // Subtle traveling focal wave ring
    float sweepR = fract(uTime * 0.22 + uFocusNorm * 0.35) * 0.85;
    float sweepRing = (1.0 - smoothstep(0.0, 0.024, abs(r - sweepR))) * 0.14 * (1.0 - sweepR);

    vec3 cyanField = vec3(0.08, 0.44, 0.68);
    vec3 reticleBright = vec3(0.58, 0.86, 0.98);
    vec3 warmAccent = vec3(0.94, 0.90, 0.82);

    float lineWeight = clamp(
      outerBorder * 0.78 + ringOuter * 0.68 + ringInner * 0.38 + crossHair + gridLine + sweepRing,
      0.0,
      1.0
    );

    vec3 col = mix(cyanField, reticleBright, lineWeight);
    col = mix(col, warmAccent, cornerTick * 0.85);

    float alpha = (innerField + lineWeight * 0.48) * squareMask;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.62));
  }
`;

export interface FocalPlaneHelper {
  group: THREE.Group;
  setVisible: (visible: boolean) => void;
  isVisible: () => boolean;
  update: (state: FocalDistanceState, simTime: number, frontApexZ: number) => void;
  dispose: () => void;
}

/**
 * Creates a 3D translucent focal-distance plane helper attached along the lens optical axis (+Z).
 * Includes:
 * 1. Translucent calibrated optical reticle plane perpendicular to +Z
 * 2. Crisp perimeter wireframe border so the plane remains legible edge-on
 * 3. Optical-axis centerline connecting the front element apex to the focal plane center
 */
export function createFocalPlaneHelper(layer: number): FocalPlaneHelper {
  const group = new THREE.Group();
  group.name = 'focal-distance-plane-helper';
  group.visible = false;

  const planeHolder = new THREE.Group();
  group.add(planeHolder);

  // 1. Translucent calibrated focal plane (56mm x 56mm matching the 58mm lens bezel envelope)
  const planeGeo = new THREE.PlaneGeometry(56, 56, 1, 1);
  const planeMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uFocusNorm: { value: 0.2 },
    },
    vertexShader: FOCAL_PLANE_VERTEX_SHADER,
    fragmentShader: FOCAL_PLANE_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const planeMesh = new THREE.Mesh(planeGeo, planeMat);
  planeMesh.renderOrder = 18;
  planeMesh.layers.set(layer);
  planeHolder.add(planeMesh);

  // 2. Crisp outer perimeter wireframe so edge-on angles still show the plane clearly
  const borderEdges = new THREE.EdgesGeometry(planeGeo);
  const borderMat = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
  });
  const borderLines = new THREE.LineSegments(borderEdges, borderMat);
  borderLines.renderOrder = 19;
  borderLines.layers.set(layer);
  planeHolder.add(borderLines);

  // 3. Subtle optical-axis distance ray from front element apex to focal plane center
  const rayPositions = new Float32Array([0, 0, 28.4, 0, 0, 44.0]);
  const rayGeo = new THREE.BufferGeometry();
  rayGeo.setAttribute('position', new THREE.BufferAttribute(rayPositions, 3));
  const rayMat = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
  });
  const rayLine = new THREE.Line(rayGeo, rayMat);
  rayLine.renderOrder = 17;
  rayLine.layers.set(layer);
  group.add(rayLine);

  // Small center focus indicator ring on the optical axis
  const centerNodeGeo = new THREE.RingGeometry(1.4, 2.2, 24);
  const centerNodeMat = new THREE.MeshBasicMaterial({
    color: 0xf0e9da,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
  });
  const centerNode = new THREE.Mesh(centerNodeGeo, centerNodeMat);
  centerNode.renderOrder = 20;
  centerNode.layers.set(layer);
  planeHolder.add(centerNode);

  return {
    group,
    setVisible: (visible: boolean) => {
      group.visible = visible;
    },
    isVisible: () => group.visible,
    update: (state: FocalDistanceState, simTime: number, frontApexZ: number) => {
      planeHolder.position.z = state.zMm;
      planeMat.uniforms.uTime.value = simTime;
      planeMat.uniforms.uFocusNorm.value = state.focusNorm;

      // Update optical-axis centerline endpoints in-place (Zero GC in render loop)
      const posAttr = rayGeo.getAttribute('position') as THREE.BufferAttribute;
      posAttr.setXYZ(0, 0, 0, frontApexZ);
      posAttr.setXYZ(1, 0, 0, state.zMm);
      posAttr.needsUpdate = true;
    },
    dispose: () => {
      planeGeo.dispose();
      planeMat.dispose();
      borderEdges.dispose();
      borderMat.dispose();
      rayGeo.dispose();
      rayMat.dispose();
      centerNodeGeo.dispose();
      centerNodeMat.dispose();
    },
  };
}
