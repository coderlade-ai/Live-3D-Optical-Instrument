import { useCallback, useEffect, useRef, useState } from 'react';
import { BeatId } from './engine/cues';
import { FinishId } from './engine/materials';
import { ViewMode, computeLiveReflectionReadout } from './engine/heatmap';
import { EngineTelemetry, LiveLensEngine } from './engine/LiveLensEngine';
import { TopBar } from './components/TopBar';
import { StorySections } from './components/StorySections';
import { ExplodedCallouts, ExplodedCalloutsHandle } from './components/ExplodedCallouts';
import { ControlDock } from './components/ControlDock';
import { HeatMapLegend } from './components/HeatMapLegend';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<LiveLensEngine | null>(null);
  const calloutsRef = useRef<ExplodedCalloutsHandle | null>(null);

  const [ready, setReady] = useState(false);
  const [webglError, setWebglError] = useState<string | null>(null);

  const [finish, setFinish] = useState<FinishId>('titanium');
  const [viewMode, setViewMode] = useState<ViewMode>('studio');
  const [showFocalPlane, setShowFocalPlane] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [explodeOverride, setExplodeOverride] = useState<number | null>(null);

  const [telemetry, setTelemetry] = useState<EngineTelemetry>({
    activeBeat: 'hero',
    explode: 0,
    timeScale: 1,
    fStop: 'f/1.4',
    focalDistanceLabel: '0.65 m',
    scrollProgress: 0,
    reflectionReadout: computeLiveReflectionReadout(0, 0, 0),
  });

  // Mount LiveLensEngine strictly once (never tear down WebGL canvas on React UI state updates)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new LiveLensEngine(canvas, {
      onCalloutsUpdate: (callouts, opacity) => {
        calloutsRef.current?.update(callouts, opacity);
      },
      onTelemetryUpdate: (next) => {
        setTelemetry((prev) => {
          if (
            prev.activeBeat === next.activeBeat &&
            prev.fStop === next.fStop &&
            prev.focalDistanceLabel === next.focalDistanceLabel &&
            Math.abs(prev.explode - next.explode) < 0.015 &&
            Math.abs(prev.timeScale - next.timeScale) < 0.02 &&
            Math.abs(prev.scrollProgress - next.scrollProgress) < 0.008 &&
            prev.reflectionReadout.peakSpecularPct === next.reflectionReadout.peakSpecularPct &&
            prev.reflectionReadout.glassGrazingPct === next.reflectionReadout.glassGrazingPct &&
            prev.reflectionReadout.barrelMeanPct === next.reflectionReadout.barrelMeanPct
          ) {
            return prev;
          }
          return next;
        });
      },
      onReady: () => setReady(true),
      onError: (msg) => setWebglError(msg),
    });

    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const handleFinishChange = useCallback((nextFinish: FinishId) => {
    setFinish(nextFinish);
    engineRef.current?.setFinish(nextFinish);
    engineRef.current?.audio.playDetent(1.15, 0.7);
  }, []);

  const handleViewModeChange = useCallback((nextMode: ViewMode) => {
    setViewMode(nextMode);
    engineRef.current?.setViewMode(nextMode);
    const pitch =
      nextMode === 'aberration'
        ? 1.55
        : nextMode === 'heatmap'
          ? 1.45
          : nextMode === 'blueprint'
            ? 1.25
            : 0.88;
    engineRef.current?.audio.playDetent(pitch, 0.75);
  }, []);

  const handleToggleFocalPlane = useCallback(() => {
    setShowFocalPlane((prev) => {
      const next = !prev;
      engineRef.current?.setFocalPlaneVisible(next);
      engineRef.current?.audio.playDetent(next ? 1.32 : 0.92, 0.7);
      return next;
    });
  }, []);

  const handleToggleHeatMap = useCallback(() => {
    setViewMode((prev) => {
      const next: ViewMode = prev === 'heatmap' ? 'studio' : 'heatmap';
      engineRef.current?.setViewMode(next);
      engineRef.current?.audio.playDetent(next === 'heatmap' ? 1.45 : 0.88, 0.75);
      return next;
    });
  }, []);

  const handleToggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      engineRef.current?.audio.setEnabled(next);
      if (next) {
        engineRef.current?.audio.playDetent(1.0, 0.8);
      }
      return next;
    });
  }, []);

  const handleExplodeOverride = useCallback((val: number | null) => {
    setExplodeOverride(val);
    engineRef.current?.setExplodeOverride(val);
  }, []);

  const handleFirstGesture = useCallback(() => {
    const unlocked = engineRef.current?.requestMotionAndAudio();
    if (unlocked) {
      setSoundEnabled(true);
    }
  }, []);

  const handleEngageChange = useCallback((progress: number) => {
    engineRef.current?.setEngageAmount(progress);
  }, []);

  const handleNavigateSection = useCallback((sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  return (
    <main
      className="relative overflow-x-clip min-h-screen bg-[#09090b] text-[#f0e9da]"
      data-ready={ready ? 'true' : 'false'}
      data-beat={telemetry.activeBeat as BeatId}
      data-view-mode={viewMode}
      data-focal-plane={showFocalPlane ? 'true' : 'false'}
      data-blueprint={viewMode === 'blueprint' ? 'true' : 'false'}
      data-finish={finish}
      data-sound={soundEnabled ? 'on' : 'off'}
    >
      {/* Subtle darkroom studio corner glow behind the 3D canvas */}
      <div className="fixed inset-0 z-0 studio-vignette pointer-events-none" aria-hidden="true" />

      {/* Step 02: One fixed full-screen 3D canvas behind the story */}
      <div className="fixed inset-0 z-0">
        <canvas
          ref={canvasRef}
          data-testid="lens-canvas"
          className="block w-full h-full touch-pan-y"
          aria-label="Interactive real-time 3D procedural model of the Kessler 50mm f/1.4 camera lens"
        />
      </div>

      {/* Graceful fallback if WebGL is unavailable */}
      {webglError && (
        <div
          role="alert"
          className="fixed inset-0 z-30 flex items-center justify-center p-6 bg-[#09090b]/95"
        >
          <div className="max-w-md rounded-xl border border-white/15 bg-[#121216] p-6 text-center">
            <h2 className="font-display text-lg font-bold text-[#f0e9da]">
              WebGL Viewport Unavailable
            </h2>
            <p className="mt-2 text-sm text-[#a6a096]">{webglError}</p>
          </div>
        </div>
      )}

      {/* Compact 3-zone Top Navigation Bar */}
      <TopBar
        activeBeat={telemetry.activeBeat}
        viewMode={viewMode}
        onToggleHeatMap={handleToggleHeatMap}
        onNavigateSection={handleNavigateSection}
      />

      {/* Optical Reflection Intensity Diagnostic Scale Overlay */}
      <HeatMapLegend
        visible={viewMode === 'heatmap'}
        readout={telemetry.reflectionReadout}
        onExit={() => handleViewModeChange('studio')}
      />

      {/* Step 07: Real-time projected two-column callout labels & leader lines */}
      <ExplodedCallouts ref={calloutsRef} />

      {/* Step 02 & Step 06: 5-Beat Scroll-Directed Narrative Story in Front */}
      <StorySections
        scrollProgress={telemetry.scrollProgress}
        fStop={telemetry.fStop}
        timeScale={telemetry.timeScale}
        finish={finish}
        viewMode={viewMode}
        onFinishChange={handleFinishChange}
        onViewModeChange={handleViewModeChange}
        onFirstGesture={handleFirstGesture}
        onEngageChange={handleEngageChange}
        onNavigateSection={handleNavigateSection}
      />

      {/* Unified Collapsible Bottom Studio Control Dock */}
      <ControlDock
        finish={finish}
        onFinishChange={handleFinishChange}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        showFocalPlane={showFocalPlane}
        focalDistanceLabel={telemetry.focalDistanceLabel}
        onToggleFocalPlane={handleToggleFocalPlane}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
        explodeOverride={explodeOverride}
        liveExplode={telemetry.explode}
        onExplodeOverrideChange={handleExplodeOverride}
      />
    </main>
  );
}
