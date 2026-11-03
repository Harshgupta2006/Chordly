import React from "react";

interface ChordlyLogoProps {
  /**
   * Pixel dimension or Tailwind size classes. Default size is 32px (w-8 h-8).
   */
  size?: number | string;
  className?: string;
  showWordmark?: boolean;
}

/**
 * ChordlyLogo: The official acoustic guitar emblem for Chordly.
 * Renders the clean amber-gold acoustic guitar vector from /logo.svg.
 * Using an image asset avoids browser extension (e.g. Dark Reader)
 * DOM mutations on inline SVG elements, eliminating hydration warnings.
 */
export default function ChordlyLogo({
  size = 32,
  className = "",
  showWordmark = false,
}: ChordlyLogoProps) {
  const dimension = typeof size === "number" ? `${size}px` : size;
  const numSize = typeof size === "number" ? size : 32;

  return (
    <div className={`flex items-center gap-2.5 ${className}`} suppressHydrationWarning>
      <div
        style={{ width: dimension, height: dimension }}
        className="relative shrink-0 flex items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/15 to-orange-500/10 border border-amber-500/30 p-1 shadow-md shadow-amber-500/10 transition-all duration-300 hover:border-amber-400 hover:shadow-amber-500/25 hover:scale-105"
        suppressHydrationWarning
      >
        <img
          src="/logo.svg"
          alt="Chordly Logo"
          width={numSize}
          height={numSize}
          className="w-full h-full object-contain drop-shadow-[0_1px_4px_rgba(245,158,11,0.35)] select-none pointer-events-none"
          loading="eager"
          suppressHydrationWarning
        />
      </div>

      {showWordmark && (
        <span className="font-black text-xl tracking-tight text-zinc-100 group-hover:text-amber-400 transition-colors">
          Chordly
        </span>
      )}
    </div>
  );
}
