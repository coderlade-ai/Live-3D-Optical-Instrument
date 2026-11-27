import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  BeatId,
  CAMERA_CUES,
  CameraShot,
  computeFramedDistance,
  computeResponsiveOffsetX,
  sampleCameraCue,
} from './cues';
import { FinishId, MaterialLibrary, createMaterialLibrary } from './materials';
import {
  ReflectionReadout,
  ViewMode,
  computeLiveReflectionReadout,
} from './heatmap';
import {
  computeChromaticShift,
  createChromaticAberrationShader,
} from './aberration';
import {
  BokehShape,
  computeBokehParams,
  createBokehSimulationShader,
} from './bokeh';
import {
  OpticalDataSnapshot,
  computeOpticalData,
} from './opticalTelemetry';
import {
  FocalPlaneHelper,
  computeFocalDistanceState,
  createFocalPlaneHelper,
} from './focalPlane';
import { LAYER_GLASS, LAYER_METAL, LensAssembly, buildKesslerLens } from './lensBuilder';
import { StudioRig, setupPhotoStudio } from './studio';
import { ProceduralLensAudio } from './audio';

export interface ProjectedCallout {
  id: string;
  code: string;
  name: string;
  dimensionsMm: string;
  materialNote: string;
  column: 'left' | 'right';
  /** Screen X in CSS pixels */
  x: number;
  /** Screen Y in CSS pixels */
  y: number;
  visible: boolean;
}

export interface EngineTelemetry {
  activeBeat: BeatId;
  explode: number;
  timeScale: number;
  fStop: string;
  focalDistanceLabel: string;
  scrollProgress: number;
  reflectionReadout: ReflectionReadout;
  opticalData: OpticalDataSnapshot;
}

export interface EngineCallbacks {
  onCalloutsUpdate: (callouts: ProjectedCallout[], explodeOpacity: number) => void;
  onTelemetryUpdate: (telemetry: EngineTelemetry) => void;
  onReady?: () => void;
  onError?: (message: string) => void;
}

const FilmGrainVignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrainIntensity: { value: 0.032 },
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
    uniform float uTime;
    uniform float uGrainIntensity;
    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      float grain = (rand(vUv * 420.0 + fract(uTime)) - 0.5) * uGrainIntensity;
      vec2 centered = vUv - 0.5;
      float vig = smoothstep(0.92, 0.28, length(centered));
      vec3 col = tex.rgb * mix(0.86, 1.0, vig) + grain;
      gl_FragColor = vec4(col, tex.a);
    }
  `,
};

function detectSoftwareWebGL(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

const F_STOPS = ['f/1.4', 'f/2.0', 'f/2.8', 'f/4.0', 'f/5.6', 'f/8.0', 'f/11', 'f/16'];

// Module-scope reusable scratch math objects (Zero GC inside render loop)
const _anchorWorld = new THREE.Vector3();
const _anchorProjected = new THREE.Vector3();
const _cameraPos = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _rightAxis = new THREE.Vector3();
const _upAxis = new THREE.Vector3();
const _forwardAxis = new THREE.Vector3();

/**
 * Step 02 — One engine class you fully control, one fixed full-screen canvas.
 */
export class LiveLensEngine {
  private canvas: HTMLCanvasElement;
  private callbacks: EngineCallbacks;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private composer: EffectComposer | null = null;
  private softwarePostComposer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private grainPass: ShaderPass | null = null;
  private aberrationPass: ShaderPass | null = null;
  private bokehPass: ShaderPass | null = null;
  private materials!: MaterialLibrary;
  private studio!: StudioRig;
  private lens!: LensAssembly;
  private focalPlane!: FocalPlaneHelper;
  public audio: ProceduralLensAudio;

  private isSoftwareGl = false;
  private isMobile = false;
  private destroyed = false;
  private frameId = 0;
  private lastTimestamp = 0;
  private simTime = 0;
  private lastBeatNumber = -1;
  private lastDetentStep = 0;
  private lastTelemetryEmit = 0;

  // Adaptive quality tracking (Step 09)
  private qualityStep = 0; // 0 = full, 1 = reduced DPR, 2 = bloom off
  private lowFpsAccum = 0;
  private currentDpr = 1;

  // Interactive / Scroll targets
  private scrollProgress = 0;
  private targetShot: CameraShot = { ...CAMERA_CUES[0].shot };
  private smoothShot: CameraShot = { ...CAMERA_CUES[0].shot };
  private activeBeat: BeatId = 'hero';

  private explodeOverride: number | null = null; // null = follow scroll cue
  private viewMode: ViewMode = 'studio';
  private bokehShape: BokehShape = 'hexagonal';
  private targetEngage = 0;
  private smoothEngage = 0;

  // Studio environment rotation & subtle camera parallax driven by pointer / phone tilt
  private targetEnvX = 0;
  private targetEnvY = 0;
  private smoothEnvX = 0;
  private smoothEnvY = 0;

  // Subtle interactive orbit nudge when dragging
  private dragAzimuthOffset = 0;
  private dragPolarOffset = 0;
  private smoothDragAzimuth = 0;
  private smoothDragPolar = 0;
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;

  private viewportWidth = 1440;
  private viewportHeight = 900;
  private reducedMotion = false;
  private contextLost = false;

  constructor(canvas: HTMLCanvasElement, callbacks: EngineCallbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.audio = new ProceduralLensAudio();
    this.isSoftwareGl = detectSoftwareWebGL();
    this.reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.init();
  }

  private init(): void {
    try {
      this.viewportWidth = window.innerWidth || 1440;
      this.viewportHeight = window.innerHeight || 900;
      this.isMobile = this.viewportWidth < 768;

      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: !this.isSoftwareGl,
        alpha: true,
        powerPreference: 'high-performance',
      });
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.12;
      this.renderer.shadowMap.enabled = !this.isSoftwareGl;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      // Step 09: Cap pixel ratio at 1.75 on phones, 2 on desktop GPU, 1 on software WebGL
      const maxDpr = this.isSoftwareGl ? 1 : this.isMobile ? 1.75 : 2;
      this.currentDpr = Math.min(window.devicePixelRatio || 1, maxDpr);
      this.renderer.setPixelRatio(this.currentDpr);
      this.renderer.setSize(this.viewportWidth, this.viewportHeight, false);

      this.scene = new THREE.Scene();

      this.camera = new THREE.PerspectiveCamera(
        34,
        this.viewportWidth / Math.max(1, this.viewportHeight),
        1,
        1200,
      );
      // Camera sees both Layer 0 (metals + direct lights) and Layer 1 (studio-only glass)
      this.camera.layers.enable(LAYER_METAL);
      this.camera.layers.enable(LAYER_GLASS);

      // Build procedural PMREM dark studio & materials & 8-part Kessler 50mm lens
      this.studio = setupPhotoStudio(this.renderer, this.scene, this.isSoftwareGl);
      this.materials = createMaterialLibrary(this.renderer, this.isSoftwareGl);
      this.lens = buildKesslerLens(this.materials, this.isSoftwareGl);
      this.focalPlane = createFocalPlaneHelper(LAYER_METAL);
      this.lens.root.add(this.focalPlane.group);
      this.scene.add(this.lens.root);

      const aspect = this.viewportWidth / Math.max(1, this.viewportHeight);

      // Step 09 Post-Processing Chain on hardware GPUs: Scene -> MSAA HDR -> Bloom -> Grain -> Output -> Chromatic Aberration
      if (!this.isSoftwareGl) {
        const renderTarget = new THREE.WebGLRenderTarget(
          this.viewportWidth,
          this.viewportHeight,
          {
            type: THREE.HalfFloatType,
            samples: this.isMobile ? 2 : 4,
          },
        );
        this.composer = new EffectComposer(this.renderer, renderTarget);
        this.composer.setPixelRatio(this.currentDpr);
        this.composer.setSize(this.viewportWidth, this.viewportHeight);

        this.composer.addPass(new RenderPass(this.scene, this.camera));

        // High threshold so only polished 0.05mm bevel glints bloom
        this.bloomPass = new UnrealBloomPass(
          new THREE.Vector2(this.viewportWidth / 2, this.viewportHeight / 2),
          0.32, // strength
          0.35, // radius
          0.92, // high threshold — glints only
        );
        this.composer.addPass(this.bloomPass);

        this.grainPass = new ShaderPass(FilmGrainVignetteShader);
        this.composer.addPass(this.grainPass);

        this.composer.addPass(new OutputPass());

        this.aberrationPass = new ShaderPass(createChromaticAberrationShader());
        this.aberrationPass.uniforms.uAspect.value = aspect;
        this.aberrationPass.enabled = false;
        this.composer.addPass(this.aberrationPass);

        this.bokehPass = new ShaderPass(createBokehSimulationShader(false));
        this.bokehPass.uniforms.uAspect.value = aspect;
        this.bokehPass.enabled = false;
        this.composer.addPass(this.bokehPass);
      } else {
        // Lightweight single-sample post-processing path used ONLY when Aberration or Bokeh mode is active on software WebGL
        const swTarget = new THREE.WebGLRenderTarget(this.viewportWidth, this.viewportHeight, {
          type: THREE.UnsignedByteType,
          format: THREE.RGBAFormat,
        });
        this.softwarePostComposer = new EffectComposer(this.renderer, swTarget);
        this.softwarePostComposer.setPixelRatio(this.currentDpr);
        this.softwarePostComposer.setSize(this.viewportWidth, this.viewportHeight);
        this.softwarePostComposer.addPass(new RenderPass(this.scene, this.camera));
        this.softwarePostComposer.addPass(new OutputPass());

        this.aberrationPass = new ShaderPass(createChromaticAberrationShader());
        this.aberrationPass.uniforms.uAspect.value = aspect;
        this.aberrationPass.enabled = false;
        this.softwarePostComposer.addPass(this.aberrationPass);

        this.bokehPass = new ShaderPass(createBokehSimulationShader(true));
        this.bokehPass.uniforms.uAspect.value = aspect;
        this.bokehPass.enabled = false;
        this.softwarePostComposer.addPass(this.bokehPass);
      }

      // Bind window / pointer / scroll / context listeners
      window.addEventListener('resize', this.handleResize, { passive: true });
      window.addEventListener('scroll', this.handleScroll, { passive: true });
      window.addEventListener('pointermove', this.handlePointerMove, { passive: true });
      window.addEventListener('pointerdown', this.handlePointerDown, { passive: true });
      window.addEventListener('pointerup', this.handlePointerUp, { passive: true });
      window.addEventListener('deviceorientation', this.handleDeviceOrientation, {
        passive: true,
      });
      this.canvas.addEventListener('webglcontextlost', this.handleContextLost, false);
      this.canvas.addEventListener('webglcontextrestored', this.handleContextRestored, false);

      // Sync initial scroll position immediately
      this.handleScroll();
      this.smoothShot = { ...this.targetShot };

      // Pre-warm shaders asynchronously on GPU (Step 09: no hitching; skipped on software WebGL)
      if (!this.isSoftwareGl) {
        const anyRenderer = this.renderer as THREE.WebGLRenderer & {
          compileAsync?: (s: THREE.Scene, c: THREE.Camera) => Promise<void>;
        };
        if (typeof anyRenderer.compileAsync === 'function') {
          void anyRenderer.compileAsync(this.scene, this.camera).catch(() => {});
        } else {
          this.renderer.compile(this.scene, this.camera);
        }
      }

      this.callbacks.onReady?.();

      // Render first frame synchronously, then start paced animation loop
      this.lastTimestamp = performance.now();
      this.stepAndRender(0.016);
      this.scheduleNextFrame();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to initialize 3D WebGL viewport.';
      this.callbacks.onError?.(msg);
    }
  }

  public setFinish(finish: FinishId): void {
    this.materials?.applyFinish(finish);
  }

  public setViewMode(mode: ViewMode): void {
    this.viewMode = mode;
    this.lens?.setViewMode(mode);
    if (this.aberrationPass) {
      this.aberrationPass.enabled = mode === 'aberration';
    }
    if (this.bokehPass) {
      this.bokehPass.enabled = mode === 'bokeh';
    }
  }

  public setBokehShape(shape: BokehShape): void {
    this.bokehShape = shape;
    if (this.bokehPass) {
      this.bokehPass.uniforms.uShapeMix.value = shape === 'hexagonal' ? 1.0 : 0.0;
    }
  }

  public setFocalPlaneVisible(visible: boolean): void {
    this.focalPlane?.setVisible(visible);
  }

  public setExplodeOverride(value: number | null): void {
    this.explodeOverride = value;
  }

  public setEngageAmount(value: number): void {
    this.targetEngage = Math.max(0, Math.min(1, value));
    // Trigger mechanical aperture detent click when crossing stop thresholds
    const step = Math.round(this.targetEngage * 7);
    if (step !== this.lastDetentStep) {
      this.lastDetentStep = step;
      this.audio.playDetent(0.9 + step * 0.06, 0.95);
    }
    this.audio.setEngageHum(this.targetEngage);
  }

  /**
   * Step 08: Request iOS DeviceOrientation permission inside the same user gesture that unlocks audio.
   */
  public requestMotionAndAudio(): boolean {
    const unlocked = this.audio.unlockAndEnable();
    const DevOrient = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };
    if (DevOrient && typeof DevOrient.requestPermission === 'function') {
      void DevOrient.requestPermission().catch(() => {});
    }
    return unlocked;
  }

  private handleResize = (): void => {
    if (this.destroyed || !this.renderer) return;
    this.viewportWidth = window.innerWidth || 1440;
    this.viewportHeight = window.innerHeight || 900;
    this.isMobile = this.viewportWidth < 768;

    const maxDpr = this.isSoftwareGl
      ? 1
      : this.qualityStep >= 1
        ? 1.15
        : this.isMobile
          ? 1.75
          : 2;
    this.currentDpr = Math.min(window.devicePixelRatio || 1, maxDpr);

    this.camera.aspect = this.viewportWidth / Math.max(1, this.viewportHeight);
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(this.currentDpr);
    this.renderer.setSize(this.viewportWidth, this.viewportHeight, false);

    if (this.composer) {
      this.composer.setPixelRatio(this.currentDpr);
      this.composer.setSize(this.viewportWidth, this.viewportHeight);
    }
    if (this.softwarePostComposer) {
      this.softwarePostComposer.setPixelRatio(this.currentDpr);
      this.softwarePostComposer.setSize(this.viewportWidth, this.viewportHeight);
    }
    const aspect = this.viewportWidth / Math.max(1, this.viewportHeight);
    if (this.aberrationPass) {
      this.aberrationPass.uniforms.uAspect.value = aspect;
    }
    if (this.bokehPass) {
      this.bokehPass.uniforms.uAspect.value = aspect;
    }
    if (this.bloomPass) {
      this.bloomPass.resolution.set(this.viewportWidth / 2, this.viewportHeight / 2);
    }
  };

  private handleScroll = (): void => {
    const docHeight =
      document.documentElement.scrollHeight - window.innerHeight;
    const raw = docHeight > 0 ? window.scrollY / docHeight : 0;
    this.scrollProgress = Math.max(0, Math.min(1, raw));

    const sampled = sampleCameraCue(this.scrollProgress);
    this.targetShot = sampled.shot;
    this.activeBeat = sampled.activeBeat;
  };

  private handlePointerMove = (e: PointerEvent): void => {
    const nx = (e.clientX / Math.max(1, this.viewportWidth)) * 2 - 1;
    const ny = (e.clientY / Math.max(1, this.viewportHeight)) * 2 - 1;
    this.targetEnvX = Math.max(-1, Math.min(1, nx));
    this.targetEnvY = Math.max(-1, Math.min(1, ny));

    if (this.isDragging) {
      const dx = (e.clientX - this.dragStartX) / Math.max(1, this.viewportWidth);
      const dy = (e.clientY - this.dragStartY) / Math.max(1, this.viewportHeight);
      this.dragAzimuthOffset = Math.max(-55, Math.min(55, this.dragAzimuthOffset + dx * 120));
      this.dragPolarOffset = Math.max(-24, Math.min(24, this.dragPolarOffset + dy * 60));
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
    }
  };

  private handlePointerDown = (e: PointerEvent): void => {
    // Only initiate subtle 3D drag orbit if clicking on non-interactive canvas background
    const target = e.target as HTMLElement | null;
    if (
      target &&
      target.closest('button, a, input, label, [role="button"], [data-interactive="true"]')
    ) {
      return;
    }
    this.isDragging = true;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
  };

  private handlePointerUp = (): void => {
    this.isDragging = false;
  };

  private handleDeviceOrientation = (e: DeviceOrientationEvent): void => {
    if (e.gamma == null || e.beta == null) return;
    // Map mobile phone tilt cleanly into [-1..1] studio rotation coordinates
    this.targetEnvX = Math.max(-1, Math.min(1, e.gamma / 35));
    this.targetEnvY = Math.max(-1, Math.min(1, (e.beta - 45) / 35));
  };

  private handleContextLost = (e: Event): void => {
    e.preventDefault();
    this.contextLost = true;
  };

  private handleContextRestored = (): void => {
    this.contextLost = false;
  };

  private scheduleNextFrame(): void {
    if (this.destroyed) return;
    if (this.isSoftwareGl) {
      // Strictly follow threejs skill §2.3: wait for software WebGL fence sync + 80ms pause
      this.afterDraw(() => {
        if (!this.destroyed) this.tick();
      });
    } else {
      this.frameId = requestAnimationFrame(() => this.tick());
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.destroyed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const status = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (status === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 8);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 85);
        }
      };
      this.frameId = window.setTimeout(poll, 8);
    } else {
      this.frameId = window.setTimeout(cb, 110);
    }
  }

  private tick(): void {
    if (this.destroyed) return;
    const now = performance.now();
    const rawDt = Math.min(0.1, Math.max(0.001, (now - this.lastTimestamp) / 1000));
    this.lastTimestamp = now;

    // Step 09 Adaptive Quality on GPU: if FPS drops under 40 consistently, step DPR down, then turn bloom off
    if (!this.isSoftwareGl && rawDt > 1 / 40) {
      this.lowFpsAccum += rawDt;
      if (this.lowFpsAccum > 1.5 && this.qualityStep < 2) {
        this.lowFpsAccum = 0;
        this.qualityStep++;
        if (this.qualityStep === 1) {
          this.handleResize();
        } else if (this.qualityStep === 2 && this.bloomPass) {
          this.bloomPass.enabled = false;
        }
      }
    } else {
      this.lowFpsAccum = Math.max(0, this.lowFpsAccum - rawDt * 0.5);
    }

    if (!this.contextLost) {
      this.stepAndRender(rawDt);
    }

    this.scheduleNextFrame();
  }

  private stepAndRender(dt: number): void {
    const dampK = this.isSoftwareGl ? 14 : 6.5;
    const alpha = 1 - Math.exp(-dampK * dt);

    // Damped camera & explode state
    const targetExplode =
      this.explodeOverride !== null ? this.explodeOverride : this.targetShot.explode;

    this.smoothShot.frameMm += (this.targetShot.frameMm - this.smoothShot.frameMm) * alpha;
    this.smoothShot.polarDeg += (this.targetShot.polarDeg - this.smoothShot.polarDeg) * alpha;
    this.smoothShot.azimuthDeg +=
      (this.targetShot.azimuthDeg - this.smoothShot.azimuthDeg) * alpha;
    this.smoothShot.offsetX += (this.targetShot.offsetX - this.smoothShot.offsetX) * alpha;
    this.smoothShot.offsetY += (this.targetShot.offsetY - this.smoothShot.offsetY) * alpha;
    this.smoothShot.explode += (targetExplode - this.smoothShot.explode) * alpha;
    this.smoothShot.timeScale +=
      (this.targetShot.timeScale - this.smoothShot.timeScale) * alpha;

    this.smoothEngage += (this.targetEngage - this.smoothEngage) * (1 - Math.exp(-10 * dt));
    this.smoothEnvX += (this.targetEnvX - this.smoothEnvX) * (1 - Math.exp(-5 * dt));
    this.smoothEnvY += (this.targetEnvY - this.smoothEnvY) * (1 - Math.exp(-5 * dt));

    // Gently decay manual drag offset back toward choreography when not dragging
    if (!this.isDragging) {
      const returnDecay = Math.exp(-1.4 * dt);
      this.dragAzimuthOffset *= returnDecay;
      this.dragPolarOffset *= returnDecay;
    }
    this.smoothDragAzimuth += (this.dragAzimuthOffset - this.smoothDragAzimuth) * alpha;
    this.smoothDragPolar += (this.dragPolarOffset - this.smoothDragPolar) * alpha;

    // Step 05: Cursor / mobile tilt rotates the studio reflections smoothly
    const envRotX = this.smoothEnvY * 0.45;
    const envRotY = -this.smoothEnvX * 0.8;
    this.scene.environmentRotation.set(envRotX, envRotY, 0);
    if (this.viewMode === 'heatmap') {
      this.lens.updateHeatMapEnvRotation(envRotX, envRotY);
    }

    // Step 08: Single simulation clock drives every moving part + fires beat ticks
    const clockSpeed = this.reducedMotion ? 0 : this.smoothShot.timeScale;
    this.simTime += dt * clockSpeed;

    const beat = Math.floor(this.simTime * 1.1);
    if (beat !== this.lastBeatNumber && !this.reducedMotion) {
      this.lastBeatNumber = beat;
      if (this.audio.isEnabled()) {
        this.audio.playBeatTick(this.smoothShot.timeScale < 0.25);
      }
    }

    // Update all 8 procedural lens assemblies
    this.lens.pose({
      explode: this.smoothShot.explode,
      simTime: this.simTime,
      engageAmount: this.smoothEngage,
    });

    // Live optical focus & aperture state driving the focal distance plane and chromatic aberration shader
    const pulseWave = Math.sin(this.simTime * 1.45) * 0.5 + 0.5;
    const irisClosure = Math.min(1, pulseWave * 0.28 + this.smoothEngage * 0.72);
    const focusAngle = Math.sin(this.simTime * 0.72) * 0.16 + this.smoothEngage * 0.65;
    const focalState = computeFocalDistanceState({
      focusAngle,
      engageAmount: this.smoothEngage,
      explode: this.smoothShot.explode,
    });

    if (this.focalPlane.isVisible()) {
      const frontApexZ = 28.4 + this.smoothShot.explode * 44.0;
      this.focalPlane.update(focalState, this.simTime, frontApexZ);
    }

    // Subtle organic floating poise
    this.lens.root.rotation.y = this.smoothEnvX * 0.08;
    this.lens.root.rotation.x = this.smoothEnvY * 0.06;

    // Step 06: Size-based responsive camera framing ("fit N mm on screen")
    const aspect = this.viewportWidth / Math.max(1, this.viewportHeight);
    const fillRatio = this.isMobile ? 0.68 : 0.74;
    const distance = computeFramedDistance(
      this.smoothShot.frameMm,
      this.camera.fov,
      aspect,
      fillRatio,
    );

    const polarRad =
      THREE.MathUtils.degToRad(
        THREE.MathUtils.clamp(
          this.smoothShot.polarDeg + this.smoothDragPolar,
          8,
          84,
        ),
      );
    const azimRad = THREE.MathUtils.degToRad(
      this.smoothShot.azimuthDeg + this.smoothDragAzimuth + this.smoothEnvX * 4.5,
    );

    // Spherical orbit around optical axis (+Z is front of lens)
    _cameraPos.set(
      distance * Math.sin(polarRad) * Math.sin(azimRad),
      distance * Math.sin(polarRad) * 0.36 + this.smoothEnvY * 6,
      distance * Math.cos(polarRad),
    );

    // Compute camera-relative screen offset so desktop shifts lens cleanly away from left copy
    const responsiveOffsetX = computeResponsiveOffsetX(
      this.smoothShot.offsetX,
      this.viewportWidth,
    );
    const visibleHeight =
      2 * distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5));
    const visibleWidth = visibleHeight * aspect;

    _forwardAxis.copy(_cameraPos).negate().normalize();
    _rightAxis.crossVectors(_forwardAxis, THREE.Object3D.DEFAULT_UP).normalize();
    _upAxis.crossVectors(_rightAxis, _forwardAxis).normalize();

    _lookTarget
      .set(0, 0, 0)
      .addScaledVector(_rightAxis, -responsiveOffsetX * visibleWidth)
      .addScaledVector(_upAxis, -this.smoothShot.offsetY * visibleHeight);

    this.camera.position.copy(_cameraPos).add(_lookTarget);
    this.camera.lookAt(_lookTarget);
    this.camera.updateMatrixWorld();

    // Update post-processing diagnostic uniforms when active
    if (this.viewMode === 'aberration' && this.aberrationPass) {
      const shift = computeChromaticShift({
        apertureClosure: irisClosure,
        focusNorm: focalState.focusNorm,
        envTiltX: this.smoothEnvX,
        envTiltY: this.smoothEnvY,
      });
      this.aberrationPass.uniforms.uAmount.value = shift.amount;
      this.aberrationPass.uniforms.uCenter.value.set(shift.centerX, shift.centerY);
      this.aberrationPass.uniforms.uAspect.value = aspect;
      this.aberrationPass.uniforms.uFringeBoost.value = shift.fringeBoost;
    } else if (this.viewMode === 'bokeh' && this.bokehPass) {
      const bokeh = computeBokehParams({
        apertureClosure: irisClosure,
        focusNorm: focalState.focusNorm,
        explode: this.smoothShot.explode,
        shape: this.bokehShape,
      });
      this.bokehPass.uniforms.uRadius.value = bokeh.radius;
      this.bokehPass.uniforms.uShapeMix.value = bokeh.shapeMix;
      this.bokehPass.uniforms.uHighlightGain.value = bokeh.highlightGain;
      this.bokehPass.uniforms.uFocusWindow.value = bokeh.focusWindow;
      this.bokehPass.uniforms.uBladeRotation.value = bokeh.bladeRotation;
      this.bokehPass.uniforms.uAspect.value = aspect;
      this.bokehPass.uniforms.uCenter.value.set(
        Math.max(0.15, Math.min(0.85, 0.5 + responsiveOffsetX)),
        Math.max(0.2, Math.min(0.8, 0.5 + this.smoothShot.offsetY)),
      );
    }

    // Render scene (EffectComposer on GPU, lightweight post composer for Aberration/Bokeh or direct renderer on software WebGL)
    const needsSoftwarePost =
      this.viewMode === 'aberration' || this.viewMode === 'bokeh';
    if (this.composer && !this.isSoftwareGl) {
      if (this.grainPass) {
        this.grainPass.uniforms.uTime.value = this.simTime;
      }
      this.composer.render();
    } else if (needsSoftwarePost && this.softwarePostComposer) {
      this.softwarePostComposer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    // Step 07: Project 3D part anchors into 2D viewport coordinates for two-column callouts
    const explodeAlpha = Math.max(0, Math.min(1, (this.smoothShot.explode - 0.35) / 0.35));
    if (explodeAlpha > 0.01) {
      const projected: ProjectedCallout[] = this.lens.parts.map((p) => {
        const [ox, oy, oz] = p.spec.anchorOffset;
        _anchorWorld.set(ox, oy, oz);
        p.group.localToWorld(_anchorWorld);
        _anchorProjected.copy(_anchorWorld).project(this.camera);

        const sx = (_anchorProjected.x * 0.5 + 0.5) * this.viewportWidth;
        const sy = (-_anchorProjected.y * 0.5 + 0.5) * this.viewportHeight;

        return {
          id: p.spec.id,
          code: p.spec.code,
          name: p.spec.name,
          dimensionsMm: p.spec.dimensionsMm,
          materialNote: p.spec.materialNote,
          column: p.spec.column,
          x: sx,
          y: sy,
          visible: _anchorProjected.z < 1 && _anchorProjected.z > -1,
        };
      });
      this.callbacks.onCalloutsUpdate(projected, explodeAlpha);
    } else {
      this.callbacks.onCalloutsUpdate([], 0);
    }

    // Throttled HUD telemetry sync (<= 10Hz — never 60Hz setState)
    const now = performance.now();
    if (now - this.lastTelemetryEmit > 110) {
      this.lastTelemetryEmit = now;
      const stopIdx = Math.min(
        F_STOPS.length - 1,
        Math.round(irisClosure * (F_STOPS.length - 1)),
      );

      this.callbacks.onTelemetryUpdate({
        activeBeat: this.activeBeat,
        explode: this.smoothShot.explode,
        timeScale: this.smoothShot.timeScale,
        fStop: F_STOPS[stopIdx],
        focalDistanceLabel: focalState.label,
        scrollProgress: this.scrollProgress,
        reflectionReadout: computeLiveReflectionReadout(
          this.smoothEnvX,
          this.smoothEnvY,
          this.smoothEngage,
        ),
        opticalData: computeOpticalData({
          frameMm: this.smoothShot.frameMm,
          explode: this.smoothShot.explode,
          focusNorm: focalState.focusNorm,
          viewMode: this.viewMode,
        }),
      });
    }
  }

  public dispose(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.frameId);

    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('scroll', this.handleScroll);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('deviceorientation', this.handleDeviceOrientation);
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);

    this.audio.dispose();
    this.focalPlane?.dispose();
    this.lens?.dispose();
    this.materials?.dispose();
    this.studio?.dispose();
    this.aberrationPass?.dispose();
    this.bokehPass?.dispose();
    this.softwarePostComposer?.dispose();
    this.composer?.dispose();
    this.renderer?.dispose();
  }
}
