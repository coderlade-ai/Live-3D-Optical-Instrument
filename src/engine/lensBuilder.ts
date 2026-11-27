import * as THREE from 'three';
import {
  LENS_PARTS,
  LensPartSpec,
  computePartLiftProgress,
} from './cues';
import { MaterialLibrary } from './materials';
import {
  HeatMapMaterialHandle,
  OpticalSurfaceProfile,
  ViewMode,
  createHeatMapMaterial,
} from './heatmap';
import {
  Point2D,
  createBayonetPlateSDF,
  createIrisBladeSDF,
  ensureCounterClockwise,
  signedPolygonArea,
  traceLoops,
} from './sdf';

export const LAYER_METAL = 0;
export const LAYER_GLASS = 1;

interface SwappableMeshRecord {
  mesh: THREE.Mesh;
  originalMaterial: THREE.Material | THREE.Material[];
  heatMaterial: THREE.Material | THREE.Material[];
  hideInHeatmap: boolean;
}

export interface AnimatedPartNode {
  spec: LensPartSpec;
  group: THREE.Group;
  solidMeshes: THREE.Object3D[];
  blueprintLines: THREE.Object3D[];
}

export interface LensAssembly {
  root: THREE.Group;
  parts: AnimatedPartNode[];
  /** Updates exploded positions, iris aperture stop-down, focus barrel twist, and helical cam pulse */
  pose: (params: {
    explode: number;
    simTime: number;
    engageAmount: number;
  }) => void;
  setViewMode: (mode: ViewMode) => void;
  updateHeatMapEnvRotation: (rotX: number, rotY: number) => void;
  dispose: () => void;
}

function profileFromPbrMaterial(mat: THREE.Material, isGlassLayer: boolean): OpticalSurfaceProfile {
  const phys = mat as THREE.MeshPhysicalMaterial;
  const std = mat as THREE.MeshStandardMaterial;
  return {
    metalness: typeof std.metalness === 'number' ? std.metalness : 0.5,
    roughness: typeof std.roughness === 'number' ? std.roughness : 0.4,
    ior: typeof phys.ior === 'number' ? phys.ior : 1.5,
    envIntensity: typeof std.envMapIntensity === 'number' ? std.envMapIntensity : 1.2,
    isGlass: isGlassLayer || Boolean(mat.transparent),
  };
}

/**
 * Helper: Builds a counter-clockwise LatheGeometry rotated so its axis aligns with Z (optical axis).
 * Enforces Bug 02 fix: profiles are wound counter-clockwise so normals face outward.
 */
