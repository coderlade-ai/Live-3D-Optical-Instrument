import * as THREE from 'three';

export type FinishId = 'titanium' | 'obsidian' | 'brass';

export interface FinishPreset {
  id: FinishId;
  label: string;
  bodyHex: string;
  bevelHex: string;
  accentRingHex: string;
  roughness: number;
  swatchHex: string;
}

export const FINISH_PRESETS: Record<FinishId, FinishPreset> = {
  titanium: {
    id: 'titanium',
    label: 'Satin Titanium',
    bodyHex: '#a9a49c',
    bevelHex: '#ebe6dc',
    accentRingHex: '#232328',
    roughness: 0.28,
    swatchHex: '#a9a49c',
  },
  obsidian: {
    id: 'obsidian',
    label: 'Anodized Obsidian',
    bodyHex: '#27272d',
    bevelHex: '#d4d0c8',
    accentRingHex: '#151519',
    roughness: 0.34,
    swatchHex: '#2d2d35',
  },
  brass: {
    id: 'brass',
    label: 'Brushed Brass',
    bodyHex: '#c6a468',
    bevelHex: '#f5e1b5',
    accentRingHex: '#201d19',
    roughness: 0.26,
    swatchHex: '#c6a468',
  },
};

export interface MaterialLibrary {
  satinBody: THREE.MeshPhysicalMaterial;
  polishedBevel: THREE.MeshPhysicalMaterial;
  focusBarrelFace: THREE.MeshPhysicalMaterial;
  knurlRib: THREE.MeshPhysicalMaterial;
  apertureLacquer: THREE.MeshPhysicalMaterial;
  apertureScale: THREE.MeshPhysicalMaterial;
  focusScale: THREE.MeshPhysicalMaterial;
  irisBladeFace: THREE.MeshPhysicalMaterial;
  irisBladeBevel: THREE.MeshPhysicalMaterial;
  brassCam: THREE.MeshPhysicalMaterial;
  iridescentRail: THREE.MeshPhysicalMaterial;
  matteBaffle: THREE.MeshStandardMaterial;
  crimsonAccent: THREE.MeshPhysicalMaterial;
  goldContact: THREE.MeshPhysicalMaterial;
  frontGlass: THREE.MeshPhysicalMaterial;
  frontGlassSheen: THREE.MeshPhysicalMaterial;
  innerGlass: THREE.MeshPhysicalMaterial;
  blueprintPrimary: THREE.LineBasicMaterial;
  blueprintAccent: THREE.LineBasicMaterial;
  blueprintGlass: THREE.LineBasicMaterial;
  applyFinish: (finish: FinishId) => void;
  dispose: () => void;
}

/**
 * Generates procedural anisotropic direction maps at boot (circular, radial, striped).
 * In Three.js MeshPhysicalMaterial, anisotropyMap encodes tangent direction (R, G) and strength (B).
 */
