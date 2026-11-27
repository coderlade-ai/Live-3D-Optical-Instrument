import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { ViewMode } from '../engine/heatmap';
import { OpticalDataSnapshot } from '../engine/opticalTelemetry';

interface OpticalDataOverlayProps {
  data: OpticalDataSnapshot;
  viewMode: ViewMode;
}

/**
 * Real-Time Optical Data Telemetry Overlay.
 * Displays live lens element count, refractive index values (nD), and Gullstrand
 * effective focal length responding dynamically to camera zoom and exploded state.
 * - Solid opaque obsidian backing (zero backdrop-blur over WebGL).
 * - Compact 36px strip on mobile (< 640px) with expandable detail drawer.
 * - Full metrology card on desktop (>= 640px) at top-right, shifting cleanly below
 *   HeatMapLegend whenever Heat Map mode is active.
 */
export function OpticalDataOverlay({ data, viewMode }: OpticalDataOverlayProps) {
  const [desktopExpanded, setDesktopExpanded] = useState(true);
  const [mobileExpanded, setMobileExpanded] = useState(false);

  const isHeatmap = viewMode === 'heatmap';

  return (
    <section
      aria-label="Real-time optical data overlay"
      data-testid="optical-data-overlay"
      data-interactive="true"
      className={`fixed inset-x-0 sm:inset-x-auto sm:right-5 z-30 sm:w-[272px] bg-[#0e0e11] border-b sm:border border-white/12 sm:rounded-xl px-4 py-2 sm:px-3 sm:py-2.5 shadow-xl transition-[top] duration-150 ${
        isHeatmap ? 'top-[101px] sm:top-[244px]' : 'top-14 sm:top-16'
      }`}
    >
      {/* Mobile ultra-compact single-row readout strip (<= 36px collapsed) */}
      <div className="sm:hidden">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 font-mono-tabular text-[11px] truncate">
            <span className="font-semibold text-[#f0e9da] shrink-0">
              {data.elementCount} Elem
            </span>
            <span className="text-white/25" aria-hidden="true">·</span>
            <span className="text-[#38bdf8] shrink-0">
              nD {data.effectiveRefractiveIndex.toFixed(3)}
            </span>
            <span className="text-white/25" aria-hidden="true">·</span>
            <span className="font-semibold text-[#fb923c] shrink-0">
              EFL {data.effectiveFocalLengthMm.toFixed(1)} mm
            </span>
          </div>

          <button
            type="button"
            onClick={() => setMobileExpanded((v) => !v)}
            aria-expanded={mobileExpanded}
            aria-label={mobileExpanded ? 'Collapse optical telemetry details' : 'Expand optical telemetry details'}
            className="inline-flex items-center justify-center w-7 h-7 rounded text-[#a6a096] hover:text-[#f0e9da] transition-colors cursor-pointer shrink-0"
          >
            {mobileExpanded ? (
              <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            )}
          </button>
        </div>

        {mobileExpanded && (
          <dl className="mt-2 pt-2 border-t border-white/10 grid grid-cols-3 gap-2 font-mono-tabular text-[10px]">
            <div>
              <dt className="text-[#a6a096]">Front LaF</dt>
              <dd className="text-[#f0e9da] font-semibold">nD {data.frontRefractiveIndex.toFixed(3)}</dd>
            </div>
            <div>
              <dt className="text-[#a6a096]">Inner BaK</dt>
              <dd className="text-[#f0e9da] font-semibold">nD {data.innerRefractiveIndex.toFixed(3)}</dd>
            </div>
            <div>
              <dt className="text-[#a6a096]">Air Gap</dt>
              <dd className="text-[#38bdf8] font-semibold">{data.airGapMm.toFixed(1)} mm</dd>
            </div>
          </dl>
        )}
      </div>

      {/* Tablet / Desktop compact optical metrology panel */}
      <div className="hidden sm:block">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono-tabular text-[11px] font-semibold tracking-wide text-[#f0e9da] whitespace-nowrap">
            Optical Telemetry
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="font-mono-tabular text-[10px] text-[#38bdf8] whitespace-nowrap">
              {data.couplingState}
            </span>
            <button
              type="button"
              onClick={() => setDesktopExpanded((v) => !v)}
              aria-expanded={desktopExpanded}
              aria-label={desktopExpanded ? 'Collapse optical data panel' : 'Expand optical data panel'}
              className="inline-flex items-center justify-center w-5 h-5 rounded text-[#a6a096] hover:text-[#f0e9da] transition-colors cursor-pointer"
            >
              {desktopExpanded ? (
                <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {desktopExpanded && (
          <>
            <dl className="mt-1.5 pt-1.5 border-t border-white/10 grid grid-cols-2 gap-x-3 gap-y-1.5">
              <div>
                <dt className="text-[10px] text-[#a6a096] leading-tight">Lens Elements</dt>
                <dd
                  data-testid="optical-element-count"
                  className="font-mono-tabular text-xs font-semibold text-[#f0e9da]"
                >
                  {data.elementCount} / {data.groupCount} grp
                </dd>
              </div>
              <div>
                <dt className="text-[10px] text-[#a6a096] leading-tight">Effective FL</dt>
                <dd
                  data-testid="optical-efl"
                  className="font-mono-tabular text-xs font-semibold text-[#fb923c]"
                >
                  {data.effectiveFocalLengthMm.toFixed(1)} mm
                </dd>
              </div>
              <div>
                <dt className="text-[10px] text-[#a6a096] leading-tight">Path Index (nD)</dt>
                <dd
                  data-testid="optical-nd-eff"
                  className="font-mono-tabular text-xs font-semibold text-[#38bdf8]"
                >
                  {data.effectiveRefractiveIndex.toFixed(3)}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] text-[#a6a096] leading-tight">Zoom / Air Gap</dt>
                <dd
                  data-testid="optical-air-gap"
                  className="font-mono-tabular text-xs font-semibold text-[#d6cfc2]"
                >
                  {data.zoomFactor.toFixed(2)}× · {data.airGapMm.toFixed(1)} mm
                </dd>
              </div>
            </dl>

            <div className="mt-1.5 pt-1.5 border-t border-white/10 space-y-0.5 font-mono-tabular text-[10px]">
              <div className="flex items-center justify-between text-[#a6a096]">
                <span>LaF Front · BaK Inner</span>
                <span className="text-[#f0e9da]">
                  {data.frontRefractiveIndex.toFixed(3)} · {data.innerRefractiveIndex.toFixed(3)}
                </span>
              </div>
              <div className="flex items-center justify-between text-[#a6a096]">
                <span>Rear Flint · Abbe Vd</span>
                <span className="text-[#f0e9da]">
                  {data.rearRefractiveIndex.toFixed(3)} · {data.abbeNumber.toFixed(1)}
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
