import { X } from 'lucide-react';
import { HEATMAP_STOPS, ReflectionReadout } from '../engine/heatmap';

interface HeatMapLegendProps {
  visible: boolean;
  readout: ReflectionReadout;
  onExit: () => void;
}

const GRADIENT_CSS = `linear-gradient(90deg, ${HEATMAP_STOPS.map(
  (stop) => `${stop.hex} ${Math.round(stop.t * 100)}%`,
).join(', ')})`;

/**
 * Optical Reflection Intensity Diagnostic Overlay.
 * Appears only when Heat Map diagnostic mode is active.
 * - Solid opaque obsidian backing (zero backdrop-blur over WebGL, zero text bleed-through).
 * - Compact single-row strip on narrow mobile screens (< 640px) pinned cleanly below the header
 *   so it never overlaps the hero headline or centered 3D lens.
 * - Full 4-metric metrology card on tablet/desktop (>= 640px).
 */
export function HeatMapLegend({ visible, readout, onExit }: HeatMapLegendProps) {
  if (!visible) return null;

  return (
    <section
      aria-label="Reflection intensity heat map scale"
      data-testid="heatmap-legend"
      data-interactive="true"
      className="fixed top-14 inset-x-0 sm:inset-x-auto sm:top-16 sm:right-5 z-30 sm:w-64 bg-[#0e0e11] border-b sm:border border-white/12 sm:rounded-xl px-4 py-2 sm:p-3 shadow-xl"
    >
      {/* Mobile ultra-compact single-row strip (36px tall, zero overlap with hero copy) */}
      <div className="flex sm:hidden items-center gap-3">
        <span className="font-mono-tabular text-[11px] font-semibold text-[#f0e9da] whitespace-nowrap shrink-0">
          Reflectance
        </span>
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          <span className="font-mono-tabular text-[10px] text-[#a6a096] shrink-0">0%</span>
          <div
            className="h-2 flex-1 rounded-full border border-white/10"
            style={{ background: GRADIENT_CSS }}
            role="img"
            aria-label="Color scale from 0 percent deep indigo to 100 percent white-hot specular reflectance"
          />
          <span className="font-mono-tabular text-[10px] text-[#fb923c] font-semibold shrink-0">
            {readout.peakSpecularPct}%
          </span>
        </div>
        <button
          type="button"
          onClick={onExit}
          aria-label="Exit reflection heat map"
          className="inline-flex items-center justify-center w-7 h-7 rounded text-[#a6a096] hover:text-[#f0e9da] transition-colors cursor-pointer shrink-0"
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* Tablet / Desktop full metrology scale card */}
      <div className="hidden sm:block">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono-tabular text-[11px] font-semibold tracking-wide text-[#f0e9da]">
            Reflection Intensity
          </span>
          <button
            type="button"
            onClick={onExit}
            aria-label="Exit reflection heat map"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-[#a6a096] hover:text-[#f0e9da] transition-colors cursor-pointer px-1.5 py-0.5 rounded"
          >
            <span>Close</span>
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-2">
          <div
            className="h-2.5 w-full rounded-full border border-white/10"
            style={{ background: GRADIENT_CSS }}
            role="img"
            aria-label="Color scale from 0 percent deep indigo to 100 percent white-hot specular reflectance"
          />
          <div className="mt-1 flex items-center justify-between font-mono-tabular text-[10px] text-[#a6a096]">
            <span>0% Low</span>
            <span>50% Mid</span>
            <span>100% Peak</span>
          </div>
        </div>

        <dl className="mt-2.5 pt-2 border-t border-white/10 grid grid-cols-2 gap-x-3 gap-y-1.5">
          <div>
            <dt className="text-[10px] text-[#a6a096]">Bevel Peak</dt>
            <dd className="font-mono-tabular text-xs font-semibold text-[#fb923c]">
              {readout.peakSpecularPct}%
            </dd>
          </div>
          <div>
            <dt className="text-[10px] text-[#a6a096]">Glass Rim</dt>
            <dd className="font-mono-tabular text-xs font-semibold text-[#facc15]">
              {readout.glassGrazingPct}%
            </dd>
          </div>
          <div>
            <dt className="text-[10px] text-[#a6a096]">Satin Barrel</dt>
            <dd className="font-mono-tabular text-xs font-semibold text-[#34d399]">
              {readout.barrelMeanPct}%
            </dd>
          </div>
          <div>
            <dt className="text-[10px] text-[#a6a096]">Matte Baffle</dt>
            <dd className="font-mono-tabular text-xs font-semibold text-[#38bdf8]">
              {readout.baffleStrayPct}%
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
