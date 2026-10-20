import * as React from "react";

import { cn } from "@/lib/utils";
import {
  AVATAR_VIEWBOX,
  type AvatarAccent,
  type AvatarArt,
  type AvatarTone,
} from "@/lib/avatar/avatar-art";

// A user's Avatar (ADR-0136): the hand-made figure from `lib/avatar/avatar-art`, framed in a
// circular medallion ringed in the Avatar's accent. Every colour is an opaque Skin token the
// Contrast Floor already measures (ADR-0081), so the figure renders in every Skin and Mode.
// Decorative (`aria-hidden`): whatever wraps it names its purpose. No hooks, so it is safe in
// Server Components.

interface AvatarProps {
  art: AvatarArt;
  // Rendered medallion size in px (square).
  size?: number;
  className?: string;
}

const ACCENT_FILL: Readonly<Record<AvatarAccent, string>> = {
  cyan: "fill-cyan",
  amber: "fill-amber",
  green: "fill-green",
};

const ACCENT_RING: Readonly<Record<AvatarAccent, string>> = {
  cyan: "border-cyan",
  amber: "border-amber",
  green: "border-green",
};

const TONE_FILL: Readonly<Record<Exclude<AvatarTone, "accent">, string>> = {
  primary: "fill-text-primary",
  secondary: "fill-text-secondary",
  muted: "fill-text-muted",
  hollow: "fill-base",
};

function toneClass(tone: AvatarTone, accent: AvatarAccent): string {
  return tone === "accent" ? ACCENT_FILL[accent] : TONE_FILL[tone];
}

export function Avatar({ art, size = 32, className }: AvatarProps): React.JSX.Element {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={cn(
        "flex shrink-0 overflow-hidden rounded-full border-2 bg-elevated",
        ACCENT_RING[art.accent],
        className,
      )}
    >
      <svg
        viewBox={`0 0 ${AVATAR_VIEWBOX} ${AVATAR_VIEWBOX}`}
        focusable="false"
        className="h-full w-full"
      >
        {art.shapes.map((shape, index) => (
          <path key={index} d={shape.d} className={toneClass(shape.tone, art.accent)} />
        ))}
      </svg>
    </span>
  );
}
