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
 * Renders the supplied pick-and-headstock artwork in Chordly's amber palette.
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
        className="relative shrink-0 flex items-center justify-center transition-transform duration-300 group-hover:scale-105"
        suppressHydrationWarning
      >
        <img
          src="/logo-pick.svg"
          alt="Chordly Logo"
          width={numSize}
          height={numSize}
          className="w-full h-full object-contain select-none pointer-events-none"
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
