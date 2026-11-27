import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { BeatId } from '../engine/cues';
import { ViewMode } from '../engine/heatmap';

interface TopBarProps {
  activeBeat: BeatId;
  viewMode: ViewMode;
  onToggleHeatMap: () => void;
  onNavigateSection: (sectionId: string) => void;
}

const NAV_ITEMS: Array<{ id: string; beat: BeatId; label: string }> = [
  { id: 'overview', beat: 'hero', label: 'Overview' },
  { id: 'optics', beat: 'close', label: 'Optics' },
  { id: 'exploded', beat: 'apart', label: 'Exploded' },
  { id: 'studio', beat: 'around', label: 'Studio' },
  { id: 'specs', beat: 'outro', label: 'Specs' },
];

export function TopBar({
  activeBeat,
  viewMode,
  onToggleHeatMap,
  onNavigateSection,
}: TopBarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const isHeatMap = viewMode === 'heatmap';

  const handleNav = (id: string) => {
    setMobileOpen(false);
    onNavigateSection(id);
  };

  return (
    <header className="fixed top-0 inset-x-0 z-40 h-14 bg-[#09090b]/92 border-b border-white/10">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-4 md:gap-8 px-4 sm:px-6 lg:px-8">
        {/* Zone 1: Single-element brand wordmark */}
        <a
          href="#overview"
          onClick={(e) => {
            e.preventDefault();
            handleNav('overview');
          }}
          className="font-display text-base sm:text-lg font-bold tracking-tight text-[#f0e9da] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#dc2626]"
        >
          Kessler 50
        </a>

        {/* Zone 2: 5 concise single-line nav links */}
        <nav
          aria-label="Primary sections"
          className="hidden md:flex items-center gap-6 lg:gap-8"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeBeat === item.beat;
            return (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  handleNav(item.id);
                }}
                className={`text-sm font-medium transition-colors whitespace-nowrap shrink-0 py-1 border-b ${
                  isActive
                    ? 'text-[#f0e9da] border-[#dc2626]'
                    : 'text-[#a6a096] border-transparent hover:text-[#f0e9da]'
                }`}
              >
                {item.label}
              </a>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary action + mobile menu button */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleHeatMap}
            aria-pressed={isHeatMap}
            className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 min-h-[36px] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#dc2626] ${
              isHeatMap
                ? 'bg-[#dc2626] text-white hover:bg-[#b91c1c]'
                : 'bg-[#f0e9da] text-[#09090b] hover:bg-white'
            }`}
          >
            {isHeatMap ? 'Exit Heat Map' : 'Heat Map'}
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileOpen}
            className="md:hidden inline-flex items-center justify-center w-11 h-11 rounded-md text-[#f0e9da] hover:bg-white/10 transition-colors cursor-pointer"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile navigation drawer */}
      {mobileOpen && (
        <nav
          aria-label="Mobile sections"
          className="md:hidden bg-[#0e0e11] border-b border-white/10 px-4 py-3"
        >
          <ul className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive = activeBeat === item.beat;
              return (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      handleNav(item.id);
                    }}
                    className={`flex items-center justify-between min-h-[44px] px-3 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-[#dc2626]/15 text-[#f0e9da]'
                        : 'text-[#a6a096] hover:text-[#f0e9da] hover:bg-white/5'
                    }`}
                  >
                    <span>{item.label}</span>
                    {isActive && (
                      <span className="font-mono-tabular text-xs text-[#ef4444]">Active</span>
                    )}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </header>
  );
}
