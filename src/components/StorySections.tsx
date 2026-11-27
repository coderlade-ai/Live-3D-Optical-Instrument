import { ArrowDown } from 'lucide-react';
import { LENS_PARTS, computeScrollReveal } from '../engine/cues';
import { FINISH_PRESETS, FinishId } from '../engine/materials';
import { ViewMode } from '../engine/heatmap';
import { HoldVerbButton } from './HoldVerbButton';

interface StorySectionsProps {
  scrollProgress: number;
  fStop: string;
  timeScale: number;
  finish: FinishId;
  viewMode: ViewMode;
  onFinishChange: (finish: FinishId) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onFirstGesture: () => void;
  onEngageChange: (progress: number) => void;
  onNavigateSection: (sectionId: string) => void;
}

const FOUR_LAYERS = [
  {
    index: '01',
    title: 'Procedural Geometry',
    detail:
      '2D signed-distance shapes melted with smooth unions, traced via Marching Squares, and extruded with 0.05 mm polished bevels in real millimetres.',
  },
  {
    index: '02',
    title: 'Physical Materials',
    detail:
      'Dual materials per part — anisotropic brushed satin faces paired against mirror-polished bevels, iridescent steel rails, and studio-only optical glass.',
  },
  {
    index: '03',
    title: 'PMREM Photo Studio',
    detail:
      'A dark room baked in code: one off-axis softbox and twin tall strip edge lights that rotate continuously with your cursor or phone tilt.',
  },
  {
    index: '04',
    title: 'Scroll Direction',
    detail:
      'Size-framed camera cues fit the lens accurately on both a 390 px phone and a 1440 px desktop monitor, paired with one shared simulation clock.',
  },
];

