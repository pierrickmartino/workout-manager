import * as React from "react";

import { cn } from "@/lib/utils";
import {
  AVATAR_VIEWBOX,
  type AvatarAccent,
  type AvatarArt,
  type AvatarTone,
} from "@/lib/avatar/avatar-art";

// A user's Avatar (ADR-0136): the hand-made figure from `lib/avatar/avatar-art`, framed in a
// circular medallion ringed in the Avatar's accent. Every colour is an opaque Skin token, and
// every edge the art draws is a pairing the Contrast Floor measures (ADR-0081): a text rung or
// an accent against the `elevated` medallion, and the `hollow` page colour only ever inside a
// text-rung shape. So the figure stays legible in every Skin and Mode.
// Decorative (`aria-hidden`): whatever wraps it names its purpose. No hooks, so it is safe in
// Server Components.

interface AvatarProps {
  art: AvatarArt;
  // Rendered medallion size in px (square).
  size?: number;
  className?: string;
}

// Each accent's figure fill and medallion ring, spelled out so Tailwind sees every class.
const ACCENT_CLASSES: Readonly<Record<AvatarAccent, { fill: string; ring: string }>> = {
  cyan: { fill: "fill-cyan", ring: "border-cyan" },
  amber: { fill: "fill-amber", ring: "border-amber" },
  green: { fill: "fill-green", ring: "border-green" },
};

const TONE_FILL: Readonly<Record<Exclude<AvatarTone, "accent">, string>> = {
  primary: "fill-text-primary",
  secondary: "fill-text-secondary",
  muted: "fill-text-muted",
  hollow: "fill-base",
};

function toneClass(tone: AvatarTone, accent: AvatarAccent): string {
  return tone === "accent" ? ACCENT_CLASSES[accent].fill : TONE_FILL[tone];
}

export function Avatar({ art, size = 32, className }: AvatarProps): React.JSX.Element {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={cn(
        "flex shrink-0 overflow-hidden rounded-full border-2 bg-elevated",
        ACCENT_CLASSES[art.accent].ring,
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
