import { forwardRef, useImperativeHandle, useRef } from 'react';
import { LENS_PARTS } from '../engine/cues';
import { ProjectedCallout } from '../engine/LiveLensEngine';

export interface ExplodedCalloutsHandle {
  update: (callouts: ProjectedCallout[], opacity: number) => void;
}

const LEFT_PARTS = LENS_PARTS.filter((p) => p.column === 'left');
const RIGHT_PARTS = LENS_PARTS.filter((p) => p.column === 'right');

/**
 * Step 07 — Labels:
 * "Project 3D points to the screen each frame and stack labels in two clean columns with leader lines."
 *
 * Updates SVG leader lines and 3D anchor points imperatively via refs so zero React re-renders
 * occur inside the 60fps animation loop. On screens < 1024px, switches cleanly to non-overlapping
 * numbered 3D anchor pips so mobile screens never experience side-column clipping.
 */
export const ExplodedCallouts = forwardRef<ExplodedCalloutsHandle>(function ExplodedCallouts(
  _props,
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef<Record<string, SVGPathElement | null>>({});
  const dotRefs = useRef<Record<string, SVGCircleElement | null>>({});
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const mobilePipRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useImperativeHandle(ref, () => ({
    update(callouts: ProjectedCallout[], opacity: number) {
      const container = containerRef.current;
      if (!container) return;

      container.style.opacity = opacity > 0.01 ? opacity.toFixed(3) : '0';
      if (opacity <= 0.01 || callouts.length === 0) return;

      const isDesktop = window.innerWidth >= 1024;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      for (const c of callouts) {
        const clampedX = Math.max(16, Math.min(vw - 16, c.x));
        const clampedY = Math.max(72, Math.min(vh - 96, c.y));

        // Update mobile numbered pip markers
        const pip = mobilePipRefs.current[c.id];
        if (pip) {
          pip.style.transform = `translate3d(${clampedX.toFixed(1)}px, ${clampedY.toFixed(1)}px, 0)`;
          pip.style.opacity = c.visible && !isDesktop ? '1' : '0';
        }

        // Update desktop leader lines connecting column card edge to 3D point
        const pathEl = lineRefs.current[c.id];
        const dotEl = dotRefs.current[c.id];
        const cardEl = cardRefs.current[c.id];

        if (isDesktop && pathEl && dotEl && cardEl && c.visible) {
          const rect = cardEl.getBoundingClientRect();
          const startX = c.column === 'left' ? rect.right + 6 : rect.left - 6;
          const startY = rect.top + rect.height * 0.5;
          const elbowX =
            c.column === 'left'
              ? startX + Math.max(18, (clampedX - startX) * 0.35)
              : startX - Math.max(18, (startX - clampedX) * 0.35);

          pathEl.setAttribute(
            'd',
            `M ${startX.toFixed(1)} ${startY.toFixed(1)} L ${elbowX.toFixed(1)} ${startY.toFixed(1)} L ${clampedX.toFixed(1)} ${clampedY.toFixed(1)}`,
          );
          pathEl.style.opacity = '1';

          dotEl.setAttribute('cx', clampedX.toFixed(1));
          dotEl.setAttribute('cy', clampedY.toFixed(1));
          dotEl.style.opacity = '1';
        } else {
          if (pathEl) pathEl.style.opacity = '0';
          if (dotEl) dotEl.style.opacity = '0';
        }
      }
    },
  }));

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="fixed inset-0 z-20 pointer-events-none transition-opacity duration-150"
      style={{ opacity: 0 }}
    >
      {/* Desktop SVG leader lines */}
      <svg className="hidden lg:block fixed inset-0 w-full h-full overflow-visible">
        {LENS_PARTS.map((part) => (
          <g key={part.id}>
            <path
              ref={(el) => {
                lineRefs.current[part.id] = el;
              }}
              fill="none"
              stroke="rgba(240, 233, 218, 0.34)"
              strokeWidth="1"
              style={{ opacity: 0 }}
            />
            <circle
              ref={(el) => {
                dotRefs.current[part.id] = el;
              }}
              r="3"
              fill="#dc2626"
              stroke="#f0e9da"
              strokeWidth="1"
              style={{ opacity: 0 }}
            />
          </g>
        ))}
      </svg>

      {/* Desktop Left Column (4 stacked parts) */}
      <div className="hidden lg:flex fixed left-8 top-1/2 -translate-y-1/2 flex-col gap-5 w-60">
        {LEFT_PARTS.map((part) => (
          <div
            key={part.id}
            ref={(el) => {
              cardRefs.current[part.id] = el;
            }}
            className="bg-[#0e0e11]/90 border border-white/10 rounded-lg px-3.5 py-2.5"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono-tabular text-[11px] font-semibold text-[#ef4444]">
                {part.code}
              </span>
              <span className="font-mono-tabular text-[11px] text-[#a6a096]">
                {part.dimensionsMm}
              </span>
            </div>
            <p className="mt-1 text-xs font-semibold text-[#f0e9da] leading-snug">
              {part.name}
            </p>
            <p className="mt-0.5 text-[11px] text-[#a6a096] leading-snug">
              {part.materialNote}
            </p>
          </div>
        ))}
      </div>

      {/* Desktop Right Column (4 stacked parts) */}
      <div className="hidden lg:flex fixed right-8 top-1/2 -translate-y-1/2 flex-col gap-5 w-60">
        {RIGHT_PARTS.map((part) => (
          <div
            key={part.id}
            ref={(el) => {
              cardRefs.current[part.id] = el;
            }}
            className="bg-[#0e0e11]/90 border border-white/10 rounded-lg px-3.5 py-2.5 text-right"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono-tabular text-[11px] text-[#a6a096]">
                {part.dimensionsMm}
              </span>
              <span className="font-mono-tabular text-[11px] font-semibold text-[#ef4444]">
                {part.code}
              </span>
            </div>
            <p className="mt-1 text-xs font-semibold text-[#f0e9da] leading-snug">
              {part.name}
            </p>
            <p className="mt-0.5 text-[11px] text-[#a6a096] leading-snug">
              {part.materialNote}
            </p>
          </div>
        ))}
      </div>

      {/* Mobile / Tablet compact projected part code pips (zero horizontal overflow) */}
      <div className="lg:hidden fixed inset-0">
        {LENS_PARTS.map((part) => (
          <div
            key={part.id}
            ref={(el) => {
              mobilePipRefs.current[part.id] = el;
            }}
            className="fixed top-0 left-0 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center w-6 h-6 rounded-full bg-[#0e0e11]/92 border border-[#dc2626] font-mono-tabular text-[10px] font-semibold text-[#f0e9da]"
            style={{ opacity: 0 }}
          >
            {part.code}
          </div>
        ))}
      </div>
    </div>
  );
});