export function StorySections({
  scrollProgress,
  fStop,
  timeScale,
  finish,
  viewMode,
  onFinishChange,
  onViewModeChange,
  onFirstGesture,
  onEngageChange,
  onNavigateSection,
}: StorySectionsProps) {
  // Bug 04: Drive subtle section reveal emphasis directly from scroll position
  const heroAlpha = computeScrollReveal(scrollProgress, 0.0, 0.28);
  const closeAlpha = computeScrollReveal(scrollProgress, 0.25, 0.25);
  const apartAlpha = computeScrollReveal(scrollProgress, 0.54, 0.25);
  const studioAlpha = computeScrollReveal(scrollProgress, 0.78, 0.25);

  const slowMoLabel = timeScale < 0.25 ? '1/12× Slow Motion' : `${timeScale.toFixed(2)}× Real-Time`;

  return (
    <div className="relative z-10 pointer-events-none">
      {/* =====================================================================
          BEAT 01: HERO (at: 0.0)
          Desktop: Editorial copy anchored on left; 3D lens framed cleanly on right.
          Mobile: Headline at top, open breathing room for centered 3D lens, CTA below.
      ===================================================================== */}
      <section
        id="overview"
        className={`min-h-[100svh] flex flex-col justify-between lg:justify-center px-5 sm:px-8 lg:px-12 pb-16 lg:py-24 max-w-7xl mx-auto transition-[padding] duration-150 ${
          viewMode === 'heatmap' ? 'pt-36 sm:pt-20' : 'pt-28 sm:pt-20'
        }`}
      >
        <div
          className="max-w-lg pointer-events-auto transition-opacity duration-200"
          style={{ opacity: Math.max(0.85, heroAlpha) }}
        >
          <p className="font-mono-tabular text-xs tracking-wide text-[#ef4444]">
            01 · Live Procedural 3D Instrument
          </p>

          <h1 className="mt-3 font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.05] text-[#f0e9da]">
            Built from code.{' '}
            <span className="text-[#dc2626]">Lit like a studio.</span>
          </h1>

          <p className="mt-3.5 text-sm sm:text-base text-[#b8b2a8] leading-relaxed max-w-md">
            No video files. No downloaded 3D meshes. Every millimetre of the Kessler 50 mm f/1.4
            lens is generated live on your device, directed by the scroll.
          </p>

          {/* Unboxed clean metadata line (Zero-pill discipline) */}
          <div className="mt-3.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono-tabular text-xs text-[#a6a096]">
            <span>50 mm f/1.4</span>
            <span aria-hidden="true">·</span>
            <span>8 Assemblies</span>
            <span aria-hidden="true">·</span>
            <span>0.05 mm Bevels</span>
            <span aria-hidden="true">·</span>
            <span>Zero Video</span>
          </div>
        </div>

        {/* Interactive Hold-to-Engage verb (placed cleanly below open 3D space on mobile, inline on desktop) */}
        <div className="mt-auto lg:mt-8 pt-40 sm:pt-52 lg:pt-0 flex flex-wrap items-center gap-3 sm:gap-4 pointer-events-auto">
          <HoldVerbButton
            fStop={fStop}
            onFirstGesture={onFirstGesture}
            onEngageChange={onEngageChange}
          />

          <button
            type="button"
            onClick={() => onNavigateSection('optics')}
            className="hidden sm:inline-flex items-center gap-2 px-4 py-3 min-h-[44px] text-xs font-medium text-[#a6a096] hover:text-[#f0e9da] transition-colors cursor-pointer whitespace-nowrap"
          >
            <span>Scroll the story</span>
            <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </section>

      {/* =====================================================================
          BEAT 02: CLOSE-UP & 1/12x SLOW MOTION (at: 0.25)
      ===================================================================== */}
      <section
        id="optics"
        className="min-h-[100svh] flex flex-col justify-end lg:justify-center lg:items-end px-5 sm:px-8 lg:px-12 py-24 max-w-7xl mx-auto"
      >
        <div
          className="w-full max-w-md bg-[#0e0e11]/92 border border-white/10 rounded-xl p-6 sm:p-7 pointer-events-auto transition-opacity duration-200"
          style={{ opacity: Math.max(0.72, closeAlpha) }}
        >
          <div className="flex items-center justify-between gap-2 font-mono-tabular text-xs">
            <span className="text-[#ef4444]">02 · Macro Inspection</span>
            <span className="text-[#f0e9da]">{slowMoLabel}</span>
          </div>

          <h2 className="mt-3 font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#f0e9da]">
            Ten blades.{' '}
            <span className="text-[#dc2626]">One shared clock.</span>
          </h2>

          <p className="mt-3 text-sm text-[#b8b2a8] leading-relaxed">
            Each curved iris blade is melted from 2D signed-distance circles and capsules, traced
            via Marching Squares, and extruded with a 0.05 mm mirror chamfer where the studio strip
            light catches.
          </p>

          <dl className="mt-5 pt-4 border-t border-white/10 grid grid-cols-2 gap-4">
            <div>
              <dt className="text-xs text-[#a6a096]">Clock Speed</dt>
              <dd className="mt-1 font-mono-tabular text-sm font-semibold text-[#f0e9da]">
                1/12× Macro
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[#a6a096]">Edge Chamfer</dt>
              <dd className="mt-1 font-mono-tabular text-sm font-semibold text-[#f0e9da]">
                0.05 mm Bevel
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[#a6a096]">Face Finish</dt>
              <dd className="mt-1 font-mono-tabular text-sm font-semibold text-[#f0e9da]">
                Radial Brushed
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[#a6a096]">Active Aperture</dt>
              <dd className="mt-1 font-mono-tabular text-sm font-semibold text-[#ef4444]">
                {fStop}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* =====================================================================
          BEAT 03: APART — STAGGERED EXPLODED VIEW (at: 0.54)
      ===================================================================== */}
      <section
        id="exploded"
        className="min-h-[115svh] flex flex-col justify-between px-5 sm:px-8 lg:px-12 pt-20 pb-24 max-w-7xl mx-auto"
      >
        <div
          className="max-w-xl mx-auto text-center pointer-events-auto transition-opacity duration-200"
          style={{ opacity: Math.max(0.75, apartAlpha) }}
        >
          <p className="font-mono-tabular text-xs tracking-wide text-[#ef4444]">
            03 · Staggered Exploded Assembly
          </p>
          <h2 className="mt-2 font-display text-2xl sm:text-4xl font-bold tracking-tight text-[#f0e9da]">
            Taken apart <span className="text-[#dc2626]">on camera.</span>
          </h2>
          <p className="mt-2.5 text-sm text-[#b8b2a8] leading-relaxed">
            Top elements lift first and seat back last. Switch to Blueprint Mode at any moment to
            inspect the raw procedural edges beneath the metal.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2.5">
            <button
              type="button"
              onClick={() => onViewModeChange(viewMode === 'blueprint' ? 'studio' : 'blueprint')}
              aria-pressed={viewMode === 'blueprint'}
              className={`px-4 py-2.5 min-h-[44px] rounded-lg text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                viewMode === 'blueprint'
                  ? 'bg-[#dc2626] border-[#dc2626] text-white'
                  : 'bg-[#121216]/95 border-white/15 text-[#f0e9da] hover:border-[#dc2626]'
              }`}
            >
              {viewMode === 'blueprint' ? 'Return to Studio Metal' : 'Inspect Blueprint Edges'}
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange(viewMode === 'heatmap' ? 'studio' : 'heatmap')}
              aria-pressed={viewMode === 'heatmap'}
              className={`px-4 py-2.5 min-h-[44px] rounded-lg text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                viewMode === 'heatmap'
                  ? 'bg-[#dc2626] border-[#dc2626] text-white'
                  : 'bg-[#121216]/95 border-white/15 text-[#f0e9da] hover:border-[#dc2626]'
              }`}
            >
              {viewMode === 'heatmap' ? 'Exit Reflection Heat Map' : 'Reflection Heat Map'}
            </button>
          </div>
        </div>

        {/* Mobile/Tablet compact part legend below the centered exploded lens */}
        <div className="lg:hidden mt-72 sm:mt-80 bg-[#0e0e11]/92 border border-white/10 rounded-xl p-4 pointer-events-auto">
          <p className="font-mono-tabular text-[11px] text-[#ef4444] mb-3">
            Assembly Index · Front to Bayonet
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2.5">
            {LENS_PARTS.map((part) => (
              <div
                key={part.id}
                className="flex items-baseline justify-between gap-2 pb-2 border-b border-white/6 last:border-b-0"
              >
                <div className="min-w-0">
                  <span className="font-mono-tabular text-xs font-semibold text-[#ef4444] mr-2">
                    {part.code}
                  </span>
                  <span className="text-xs font-medium text-[#f0e9da]">{part.name}</span>
                </div>
                <span className="font-mono-tabular text-[11px] text-[#a6a096] whitespace-nowrap shrink-0">
                  {part.dimensionsMm}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* =====================================================================
          BEAT 04: AROUND — PMREM PHOTO STUDIO & METALLURGY (at: 0.78)
      ===================================================================== */}
      <section
        id="studio"
        className="min-h-[100svh] flex flex-col justify-end lg:justify-center px-5 sm:px-8 lg:px-12 py-24 max-w-7xl mx-auto"
      >
        <div
          className="w-full max-w-md bg-[#0e0e11]/92 border border-white/10 rounded-xl p-6 sm:p-7 pointer-events-auto transition-opacity duration-200"
          style={{ opacity: Math.max(0.75, studioAlpha) }}
        >
          <p className="font-mono-tabular text-xs tracking-wide text-[#ef4444]">
            04 · PMREM Lighting &amp; Metallurgy
          </p>
          <h2 className="mt-2.5 font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#f0e9da]">
            Metal is a mirror.{' '}
            <span className="text-[#dc2626]">Finish is the brand.</span>
          </h2>
          <p className="mt-3 text-sm text-[#b8b2a8] leading-relaxed">
            Move your cursor or tilt your phone to rotate the virtual photo studio around the
            barrel. Optical glass reflects only the studio softboxes so no fake hotspot dot appears.
          </p>

          {/* Direct adjacent interactive finish selector (Claim-to-Proof Adjacency) */}
          <div className="mt-5 pt-4 border-t border-white/10">
            <p className="text-xs font-medium text-[#a6a096] mb-2.5">
              Select barrel alloy finish
            </p>
            <div className="grid grid-cols-3 gap-2">
              {Object.values(FINISH_PRESETS).map((preset) => {
                const active = finish === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onFinishChange(preset.id)}
                    aria-pressed={active}
                    className={`flex flex-col items-start gap-1.5 p-2.5 min-h-[56px] rounded-lg border text-left transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#1c1c22] border-[#dc2626] text-[#f0e9da]'
                        : 'bg-[#09090b] border-white/10 text-[#a6a096] hover:border-white/25 hover:text-[#f0e9da]'
                    }`}
                  >
                    <span
                      className="w-4 h-4 rounded-full border border-white/25"
                      style={{ backgroundColor: preset.swatchHex }}
                      aria-hidden="true"
                    />
                    <span className="text-xs font-medium leading-tight whitespace-nowrap">
                      {preset.label.split(' ')[1]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => onViewModeChange(viewMode === 'heatmap' ? 'studio' : 'heatmap')}
              aria-pressed={viewMode === 'heatmap'}
              className={`px-3.5 py-2 min-h-[40px] rounded-lg text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                viewMode === 'heatmap'
                  ? 'bg-[#dc2626] border-[#dc2626] text-white'
                  : 'bg-[#151519] border-white/15 text-[#f0e9da] hover:border-[#dc2626]'
              }`}
            >
              {viewMode === 'heatmap' ? 'Exit Reflection Heat Map' : 'Visualize Reflection Heat Map'}
            </button>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono-tabular text-[11px] text-[#a6a096]">
              <span>Key Softbox</span>
              <span aria-hidden="true">·</span>
              <span>Twin Strips</span>
              <span aria-hidden="true">·</span>
              <span>ACES</span>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          BEAT 05: REBUILD & REAL-MILLIMETRE SPECIFICATIONS (at: 1.0)
      ===================================================================== */}
      <section
        id="specs"
        className="min-h-[100svh] flex flex-col justify-end px-5 sm:px-8 lg:px-12 pt-28 pb-28 max-w-7xl mx-auto"
      >
        <div className="bg-[#0c0c0f]/94 border border-white/10 rounded-2xl p-6 sm:p-8 lg:p-10 pointer-events-auto">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-8 border-b border-white/10">
            <div className="max-w-xl">
              <p className="font-mono-tabular text-xs tracking-wide text-[#ef4444]">
                05 · Four Layers · Zero Footage
              </p>
              <h2 className="mt-2 font-display text-2xl sm:text-4xl font-bold tracking-tight text-[#f0e9da]">
                Reassembled in real millimetres.
              </h2>
              <p className="mt-2.5 text-sm text-[#b8b2a8] leading-relaxed">
                Every part in the Kessler 50 mm optical column ships as pure procedural TypeScript
                and WebGL shaders — responsive on every screen from mobile portrait to ultrawide.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-6 shrink-0">
              <div>
                <p className="font-display text-2xl sm:text-3xl font-extrabold text-[#dc2626] font-mono-tabular">
                  0
                </p>
                <p className="mt-1 text-xs text-[#a6a096]">Video files</p>
              </div>
              <div>
                <p className="font-display text-2xl sm:text-3xl font-extrabold text-[#f0e9da] font-mono-tabular">
                  8
                </p>
                <p className="mt-1 text-xs text-[#a6a096]">SDF &amp; lathe parts</p>
              </div>
              <div>
                <p className="font-display text-2xl sm:text-3xl font-extrabold text-[#f0e9da] font-mono-tabular">
                  1
                </p>
                <p className="mt-1 text-xs text-[#a6a096]">Fixed canvas</p>
              </div>
            </div>
          </div>

          {/* 4-Layer Architecture Grid */}
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {FOUR_LAYERS.map((layer) => (
              <div key={layer.index} className="flex flex-col">
                <span className="font-mono-tabular text-xs font-semibold text-[#ef4444]">
                  {layer.index}
                </span>
                <h3 className="mt-1.5 text-sm font-semibold text-[#f0e9da]">{layer.title}</h3>
                <p className="mt-1.5 text-xs text-[#a6a096] leading-relaxed">{layer.detail}</p>
              </div>
            ))}
          </div>

          {/* Millimetre Parts Specification Table (Responsive overflow container) */}
          <div className="mt-8 pt-6 border-t border-white/10">
            <h3 className="text-sm font-semibold text-[#f0e9da] mb-4">
              Real-Millimetre Assembly Manifest
            </h3>
            <div className="overflow-x-auto -mx-2 px-2">
              <table className="w-full text-left border-collapse min-w-[540px]">
                <thead>
                  <tr className="border-b border-white/10 font-mono-tabular text-[11px] text-[#a6a096]">
                    <th className="py-2 pr-4 font-medium">Part</th>
                    <th className="py-2 px-4 font-medium">Dimensions</th>
                    <th className="py-2 px-4 font-medium">Material &amp; Edge</th>
                    <th className="py-2 pl-4 font-medium text-right">Lift Order</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/6 text-xs">
                  {LENS_PARTS.map((part) => (
                    <tr key={part.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-2.5 pr-4 font-medium text-[#f0e9da] whitespace-nowrap">
                        <span className="font-mono-tabular text-[#ef4444] mr-2">{part.code}</span>
                        {part.name}
                      </td>
                      <td className="py-2.5 px-4 font-mono-tabular text-[#d6cfc2] whitespace-nowrap">
                        {part.dimensionsMm}
                      </td>
                      <td className="py-2.5 px-4 text-[#a6a096]">{part.materialNote}</td>
                      <td className="py-2.5 pl-4 font-mono-tabular text-right text-[#d6cfc2] whitespace-nowrap">
                        {part.order.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Quiet Editorial Footer */}
          <footer className="mt-8 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-[#a6a096]">
            <p>Kessler 50 mm f/1.4 · Built entirely with procedural Three.js &amp; Web Audio.</p>
            <button
              type="button"
              onClick={() => onNavigateSection('overview')}
              className="text-[#f0e9da] hover:text-[#ef4444] font-medium transition-colors cursor-pointer"
            >
              Back to top
            </button>
          </footer>
        </div>
      </section>
    </div>
  );
}
