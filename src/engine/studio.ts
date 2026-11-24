import * as THREE from 'three';

export interface StudioRig {
  envTexture: THREE.Texture;
  dispose: () => void;
}

/**
 * Step 05 — Light it like a photographer.
 * Builds a dark studio room inside a temporary scene with an off-axis key softbox,
 * twin tall strip edge-line panels, and a subtle warm bounce, then bakes it via PMREM.
 *
 * Also adds subtle direct studio lights strictly on Layer 0 so optical glass on Layer 1
 * reflects ONLY the baked PMREM studio environment (zero fake specular hotspot dot).
 */
export function setupPhotoStudio(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  isSoftwareGl: boolean,
): StudioRig {
  const studioScene = new THREE.Scene();
  studioScene.background = new THREE.Color('#070709');

  const disposables: Array<{ dispose: () => void }> = [];

  const addPanel = (
    width: number,
    height: number,
    intensity: number,
    position: [number, number, number],
    hexColor = '#ffffff',
  ) => {
    const geo = new THREE.PlaneGeometry(width, height);
    const col = new THREE.Color(hexColor).multiplyScalar(intensity);
    const mat = new THREE.MeshBasicMaterial({
      color: col,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(position[0], position[1], position[2]);
    mesh.lookAt(0, 0, 0);
    studioScene.add(mesh);
    disposables.push(geo, mat);
  };

  // Dark room walls with faint ambient gradient so dark bevels stay legible
  const roomGeo = new THREE.BoxGeometry(110, 90, 110);
  const roomMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#131317'),
    side: THREE.BackSide,
  });
  studioScene.add(new THREE.Mesh(roomGeo, roomMat));
  disposables.push(roomGeo, roomMat);

  // Key off-axis softbox (warm neutral studio fill, exact placement inspiration from Step 05)
  addPanel(26, 16, 3.4, [-22, 20, 22], '#fff7ea');

  // Primary vertical strip light — crisp edge line across cylindrical bevels
  addPanel(2.6, 38, 7.2, [30, 4, 14], '#f5f8ff');

  // Secondary opposing strip light — cool silver rim highlight
  addPanel(2.8, 34, 5.4, [-28, -4, 14], '#dbe6ff');

  // Overhead zenith reflector strip for top barrel curvature
  addPanel(30, 5, 2.8, [2, 34, -4], '#f5efe6');

  // Subtle darkroom crimson lower bounce accent (echoing the PDF darkroom glow)
  addPanel(24, 12, 1.35, [14, -26, -16], '#dc2626');

  // Soft rear kicker for separation in exploded view
  addPanel(16, 18, 2.4, [-8, 12, -32], '#e8edf7');

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envRT = pmrem.fromScene(studioScene, 0.035);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 1.25;

  pmrem.dispose();
  disposables.forEach((d) => d.dispose());

  // Layer 0 direct lights only (optical glass sits on Layer 1 so it reflects ONLY the studio env)
  const keyLight = new THREE.DirectionalLight('#fff2df', 1.45);
  keyLight.position.set(-48, 52, 60);
  keyLight.layers.set(0);
  if (!isSoftwareGl) {
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 10;
    keyLight.shadow.camera.far = 220;
    keyLight.shadow.camera.left = -75;
    keyLight.shadow.camera.right = 75;
    keyLight.shadow.camera.top = 75;
    keyLight.shadow.camera.bottom = -75;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.04;
  }
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight('#dce8ff', 0.9);
  rimLight.position.set(55, 16, -42);
  rimLight.layers.set(0);
  scene.add(rimLight);

  const hemiFill = new THREE.HemisphereLight('#c4d2e8', '#1f1616', 0.45);
  hemiFill.layers.set(0);
  scene.add(hemiFill);

  return {
    envTexture: envRT.texture,
    dispose: () => {
      envRT.dispose();
      scene.remove(keyLight, rimLight, hemiFill);
    },
  };
}
