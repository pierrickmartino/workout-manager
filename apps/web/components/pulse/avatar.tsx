import * as React from "react";

import { cn } from "@/lib/utils";
import type { AvatarAccent, AvatarArt } from "@/lib/avatar/avatar-art";

// A user's Avatar (ADR-0136, ADR-0137): the character's portrait in the published Avatar
// Universe, cropped to a circle and framed in a ring of the Avatar's accent. The ring is an
// opaque Skin token, so the frame follows the Skin and Mode; the portrait itself is a fixed
// image. A `silhouette` greys and darkens the portrait inside a neutral ring: the look of an
// Avatar the user hasn't unlocked yet.
// Decorative (`aria-hidden`, empty `alt`): whatever wraps it names its purpose. No hooks, so it
// is safe in Server Components.

interface AvatarProps {
  art: AvatarArt;
  // Rendered medallion size in px (square).
  size?: number;
  // Draw the portrait greyed out, for an Avatar the user hasn't unlocked.
  silhouette?: boolean;
  // Whether the browser should fetch the portrait now: the header's is on every page's first
  // paint, so it loads eagerly; a picker's grid lazily.
  loading?: "eager" | "lazy";
  className?: string;
}

// Each accent's medallion ring, spelled out so Tailwind sees every class.
const ACCENT_RING: Readonly<Record<AvatarAccent, string>> = {
  cyan: "border-cyan",
  blue: "border-blue",
  violet: "border-violet",
  magenta: "border-magenta",
  amber: "border-amber",
  green: "border-green",
};

// A locked portrait: no colour and most of its light, so it reads as out of reach in any Skin.
const SILHOUETTE_FILTER = "grayscale(1) brightness(0.35)";

export function Avatar({
  art,
  size = 32,
  silhouette = false,
  loading = "lazy",
  className,
}: AvatarProps): React.JSX.Element {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={cn(
        "flex shrink-0 overflow-hidden rounded-full border-2 bg-elevated",
        silhouette ? "border-border" : ACCENT_RING[art.accent],
        className,
      )}
    >
      <img
        src={art.src}
        alt=""
        width={size}
        height={size}
        loading={loading}
        decoding="async"
        className="h-full w-full object-cover"
        style={silhouette ? { filter: SILHOUETTE_FILTER } : undefined}
      />
    </span>
  );
}