function createAnisotropyTexture(
  mode: 'circular' | 'radial' | 'striped',
  size = 256,
): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const half = size * 0.5;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let dx = 1;
      let dy = 0;
      let strength = 225;

      if (mode === 'circular') {
        const vx = x - half;
        const vy = y - half;
        const len = Math.hypot(vx, vy) || 1;
        // Tangent perpendicular to radius
        dx = -vy / len;
        dy = vx / len;
        const ringNoise = Math.sin(len * 1.45) * 0.14;
        strength = Math.floor(Math.max(150, Math.min(255, 220 + ringNoise * 120)));
      } else if (mode === 'radial') {
        const vx = x - half;
        const vy = y - half;
        const len = Math.hypot(vx, vy) || 1;
        dx = vx / len;
        dy = vy / len;
        strength = 230;
      } else {
        // Fine striped linear brushed grain
        dx = 1;
        dy = 0;
        const grain = Math.sin(y * 1.7) * 0.5 + Math.sin(y * 4.3 + x * 0.05) * 0.5;
        strength = Math.floor(200 + grain * 45);
      }

      const idx = (y * size + x) * 4;
      data[idx] = Math.floor((dx * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.floor((dy * 0.5 + 0.5) * 255);
      data[idx + 2] = strength;
      data[idx + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates procedural micro-brushed roughness & bump canvas texture for realistic machined metal.
 */
function createBrushedBumpTexture(size = 256): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y++) {
    const v = 112 + Math.floor((Math.sin(y * 2.1) * 0.5 + Math.cos(y * 7.3) * 0.5) * 28);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(0, y, size, 1);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 2);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

/**
 * Generates a high-DPI engraved cylindrical f-stop aperture scale texture.
 */
function createApertureScaleTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#141418';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Subtle horizontal milled lines
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 18);
  ctx.lineTo(canvas.width, 18);
  ctx.moveTo(0, 174);
  ctx.lineTo(canvas.width, 174);
  ctx.stroke();

  const stops = ['1.4', '2', '2.8', '4', '5.6', '8', '11', '16', '22'];
  ctx.font = '600 42px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Place markings around the ring circumference
  stops.forEach((label, i) => {
    const x = 96 + i * 102;
    ctx.fillStyle = label === '1.4' ? '#ef4444' : '#f0e9da';
    ctx.fillText(label, x, 106);

    // Engraved detent tick
    ctx.fillStyle = label === '1.4' ? '#ef4444' : 'rgba(240,233,218,0.65)';
    ctx.fillRect(x - 2, 34, 4, 24);
  });

  // Minor half-stop ticks
  ctx.fillStyle = 'rgba(240,233,218,0.28)';
  for (let i = 0; i < stops.length - 1; i++) {
    const x = 96 + i * 102 + 51;
    ctx.fillRect(x - 1, 42, 2, 14);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Generates an engraved metric/feet focus distance scale ring texture.
 */
function createFocusScaleTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#1b1b20';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Fine top/bottom machined groove
  ctx.fillStyle = 'rgba(240,233,218,0.12)';
  ctx.fillRect(0, 12, canvas.width, 3);
  ctx.fillRect(0, 177, canvas.width, 3);

  const meters = ['0.45m', '0.7', '1.0', '1.5', '2.5', '5', '10', '∞'];
  const feet = ['1.5ft', '2.3', '3.3', '5', '8', '16', '33', '∞'];

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  meters.forEach((m, i) => {
    const x = 90 + i * 118;
    ctx.font = '600 32px "JetBrains Mono", monospace';
    ctx.fillStyle = '#f0e9da';
    ctx.fillText(m, x, 72);

    ctx.font = '500 26px "JetBrains Mono", monospace';
    ctx.fillStyle = '#dc2626';
    ctx.fillText(feet[i], x, 134);

    ctx.fillStyle = 'rgba(240,233,218,0.5)';
    ctx.fillRect(x - 1.5, 96, 3, 14);
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createMaterialLibrary(
  renderer: THREE.WebGLRenderer,
  isSoftwareGl: boolean,
): MaterialLibrary {
  const maxAniso = isSoftwareGl ? 1 : Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const circularAniso = createAnisotropyTexture('circular', 256);
  const radialAniso = createAnisotropyTexture('radial', 256);
  const stripedAniso = createAnisotropyTexture('striped', 256);
  const brushedBump = createBrushedBumpTexture(256);
  const apertureScaleTex = createApertureScaleTexture(maxAniso);
  const focusScaleTex = createFocusScaleTexture(maxAniso);

  const textures = [
    circularAniso,
    radialAniso,
    stripedAniso,
    brushedBump,
    apertureScaleTex,
    focusScaleTex,
  ];

  // Primary satin face (Step 04: metalness 1, roughness ~0.26, anisotropy 0.8)
  const satinBody = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(FINISH_PRESETS.titanium.bodyHex),
    metalness: 1.0,
    roughness: FINISH_PRESETS.titanium.roughness,
    anisotropy: 0.72,
    anisotropyMap: stripedAniso,
    envMapIntensity: 1.4,
  });

  // Mirror-polished 0.05mm chamfer bevel edge (Step 04: flat face vs polished edge contrast)
  const polishedBevel = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(FINISH_PRESETS.titanium.bevelHex),
    metalness: 1.0,
    roughness: 0.06,
    clearcoat: 0.5,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.85,
  });

  const focusBarrelFace = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#242429'),
    metalness: 0.94,
    roughness: 0.34,
    anisotropy: 0.75,
    anisotropyMap: stripedAniso,
    bumpMap: brushedBump,
    bumpScale: 0.05,
    envMapIntensity: 1.25,
  });

  const knurlRib = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#3a3a42'),
    metalness: 0.96,
    roughness: 0.22,
    envMapIntensity: 1.45,
  });

  // Clearcoat obsidian lacquer ring (Step 04: Clearcoat for lacquer)
  const apertureLacquer = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#17171c'),
    metalness: 0.72,
    roughness: 0.22,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.3,
  });

  const apertureScale = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#ffffff'),
    map: apertureScaleTex,
    metalness: 0.45,
    roughness: 0.3,
    clearcoat: 0.65,
    clearcoatRoughness: 0.14,
    envMapIntensity: 1.1,
  });

  const focusScale = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#ffffff'),
    map: focusScaleTex,
    metalness: 0.5,
    roughness: 0.28,
    clearcoat: 0.45,
    clearcoatRoughness: 0.18,
    envMapIntensity: 1.1,
  });

  // Iris blade: dark blued-steel satin face + sharp polished edge bevel
  const irisBladeFace = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#3b3f4a'),
    metalness: 0.96,
    roughness: 0.32,
    anisotropy: 0.85,
    anisotropyMap: radialAniso,
    iridescence: 0.35,
    iridescenceIOR: 1.4,
    envMapIntensity: 1.4,
  });

  const irisBladeBevel = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#e2ddd2'),
    metalness: 1.0,
    roughness: 0.07,
    envMapIntensity: 1.9,
  });

  // Internal brushed brass helical cam sleeve
  const brassCam = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#cfa75e'),
    metalness: 1.0,
    roughness: 0.24,
    anisotropy: 0.85,
    anisotropyMap: stripedAniso,
    bumpMap: brushedBump,
    bumpScale: 0.035,
    envMapIntensity: 1.5,
  });

  // Heat-tinted iridescent steel guide rails (Step 04: Iridescence for heat-tinted steel)
  const iridescentRail = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#8e929e'),
    metalness: 1.0,
    roughness: 0.14,
    iridescence: 0.95,
    iridescenceIOR: 1.38,
    iridescenceThicknessMinimum: 180,
    iridescenceThicknessMaximum: 480,
    envMapIntensity: 1.7,
  });

  const matteBaffle = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#121215'),
    metalness: 0.2,
    roughness: 0.88,
    envMapIntensity: 0.4,
  });

  const crimsonAccent = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#dc2626'),
    emissive: new THREE.Color('#5a0b0b'),
    emissiveIntensity: 0.45,
    metalness: 0.35,
    roughness: 0.18,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
  });

  const goldContact = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#e6be6c'),
    metalness: 1.0,
    roughness: 0.1,
    envMapIntensity: 1.8,
  });

  // Optical glass: Step 05 & Bug 03 rule — studio environment reflection only (no direct lights on layer 1),
  // subtle multi-coating emerald/amber tint, crisp studio reflections without fake hotspot dots.
  const frontGlass = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#d8e6f0'),
    metalness: 0.05,
    roughness: 0.03,
    ior: 1.72,
    transparent: true,
    opacity: isSoftwareGl ? 0.24 : 0.2,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
    iridescence: 0.45,
    iridescenceIOR: 1.32,
    iridescenceThicknessMinimum: 220,
    iridescenceThicknessMaximum: 420,
    envMapIntensity: 2.4,
    depthWrite: false,
  });

  // Additive studio reflection layer for crisp edge glints on the convex sapphire dome (Bug 03 fix)
  const frontGlassSheen = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#000000'),
    metalness: 0.15,
    roughness: 0.02,
    ior: 1.85,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    envMapIntensity: 1.95,
    depthWrite: false,
  });

  const innerGlass = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#9ad1c2'),
    metalness: 0.04,
    roughness: 0.04,
    ior: 1.62,
    transparent: true,
    opacity: 0.3,
    iridescence: 0.6,
    iridescenceIOR: 1.35,
    envMapIntensity: 2.1,
    depthWrite: false,
  });

  // Blueprint wireframe edge lines (Step 07: instant proof it's geometry, not video)
  const blueprintPrimary = new THREE.LineBasicMaterial({
    color: new THREE.Color('#efe7d6'),
    transparent: true,
    opacity: 0.72,
  });

  const blueprintAccent = new THREE.LineBasicMaterial({
    color: new THREE.Color('#ef4444'),
    transparent: true,
    opacity: 0.95,
  });

  const blueprintGlass = new THREE.LineBasicMaterial({
    color: new THREE.Color('#94a3b8'),
    transparent: true,
    opacity: 0.55,
  });

  const allMaterials: THREE.Material[] = [
    satinBody,
    polishedBevel,
    focusBarrelFace,
    knurlRib,
    apertureLacquer,
    apertureScale,
    focusScale,
    irisBladeFace,
    irisBladeBevel,
    brassCam,
    iridescentRail,
    matteBaffle,
    crimsonAccent,
    goldContact,
    frontGlass,
    frontGlassSheen,
    innerGlass,
    blueprintPrimary,
    blueprintAccent,
    blueprintGlass,
  ];

  const applyFinish = (finish: FinishId) => {
    const preset = FINISH_PRESETS[finish];
    satinBody.color.set(preset.bodyHex);
    satinBody.roughness = preset.roughness;
    polishedBevel.color.set(preset.bevelHex);
    focusBarrelFace.color.set(
      finish === 'brass' ? '#362d20' : finish === 'obsidian' ? '#1a1a20' : '#26262c',
    );
    knurlRib.color.set(
      finish === 'brass' ? '#b89456' : finish === 'obsidian' ? '#34343c' : '#4a4845',
    );
  };

  const dispose = () => {
    textures.forEach((t) => t.dispose());
    allMaterials.forEach((m) => m.dispose());
  };

  return {
    satinBody,
    polishedBevel,
    focusBarrelFace,
    knurlRib,
    apertureLacquer,
    apertureScale,
    focusScale,
    irisBladeFace,
    irisBladeBevel,
    brassCam,
    iridescentRail,
    matteBaffle,
    crimsonAccent,
    goldContact,
    frontGlass,
    frontGlassSheen,
    innerGlass,
    blueprintPrimary,
    blueprintAccent,
    blueprintGlass,
    applyFinish,
    dispose,
  };
}