function buildTurnedLathe(
  rawPoints: Array<[number, number]>, // [radiusMm, zMm]
  segments = 56,
): THREE.BufferGeometry {
  const pts2D: Point2D[] = rawPoints.map(([r, z]) => ({ x: r, y: z }));
  const ccw = ensureCounterClockwise(pts2D);
  const vecs = ccw.map((p) => new THREE.Vector2(Math.max(0.001, p.x), p.y));
  const geo = new THREE.LatheGeometry(vecs, segments);
  // Rotate Lathe Y axis -> optical Z axis (+Y becomes +Z)
  geo.rotateX(Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Converts Marching Squares 2D loops into a Three.js Shape (largest loop = outer, smaller = holes).
 */
function loopsToThreeShape(loops: Point2D[][]): THREE.Shape {
  const sorted = [...loops].sort(
    (a, b) => Math.abs(signedPolygonArea(b)) - Math.abs(signedPolygonArea(a)),
  );
  const outer = ensureCounterClockwise(sorted[0]);
  const shape = new THREE.Shape();
  shape.moveTo(outer[0].x, outer[0].y);
  for (let i = 1; i < outer.length; i++) {
    shape.lineTo(outer[i].x, outer[i].y);
  }
  shape.closePath();

  for (let h = 1; h < sorted.length; h++) {
    // Holes in THREE.Shape should be clockwise
    const holePts = ensureCounterClockwise(sorted[h]).reverse();
    const path = new THREE.Path();
    path.moveTo(holePts[0].x, holePts[0].y);
    for (let i = 1; i < holePts.length; i++) {
      path.lineTo(holePts[i].x, holePts[i].y);
    }
    path.closePath();
    shape.holes.push(path);
  }

  return shape;
}

/**
 * Normalizes ExtrudeGeometry UVs (which default to world millimetres) into clean [0..1] space
 * so anisotropic brushed metal textures never tile or moire across extruded faces.
 */
function normalizeExtrudeUVs(geo: THREE.BufferGeometry): void {
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const uv = geo.attributes.uv;
  if (!bb || !uv) return;
  const spanX = Math.max(1e-4, bb.max.x - bb.min.x);
  const spanY = Math.max(1e-4, bb.max.y - bb.min.y);
  for (let i = 0; i < uv.count; i++) {
    const u = (uv.getX(i) - bb.min.x) / spanX;
    const v = (uv.getY(i) - bb.min.y) / spanY;
    uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
}

/**
 * Builds the complete Kessler 50mm f/1.4 procedural lens in real millimetres.
 * Every part uses procedural SDF extrusions with 0.05 mm polished bevels or CCW lathe profiles.
 */
export function buildKesslerLens(
  materials: MaterialLibrary,
  isSoftwareGl: boolean,
): LensAssembly {
  const root = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const parts: AnimatedPartNode[] = [];
  const swappableMeshes: SwappableMeshRecord[] = [];
  const heatHandles = new Map<string, HeatMapMaterialHandle>();
  const latheSegs = 64;

  const getHeatMaterialFor = (mat: THREE.Material, isGlassLayer: boolean): THREE.ShaderMaterial => {
    const key = `${mat.uuid}:${isGlassLayer ? 'g' : 'm'}`;
    const existing = heatHandles.get(key);
    if (existing) return existing.material;
    const handle = createHeatMapMaterial(profileFromPbrMaterial(mat, isGlassLayer));
    heatHandles.set(key, handle);
    return handle.material;
  };

  const registerSwappable = (
    mesh: THREE.Mesh,
    isGlassLayer: boolean,
    hideInHeatmap = false,
  ) => {
    const orig = mesh.material;
    const heatMat = Array.isArray(orig)
      ? orig.map((m) => getHeatMaterialFor(m, isGlassLayer))
      : getHeatMaterialFor(orig, isGlassLayer);
    swappableMeshes.push({
      mesh,
      originalMaterial: orig,
      heatMaterial: heatMat,
      hideInHeatmap,
    });
  };

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };

  const attachPart = (
    spec: LensPartSpec,
    buildFn: (
      group: THREE.Group,
      addSolid: (
        mesh: THREE.Object3D,
        opts?: {
          layer?: number;
          edgeMaterial?: THREE.LineBasicMaterial;
          edgeThreshold?: number;
          skipBlueprint?: boolean;
          hideInHeatmap?: boolean;
        },
      ) => void,
    ) => void,
  ) => {
    const group = new THREE.Group();
    group.name = spec.id;
    group.position.set(0, 0, spec.baseZ);

    const solidMeshes: THREE.Object3D[] = [];
    const blueprintLines: THREE.Object3D[] = [];

    const addSolid = (
      obj: THREE.Object3D,
      opts?: {
        layer?: number;
        edgeMaterial?: THREE.LineBasicMaterial;
        edgeThreshold?: number;
        skipBlueprint?: boolean;
        hideInHeatmap?: boolean;
      },
    ) => {
      const layer = opts?.layer ?? LAYER_METAL;
      obj.layers.set(layer);
      if (obj instanceof THREE.Mesh && layer === LAYER_METAL && !isSoftwareGl) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
      if (obj instanceof THREE.Mesh) {
        registerSwappable(obj, layer === LAYER_GLASS, Boolean(opts?.hideInHeatmap));
      }
      group.add(obj);
      solidMeshes.push(obj);

      if (!opts?.skipBlueprint && obj instanceof THREE.Mesh && !(obj instanceof THREE.InstancedMesh)) {
        const edgeGeo = trackGeo(
          new THREE.EdgesGeometry(obj.geometry, opts?.edgeThreshold ?? 20),
        );
        const lines = new THREE.LineSegments(
          edgeGeo,
          opts?.edgeMaterial ?? materials.blueprintPrimary,
        );
        lines.position.copy(obj.position);
        lines.rotation.copy(obj.rotation);
        lines.scale.copy(obj.scale);
        lines.visible = false;
        lines.layers.set(LAYER_METAL);
        group.add(lines);
        blueprintLines.push(lines);
      }
    };

    buildFn(group, addSolid);
    root.add(group);
    parts.push({ spec, group, solidMeshes, blueprintLines });
    return group;
  };

  // References for live mechanical kinematics
  let focusBarrelGroup: THREE.Group | null = null;
  let apertureRingGroup: THREE.Group | null = null;
  let brassCamGroup: THREE.Group | null = null;
  const irisBladePivots: Array<{ pivot: THREE.Group; baseAngle: number }> = [];

  // -------------------------------------------------------------------------
  // 01. FRONT FILTER BEZEL (Ø 58.0 mm, satin titanium face + 0.05 mm bevel)
  // -------------------------------------------------------------------------
  attachPart(LENS_PARTS[0], (_group, addSolid) => {
    const bezelGeo = trackGeo(
      buildTurnedLathe(
        [
          [24.4, -2.2],
          [29.0, -2.2],
          [29.2, -1.8],
          [29.2, 2.0],
          [28.7, 2.4],
          [24.9, 2.4],
          [24.4, 1.9],
          [24.4, -2.2],
        ],
        latheSegs,
      ),
    );
    addSolid(new THREE.Mesh(bezelGeo, materials.satinBody));

    // Mirror-polished 0.05mm front chamfer ring catching studio strip lights
    const chamferGeo = trackGeo(new THREE.TorusGeometry(28.85, 0.32, 16, latheSegs));
    const chamfer = new THREE.Mesh(chamferGeo, materials.polishedBevel);
    chamfer.position.z = 2.28;
    addSolid(chamfer, { edgeMaterial: materials.blueprintAccent, edgeThreshold: 32 });

    // Inner step matte light-trap ring
    const trapGeo = trackGeo(
      buildTurnedLathe(
        [
          [23.2, -1.8],
          [24.5, -1.8],
          [24.5, 1.6],
          [23.2, 1.6],
          [23.2, -1.8],
        ],
        latheSegs,
      ),
    );
    addSolid(new THREE.Mesh(trapGeo, materials.matteBaffle), { skipBlueprint: true });

    // Signature crimson optical alignment index bar on top rim
    const indexGeo = trackGeo(new THREE.BoxGeometry(1.1, 3.0, 1.0));
    const indexBar = new THREE.Mesh(indexGeo, materials.crimsonAccent);
    indexBar.position.set(0, 29.1, 0.4);
    addSolid(indexBar, { edgeMaterial: materials.blueprintAccent });
  });

  // -------------------------------------------------------------------------
  // 02. ASPHERICAL FRONT ELEMENT (Ø 46.2 mm glass, studio-only reflections)
  // -------------------------------------------------------------------------
  attachPart(LENS_PARTS[1], (_group, addSolid) => {
    // Convex optical front dome built via CCW Lathe profile
    const domePts: Array<[number, number]> = [];
    const domeSteps = 16;
    const radius = 23.0;
    for (let i = 0; i <= domeSteps; i++) {
      const t = i / domeSteps;
      const r = t * radius;
      const z = 4.6 * Math.cos(t * Math.PI * 0.48);
      domePts.push([r, z]);
    }
    // Back curvature closing cleanly to center
    for (let i = domeSteps; i >= 0; i--) {
      const t = i / domeSteps;
      const r = t * radius;
      const z = -1.6 + 1.1 * (1 - t * t);
      domePts.push([r, z]);
    }

    const glassGeo = trackGeo(buildTurnedLathe(domePts, latheSegs));
    const glassMesh = new THREE.Mesh(glassGeo, materials.frontGlass);
    glassMesh.renderOrder = 10;
    addSolid(glassMesh, {
      layer: LAYER_GLASS,
      edgeMaterial: materials.blueprintGlass,
      edgeThreshold: 26,
    });

    // Additive studio reflection shell (Bug 03: reflects studio environment only)
    const sheenMesh = new THREE.Mesh(glassGeo, materials.frontGlassSheen);
    sheenMesh.scale.setScalar(1.003);
    sheenMesh.renderOrder = 11;
    addSolid(sheenMesh, { layer: LAYER_GLASS, skipBlueprint: true, hideInHeatmap: true });

    // Precision machined retaining collar around glass edge
    const collarGeo = trackGeo(
      buildTurnedLathe(
        [
          [22.8, -2.0],
          [24.3, -2.0],
          [24.3, 0.6],
          [22.8, 0.6],
          [22.8, -2.0],
        ],
        latheSegs,
      ),
    );
    addSolid(new THREE.Mesh(collarGeo, materials.polishedBevel));
  });

  // -------------------------------------------------------------------------
  // 03. KNURLED FOCUS BARREL (Ø 62.0 mm, 72 instanced machined grip ribs)
  // -------------------------------------------------------------------------
  focusBarrelGroup = attachPart(LENS_PARTS[2], (group, addSolid) => {
    const barrelGeo = trackGeo(
      buildTurnedLathe(
        [
          [25.0, -7.6],
          [30.2, -7.6],
          [30.5, -7.2],
          [30.5, 7.2],
          [30.2, 7.6],
          [25.0, 7.6],
          [25.0, -7.6],
        ],
        latheSegs,
      ),
    );
    addSolid(new THREE.Mesh(barrelGeo, materials.focusBarrelFace));

    // Twin mirror-polished chamfer trim rings bracketing the focus barrel
    const trimGeo = trackGeo(new THREE.TorusGeometry(30.45, 0.28, 12, latheSegs));
    const frontTrim = new THREE.Mesh(trimGeo, materials.polishedBevel);
    frontTrim.position.z = 7.3;
    const rearTrim = new THREE.Mesh(trimGeo, materials.polishedBevel);
    rearTrim.position.z = -7.3;
    addSolid(frontTrim, { skipBlueprint: true });
    addSolid(rearTrim, { skipBlueprint: true });

    // Engraved metric/feet distance scale band
    const scaleGeo = trackGeo(new THREE.CylinderGeometry(30.62, 30.62, 4.6, latheSegs, 1, true));
    scaleGeo.rotateX(Math.PI / 2);
    const scaleMesh = new THREE.Mesh(scaleGeo, materials.focusScale);
    scaleMesh.position.z = -4.3;
    addSolid(scaleMesh, { skipBlueprint: true });

    // 72 Precision machined knurled grip ribs using InstancedMesh (>20 repeated parts)
    const ribCount = 72;
    const ribGeo = trackGeo(new THREE.BoxGeometry(0.75, 0.9, 8.2));
    const ribs = new THREE.InstancedMesh(ribGeo, materials.knurlRib, ribCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < ribCount; i++) {
      const a = (i / ribCount) * Math.PI * 2;
      dummy.position.set(Math.cos(a) * 30.65, Math.sin(a) * 30.65, 2.2);
      dummy.rotation.set(0, 0, a);
      dummy.updateMatrix();
      ribs.setMatrixAt(i, dummy.matrix);
    }
    ribs.instanceMatrix.needsUpdate = true;
    ribs.computeBoundingSphere();
    ribs.frustumCulled = false;
    addSolid(ribs, { skipBlueprint: true });

    // Blueprint wireframe ring representation for knurled grip
    const wireRingGeo = trackGeo(new THREE.CylinderGeometry(31.0, 31.0, 8.2, 36, 1, true));
    wireRingGeo.rotateX(Math.PI / 2);
    const wireEdges = trackGeo(new THREE.EdgesGeometry(wireRingGeo, 12));
    const wireObj = new THREE.LineSegments(wireEdges, materials.blueprintPrimary);
    wireObj.position.z = 2.2;
    wireObj.visible = false;
    group.add(wireObj);
    parts[parts.length - 1]?.blueprintLines.push(wireObj);
  });

  // -------------------------------------------------------------------------
  // 04. APERTURE CONTROL RING (Ø 60.4 mm, clearcoat lacquer + engraved f-stops)
  // -------------------------------------------------------------------------
  apertureRingGroup = attachPart(LENS_PARTS[3], (_group, addSolid) => {
    const ringGeo = trackGeo(
      buildTurnedLathe(
        [
          [24.4, -3.5],
          [29.8, -3.5],
          [30.1, -3.1],
          [30.1, 3.1],
          [29.8, 3.5],
          [24.4, 3.5],
          [24.4, -3.5],
        ],
        latheSegs,
      ),
    );
    addSolid(new THREE.Mesh(ringGeo, materials.apertureLacquer));

    // Engraved f-stop dial cylinder
    const dialGeo = trackGeo(new THREE.CylinderGeometry(30.22, 30.22, 4.8, latheSegs, 1, true));
    dialGeo.rotateX(Math.PI / 2);
    addSolid(new THREE.Mesh(dialGeo, materials.apertureScale), { skipBlueprint: true });

    // Tactile aperture grip ear tab + crimson index jewel
    const earGeo = trackGeo(new THREE.BoxGeometry(2.6, 5.0, 4.2));
    const earL = new THREE.Mesh(earGeo, materials.satinBody);
    earL.position.set(-30.6, 0, 0);
    const earR = new THREE.Mesh(earGeo, materials.satinBody);
    earR.position.set(30.6, 0, 0);
    addSolid(earL);
    addSolid(earR);

    const jewelGeo = trackGeo(new THREE.CylinderGeometry(0.95, 0.95, 0.8, 20));
    const jewel = new THREE.Mesh(jewelGeo, materials.crimsonAccent);
    jewel.position.set(0, 30.3, 0);
    addSolid(jewel, { edgeMaterial: materials.blueprintAccent });
  });

  // -------------------------------------------------------------------------
  // 05. 10-BLADE MECHANICAL IRIS DIAPHRAGM (Step 03: 2D SDF + Marching Squares
  //     + ExtrudeGeometry with 0.05 mm polished bevels & dual materials)
  // -------------------------------------------------------------------------
  attachPart(LENS_PARTS[4], (group, addSolid) => {
    // Outer iris actuator housing ring
    const housingGeo = trackGeo(
      buildTurnedLathe(
        [
          [19.2, -1.6],
          [22.4, -1.6],
          [22.4, 1.6],
          [19.2, 1.6],
          [19.2, -1.6],
        ],
        latheSegs,
      ),
    );
    addSolid(new THREE.Mesh(housingGeo, materials.satinBody));

    // Trace one iris blade directly from our 2D SDF smoothUnion recipe
    const bladeSdf = createIrisBladeSDF();
    const bladeLoops = traceLoops(
      bladeSdf,
      { minX: -4.5, maxX: 19.5, minY: -4.5, maxY: 7.5 },
      isSoftwareGl ? 36 : 52,
    );
    const bladeShape = loopsToThreeShape(bladeLoops);

    // Step 03 & Step 04: 0.05mm polished bevel + [satinFace, polishedBevel] dual materials
    const bladeGeo = trackGeo(
      new THREE.ExtrudeGeometry(bladeShape, {
        depth: 0.34,
        bevelEnabled: true,
        bevelSize: 0.05,
        bevelThickness: 0.05,
        bevelSegments: 2,
        curveSegments: 12,
      }),
    );
    bladeGeo.computeVertexNormals();
    normalizeExtrudeUVs(bladeGeo);

    const bladeEdgeGeo = trackGeo(new THREE.EdgesGeometry(bladeGeo, 18));
    const bladeMaterials = [materials.irisBladeFace, materials.irisBladeBevel];

    const bladeCount = 10;
    const pivotRadius = 18.0;

    for (let i = 0; i < bladeCount; i++) {
      const a = (i / bladeCount) * Math.PI * 2;
      const pivot = new THREE.Group();
      pivot.position.set(
        Math.cos(a) * pivotRadius,
        Math.sin(a) * pivotRadius,
        -0.45 + (i % 2) * 0.24,
      );

      const baseAngle = a + Math.PI * 0.62;
      pivot.rotation.z = baseAngle;

      const bladeMesh = new THREE.Mesh(bladeGeo, bladeMaterials);
      bladeMesh.layers.set(LAYER_METAL);
      registerSwappable(bladeMesh, false);
      pivot.add(bladeMesh);

      const bladeWire = new THREE.LineSegments(bladeEdgeGeo, materials.blueprintAccent);
      bladeWire.visible = false;
      bladeWire.layers.set(LAYER_METAL);
      pivot.add(bladeWire);

      group.add(pivot);
      parts[parts.length - 1]?.solidMeshes.push(bladeMesh);
      parts[parts.length - 1]?.blueprintLines.push(bladeWire);
      irisBladePivots.push({ pivot, baseAngle });
    }

    // Precision brass actuator pins around housing
    const pinGeo = trackGeo(new THREE.CylinderGeometry(0.55, 0.55, 2.2, 12));
    pinGeo.rotateX(Math.PI / 2);
    for (let i = 0; i < bladeCount; i++) {
      const a = (i / bladeCount) * Math.PI * 2;
      const pin = new THREE.Mesh(pinGeo, materials.goldContact);
      pin.position.set(Math.cos(a) * pivotRadius, Math.sin(a) * pivotRadius, 0);
      addSolid(pin, { skipBlueprint: true });
    }
  });

  // -------------------------------------------------------------------------
  // 06. DOUBLE-GAUSS INNER OPTICAL GROUP (Ø 36.4 mm multi-coated glass)
  // -------------------------------------------------------------------------
  attachPart(LENS_PARTS[5], (_group, addSolid) => {
    const doubletPts: Array<[number, number]> = [];
    const steps = 14;
    const rad = 16.8;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const r = t * rad;
      const z = 3.2 * Math.cos(t * Math.PI * 0.45);
      doubletPts.push([r, z]);
    }
    for (let i = steps; i >= 0; i--) {
      const t = i / steps;
      const r = t * rad;
      const z = -2.8 - 1.4 * Math.cos(t * Math.PI * 0.45);
      doubletPts.push([r, z]);
    }
    const innerGlassGeo = trackGeo(buildTurnedLathe(doubletPts, latheSegs));
    const innerGlassMesh = new THREE.Mesh(innerGlassGeo, materials.innerGlass);
    innerGlassMesh.renderOrder = 8;
    addSolid(innerGlassMesh, {
      layer: LAYER_GLASS,
      edgeMaterial: materials.blueprintGlass,
      edgeThreshold: 28,
    });

    // Machined anodized optical spacer sleeve
    const cellGeo = trackGeo(
      buildTurnedLathe(
        [
          [16.7, -4.4],
          [18.4, -4.4],
          [18.4, 4.4],
          [16.7, 4.4],
          [16.7, -4.4],
        ],
        latheSegs,
      ),
    );
    addSolid(new THREE.Mesh(cellGeo, materials.matteBaffle));

    // Mirror bevel spacer ring
    const spacerRingGeo = trackGeo(new THREE.TorusGeometry(18.2, 0.25, 12, latheSegs));
    const spacerRing = new THREE.Mesh(spacerRingGeo, materials.polishedBevel);
    spacerRing.position.z = 4.3;
    addSolid(spacerRing, { skipBlueprint: true });
  });

  // -------------------------------------------------------------------------
  // 07. HELICAL BRASS CAM SLEEVE & HEAT-TINTED IRIDESCENT GUIDE RAILS
  // -------------------------------------------------------------------------
  brassCamGroup = attachPart(LENS_PARTS[6], (_group, addSolid) => {
    // Anisotropic brushed brass cam barrel
    const camGeo = trackGeo(
      buildTurnedLathe(
        [
          [19.4, -7.0],
          [24.0, -7.0],
          [24.0, 7.0],
          [19.4, 7.0],
          [19.4, -7.0],
        ],
        latheSegs,
      ),
    );
    addSolid(new THREE.Mesh(camGeo, materials.brassCam));

    // 3 Helical machined cam ribs wrapping around the brass sleeve
    for (let i = 0; i < 3; i++) {
      const startAngle = (i / 3) * Math.PI * 2;
      const curvePts: THREE.Vector3[] = [];
      for (let s = 0; s <= 16; s++) {
        const u = s / 16;
        const a = startAngle + u * 1.15;
        const z = -5.4 + u * 10.8;
        curvePts.push(new THREE.Vector3(Math.cos(a) * 24.3, Math.sin(a) * 24.3, z));
      }
      const helixCurve = new THREE.CatmullRomCurve3(curvePts);
      const tubeGeo = trackGeo(new THREE.TubeGeometry(helixCurve, 24, 0.65, 8, false));
      addSolid(new THREE.Mesh(tubeGeo, materials.iridescentRail), {
        edgeMaterial: materials.blueprintAccent,
        edgeThreshold: 25,
      });
    }

    // Internal matte optical light-baffle fins
    const baffleGeo = trackGeo(new THREE.CylinderGeometry(18.8, 17.6, 12.2, 32, 1, true));
    baffleGeo.rotateX(Math.PI / 2);
    addSolid(new THREE.Mesh(baffleGeo, materials.matteBaffle), { skipBlueprint: true });
  });

  // -------------------------------------------------------------------------
  // 08. BAYONET MOUNT FLANGE (Step 03: 2D SDF 3-lug plate + 0.05 mm bevel + gold pins)
  // -------------------------------------------------------------------------
  attachPart(LENS_PARTS[7], (_group, addSolid) => {
    const plateSdf = createBayonetPlateSDF();
    const plateLoops = traceLoops(
      plateSdf,
      { minX: -31, maxX: 31, minY: -31, maxY: 31 },
      isSoftwareGl ? 42 : 60,
    );
    const plateShape = loopsToThreeShape(plateLoops);

    const plateGeo = trackGeo(
      new THREE.ExtrudeGeometry(plateShape, {
        depth: 3.4,
        bevelEnabled: true,
        bevelSize: 0.05,
        bevelThickness: 0.05,
        bevelSegments: 2,
        curveSegments: 16,
      }),
    );
    plateGeo.translate(0, 0, -1.7);
    plateGeo.computeVertexNormals();
    normalizeExtrudeUVs(plateGeo);

    // Dual materials: satin stainless face + mirror-polished 0.05mm bevel
    addSolid(new THREE.Mesh(plateGeo, [materials.satinBody, materials.polishedBevel]));

    // 6 Gold-plated electronic communication contacts along lower arc
    const contactGeo = trackGeo(new THREE.CylinderGeometry(0.85, 0.85, 1.4, 14));
    contactGeo.rotateX(Math.PI / 2);
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI * 0.78 + i * 0.14;
      const pin = new THREE.Mesh(contactGeo, materials.goldContact);
      pin.position.set(Math.cos(a) * 21.8, Math.sin(a) * 21.8, -1.9);
      addSolid(pin, { skipBlueprint: true });
    }

    // 4 Recessed polished mounting screws
    const screwGeo = trackGeo(new THREE.CylinderGeometry(1.15, 1.15, 0.8, 14));
    screwGeo.rotateX(Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const a = Math.PI * 0.25 + i * Math.PI * 0.5;
      const screw = new THREE.Mesh(screwGeo, materials.polishedBevel);
      screw.position.set(Math.cos(a) * 23.4, Math.sin(a) * 23.4, 1.75);
      addSolid(screw, { skipBlueprint: true });
    }

    // Crimson lens-mount alignment dot
    const dotGeo = trackGeo(new THREE.SphereGeometry(1.05, 16, 16));
    const dot = new THREE.Mesh(dotGeo, materials.crimsonAccent);
    dot.position.set(0, 27.6, 0.2);
    addSolid(dot, { edgeMaterial: materials.blueprintAccent });
  });

  // -------------------------------------------------------------------------
  // POSE & BLUEPRINT CONTROL (Driven by single simulation clock)
  // -------------------------------------------------------------------------
  const pose = ({
    explode,
    simTime,
    engageAmount,
  }: {
    explode: number;
    simTime: number;
    engageAmount: number;
  }) => {
    // 1. Staggered exploded lift (Step 07 exact formula)
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const t = computePartLiftProgress(explode, p.spec.order);
      p.group.position.z = p.spec.baseZ + p.spec.liftZ * t;
    }

    // 2. Single-clock mechanical pulse + Hold-to-Engage stop-down verb
    // Idle mechanical breathing oscillates softly; holding Engage stops iris cleanly from f/1.4 -> f/16
    const pulseWave = Math.sin(simTime * 1.45) * 0.5 + 0.5; // [0..1]
    const irisClosure = Math.min(1, pulseWave * 0.28 + engageAmount * 0.72);

    for (let i = 0; i < irisBladePivots.length; i++) {
      const item = irisBladePivots[i];
      // Rotating inward closes the 10-blade polygon smoothly
      item.pivot.rotation.z = item.baseAngle + irisClosure * 0.54;
    }

    // 3. Synchronized focus barrel twist & helical brass cam rotation
    const focusAngle = Math.sin(simTime * 0.72) * 0.16 + engageAmount * 0.65;
    if (focusBarrelGroup) {
      focusBarrelGroup.rotation.z = focusAngle;
    }
    if (apertureRingGroup) {
      apertureRingGroup.rotation.z = -irisClosure * 0.85;
    }
    if (brassCamGroup) {
      brassCamGroup.rotation.z = -focusAngle * 1.35;
    }
  };

  const setViewMode = (mode: ViewMode) => {
    const isBlueprint = mode === 'blueprint';
    const isHeatmap = mode === 'heatmap';

    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      for (const s of p.solidMeshes) {
        s.visible = !isBlueprint;
      }
      for (const l of p.blueprintLines) {
        l.visible = isBlueprint;
      }
    }

    for (let i = 0; i < swappableMeshes.length; i++) {
      const rec = swappableMeshes[i];
      if (isHeatmap) {
        rec.mesh.material = rec.heatMaterial;
        rec.mesh.visible = !rec.hideInHeatmap;
      } else {
        rec.mesh.material = rec.originalMaterial;
        rec.mesh.visible = !isBlueprint;
      }
    }
  };

  const updateHeatMapEnvRotation = (rotX: number, rotY: number) => {
    heatHandles.forEach((handle) => handle.setEnvRotation(rotX, rotY));
  };

  const dispose = () => {
    geometries.forEach((g) => g.dispose());
    heatHandles.forEach((handle) => handle.material.dispose());
    heatHandles.clear();
  };

  // Set initial neutral pose
  pose({ explode: 0, simTime: 0, engageAmount: 0 });

  return {
    root,
    parts,
    pose,
    setViewMode,
    updateHeatMapEnvRotation,
    dispose,
  };
}
