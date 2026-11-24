import { useCallback, useEffect, useRef, useState } from 'react';

interface HoldVerbButtonProps {
  fStop: string;
  onFirstGesture: () => void;
  onEngageChange: (progress: number) => void;
}

const RING_RADIUS = 20;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * Step 01 & Step 08 — The One Verb:
 * Hold-to-Engage mechanical aperture & helical focus drive with an SVG progress ring.
 * The same gesture unlocks Web Audio synthesis and mobile phone tilt permissions.
 */
export function HoldVerbButton({
  fStop,
  onFirstGesture,
  onEngageChange,
}: HoldVerbButtonProps) {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);

  const holdingRef = useRef(false);
  const progressRef = useRef(0);
  const rafRef = useRef(0);
  const lastTimeRef = useRef(0);
  const unlockedRef = useRef(false);

  const animate = useCallback(
    (now: number) => {
      const dt = Math.min(0.05, (now - lastTimeRef.current) / 1000);
      lastTimeRef.current = now;

      const rate = holdingRef.current ? 1.15 : -1.85;
      const next = Math.max(0, Math.min(1, progressRef.current + rate * dt));

      if (Math.abs(next - progressRef.current) > 0.0005) {
        progressRef.current = next;
        setProgress(next);
        onEngageChange(next);
      }

      if (holdingRef.current || progressRef.current > 0.001) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        rafRef.current = 0;
        if (progressRef.current !== 0) {
          progressRef.current = 0;
          setProgress(0);
          onEngageChange(0);
        }
      }
    },
    [onEngageChange],
  );

  const startHold = useCallback(() => {
    if (!unlockedRef.current) {
      unlockedRef.current = true;
      onFirstGesture();
    }
    if (!holdingRef.current) {
      holdingRef.current = true;
      setHolding(true);
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(12);
      }
      if (!rafRef.current) {
        lastTimeRef.current = performance.now();
        rafRef.current = requestAnimationFrame(animate);
      }
    }
  }, [animate, onFirstGesture]);

  const endHold = useCallback(() => {
    if (holdingRef.current) {
      holdingRef.current = false;
      setHolding(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const strokeDashoffset = RING_CIRCUMFERENCE * (1 - progress);
  const pct = Math.round(progress * 100);

  return (
    <button
      type="button"
      data-interactive="true"
      data-testid="hold-engage-button"
      data-engage-progress={pct}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        startHold();
      }}
      onPointerUp={endHold}
      onPointerCancel={endHold}
      onLostPointerCapture={endHold}
      onKeyDown={(e) => {
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault();
          startHold();
        }
      }}
      onKeyUp={(e) => {
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault();
          endHold();
        }
      }}
      onBlur={endHold}
      aria-label="Hold to engage mechanical iris stop-down and focus drive"
      className={`group touch-none select-none inline-flex items-center gap-4 pl-3 pr-5 py-2.5 min-h-[56px] rounded-xl border transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#dc2626] ${
        holding
          ? 'bg-[#dc2626]/20 border-[#dc2626] text-[#f0e9da]'
          : 'bg-[#141418]/95 border-white/15 text-[#f0e9da] hover:border-[#dc2626]/70 hover:bg-[#1a1a20]'
      }`}
    >
      {/* Circular progress ring */}
      <span className="relative flex items-center justify-center w-11 h-11 shrink-0">
        <svg className="w-11 h-11 -rotate-90" viewBox="0 0 48 48" aria-hidden="true">
          <circle
            cx="24"
            cy="24"
            r={RING_RADIUS}
            fill="none"
            stroke="rgba(240, 233, 218, 0.16)"
            strokeWidth="2.5"
          />
          <circle
            cx="24"
            cy="24"
            r={RING_RADIUS}
            fill="none"
            stroke="#dc2626"
            strokeWidth="2.75"
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={strokeDashoffset}
          />
        </svg>
        <span className="absolute font-mono-tabular text-[11px] font-semibold text-[#f0e9da]">
          {holding || pct > 0 ? `${pct}%` : '50'}
        </span>
      </span>

      <span className="flex flex-col items-start text-left">
        <span className="text-sm font-semibold tracking-tight text-[#f0e9da] whitespace-nowrap">
          {holding ? 'Engaging Iris & Helical Drive' : 'Hold to Engage Lens'}
        </span>
        <span className="font-mono-tabular text-xs text-[#a6a096] whitespace-nowrap">
          Aperture {fStop} · Enables audio &amp; tilt
        </span>
      </span>
    </button>
  );
}
