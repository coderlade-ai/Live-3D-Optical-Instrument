import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Volume2, VolumeX, Layers, Focus } from 'lucide-react';
import { FINISH_PRESETS, FinishId } from '../engine/materials';
import { ViewMode } from '../engine/heatmap';

interface ControlDockProps {
  finish: FinishId;
  onFinishChange: (finish: FinishId) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  showFocalPlane: boolean;
  focalDistanceLabel: string;
  onToggleFocalPlane: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  explodeOverride: number | null;
  liveExplode: number;
  onExplodeOverrideChange: (val: number | null) => void;
}

const VIEW_MODES: Array<{ id: ViewMode; label: string }> = [
  { id: 'studio', label: 'Studio' },
  { id: 'blueprint', label: 'Edges' },
  { id: 'heatmap', label: 'Heat Map' },
  { id: 'aberration', label: 'Aberration' },
];

const FINISH_LIST = Object.values(FINISH_PRESETS);

/**
 * Unified Collapsible Bottom Control Dock (Three.js skill §5):
 * - Zero viewport occlusion in the center.
 * - No backdrop-blur over WebGL (solid high-contrast dark obsidian panel).
 * - Starts collapsed on narrow mobile screens to stay well under the 15% mobile sticky cap.
 * - Keyboard shortcut "H" toggles cinema / zen mode.
 */
export function ControlDock({
  finish,
  onFinishChange,
  viewMode,
  onViewModeChange,
  showFocalPlane,
  focalDistanceLabel,
  onToggleFocalPlane,
  soundEnabled,
  onToggleSound,
  explodeOverride,
  liveExplode,
  onExplodeOverrideChange,
}: ControlDockProps) {
  const [expanded, setExpanded] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= 768;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 768px)');
    const sync = (e: MediaQueryListEvent | MediaQueryList) => {
      setExpanded(e.matches);
    };
    sync(mq);
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key.toLowerCase() === 'h' &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        setExpanded((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const sliderVal = Math.round((explodeOverride ?? liveExplode) * 100);

  return (
    <aside
      aria-label="3D Studio Controls"
      data-interactive="true"
      className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 w-[min(1080px,calc(100vw-24px))] flex flex-col items-center pointer-events-none"
    >
      {/* Collapse / Expand toggle tab */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={expanded ? 'Hide studio controls' : 'Show studio controls'}
        className="pointer-events-auto inline-flex items-center gap-1.5 px-3.5 py-1.5 min-h-[34px] rounded-t-lg bg-[#111114]/95 border border-b-0 border-white/12 text-xs font-medium text-[#d6cfc2] hover:text-[#f0e9da] transition-colors cursor-pointer whitespace-nowrap"
      >
        {expanded ? (
          <>
            <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Hide Controls</span>
          </>
        ) : (
          <>
            <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Studio Controls</span>
          </>
        )}
      </button>

      {/* Main Dock Surface */}
      {expanded && (
        <div className="pointer-events-auto w-full rounded-xl bg-[#111114]/96 border border-white/12 px-4 py-3 shadow-2xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-5">
            {/* Exploded View Slider */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="flex items-center gap-2 shrink-0">
                <Layers className="w-4 h-4 text-[#ef4444]" aria-hidden="true" />
                <label
                  htmlFor="explode-range"
                  className="text-xs font-medium text-[#f0e9da] whitespace-nowrap"
                >
                  Explode
                </label>
              </div>
              <input
                id="explode-range"
                type="range"
                min={0}
                max={100}
                value={sliderVal}
                onChange={(e) => onExplodeOverrideChange(Number(e.target.value) / 100)}
                className="studio-slider flex-1 min-w-[80px]"
              />
              <span className="font-mono-tabular text-xs text-[#a6a096] w-9 text-right shrink-0">
                {sliderVal}%
              </span>
              {explodeOverride !== null && (
                <button
                  type="button"
                  onClick={() => onExplodeOverrideChange(null)}
                  className="text-xs font-medium text-[#ef4444] hover:text-[#f87171] px-2 py-1 rounded transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  Auto
                </button>
              )}
            </div>

            <div className="hidden md:block w-px h-6 bg-white/10 shrink-0" aria-hidden="true" />

            {/* Finish Swatches */}
            <div className="flex items-center justify-between md:justify-start gap-2 flex-wrap">
              <div
                role="group"
                aria-label="Metal finish"
                className="inline-flex items-center gap-1 p-1 rounded-lg bg-[#09090b] border border-white/10"
              >
                {FINISH_LIST.map((preset) => {
                  const active = finish === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => onFinishChange(preset.id)}
                      aria-pressed={active}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[32px] rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        active
                          ? 'bg-[#202026] text-[#f0e9da]'
                          : 'text-[#a6a096] hover:text-[#f0e9da]'
                      }`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full border border-white/25 shrink-0"
                        style={{ backgroundColor: preset.swatchHex }}
                        aria-hidden="true"
                      />
                      <span>{preset.label.split(' ')[1]}</span>
                    </button>
                  );
                })}
              </div>

              {/* View Mode Segmented Control (Studio | Edges | Heat Map | Aberration), Focal Plane & Audio */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <div
                  role="group"
                  aria-label="Diagnostic view mode"
                  className="inline-flex items-center gap-0.5 p-1 rounded-lg bg-[#09090b] border border-white/12"
                >
                  {VIEW_MODES.map((m) => {
                    const active = viewMode === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => onViewModeChange(m.id)}
                        aria-pressed={active}
                        className={`px-2 sm:px-2.5 py-1.5 min-h-[32px] rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                          active
                            ? m.id === 'studio'
                              ? 'bg-[#202026] text-[#f0e9da]'
                              : 'bg-[#dc2626] text-white'
                            : 'text-[#a6a096] hover:text-[#f0e9da]'
                        }`}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={onToggleFocalPlane}
                  aria-pressed={showFocalPlane}
                  aria-label={
                    showFocalPlane
                      ? 'Hide focal distance plane helper'
                      : 'Show focal distance plane helper'
                  }
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[36px] rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    showFocalPlane
                      ? 'bg-[#0c2330] border-[#38bdf8]/70 text-[#e0f2fe]'
                      : 'bg-[#09090b] border-white/12 text-[#a6a096] hover:text-[#f0e9da]'
                  }`}
                >
                  <Focus
                    className={`w-3.5 h-3.5 shrink-0 ${showFocalPlane ? 'text-[#38bdf8]' : ''}`}
                    aria-hidden="true"
                  />
                  <span>Focal Plane</span>
                  {showFocalPlane && (
                    <span className="font-mono-tabular text-[11px] text-[#38bdf8]">
                      {focalDistanceLabel}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={onToggleSound}
                  aria-pressed={soundEnabled}
                  aria-label={soundEnabled ? 'Mute synthesized audio' : 'Enable synthesized audio'}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[36px] rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    soundEnabled
                      ? 'bg-[#202026] border-[#dc2626]/60 text-[#f0e9da]'
                      : 'bg-[#09090b] border-white/12 text-[#a6a096] hover:text-[#f0e9da]'
                  }`}
                >
                  {soundEnabled ? (
                    <Volume2 className="w-3.5 h-3.5 text-[#ef4444]" aria-hidden="true" />
                  ) : (
                    <VolumeX className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  <span className="hidden sm:inline">{soundEnabled ? 'Audio On' : 'Audio'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
