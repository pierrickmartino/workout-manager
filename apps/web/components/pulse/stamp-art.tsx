import * as React from "react";

import { cn } from "@/lib/utils";
import {
  computeStampGeometry,
  stampDesign,
  STAMP_VIEWBOX,
  type StampAccent,
  type StampPoint,
  type StampState,
} from "@/lib/stamp-art";

// A Stamp's generated geometric illustration (#654), drawn by `computeStampGeometry`: the
// silhouette names the family, the rings or segments the tier. An earned Stamp is filled ink
// with its rings knocked out in the surface colour; the next milestone is a muted outline.
// Every colour is an opaque Skin token the Contrast Floor already measures (ADR-0081).
// Decorative (`aria-hidden`): the title, status and date beside it carry the meaning. No
// animation and no hooks, so it is safe in Server Components.

interface StampArtProps {
  achievementId: string;
  state: StampState;
  // Rendered size in px (square).
  size?: number;
  className?: string;
}

const FILL_CLASS: Readonly<Record<StampAccent, string>> = {
  cyan: "fill-cyan stroke-cyan",
  violet: "fill-violet stroke-violet",
  muted: "fill-none stroke-text-muted",
};

// What the rings and segments are drawn in: knocked out of the ink, or the outline's own grey.
const LINE_CLASS: Readonly<Record<StampAccent, string>> = {
  cyan: "fill-none stroke-surface",
  violet: "fill-none stroke-surface",
  muted: "fill-none stroke-text-muted",
};

function pointList(points: readonly StampPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

export function StampArt({
  achievementId,
  state,
  size = 40,
  className,
}: StampArtProps): React.JSX.Element | null {
  const design = stampDesign(achievementId);
  if (design === null) {
    return null;
  }
  const { silhouette, rings, segments, accent } = computeStampGeometry(design, state);
  const center = STAMP_VIEWBOX / 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${STAMP_VIEWBOX} ${STAMP_VIEWBOX}`}
      aria-hidden
      focusable="false"
      className={cn("shrink-0", className)}
    >
      {silhouette.points.length === 0 ? (
        <circle
          cx={center}
          cy={center}
          r={silhouette.radius}
          strokeWidth={2.5}
          className={FILL_CLASS[accent]}
        />
      ) : (
        <polygon
          points={pointList(silhouette.points)}
          strokeWidth={2.5}
          strokeLinejoin="round"
          className={FILL_CLASS[accent]}
        />
      )}
      {rings.map((radius) => (
        <circle
          key={radius}
          cx={center}
          cy={center}
          r={radius}
          strokeWidth={2.5}
          className={LINE_CLASS[accent]}
        />
      ))}
      {segments.map((segment, index) => (
        <line
          key={index}
          x1={segment.from.x}
          y1={segment.from.y}
          x2={segment.to.x}
          y2={segment.to.y}
          strokeWidth={3}
          strokeLinecap="round"
          className={LINE_CLASS[accent]}
        />
      ))}
    </svg>
  );
}
