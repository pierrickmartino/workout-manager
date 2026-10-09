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

// Stroke widths in viewbox units: about 1px at the 40px list size.
const OUTLINE_WIDTH = 2.5;
const SEGMENT_WIDTH = 3;

const INK_CLASS: Readonly<Record<StampAccent, string>> = {
  cyan: "fill-cyan stroke-cyan",
  violet: "fill-violet stroke-violet",
};
const OUTLINE_CLASS = "fill-none stroke-text-muted";
// Rings and segments on filled ink are knocked out of it in the surface colour.
const KNOCKOUT_CLASS = "fill-none stroke-surface";

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
  const { silhouette, rings, segments, accent, filled } = computeStampGeometry(design, state);
  const center = STAMP_VIEWBOX / 2;
  const shapeClass = filled ? INK_CLASS[accent] : OUTLINE_CLASS;
  const lineClass = filled ? KNOCKOUT_CLASS : OUTLINE_CLASS;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${STAMP_VIEWBOX} ${STAMP_VIEWBOX}`}
      aria-hidden
      focusable="false"
      className={cn("shrink-0", className)}
    >
      {silhouette.kind === "circle" ? (
        <circle
          cx={center}
          cy={center}
          r={silhouette.radius}
          strokeWidth={OUTLINE_WIDTH}
          className={shapeClass}
        />
      ) : (
        <polygon
          points={pointList(silhouette.points)}
          strokeWidth={OUTLINE_WIDTH}
          strokeLinejoin="round"
          className={shapeClass}
        />
      )}
      {rings.map((radius) => (
        <circle
          key={radius}
          cx={center}
          cy={center}
          r={radius}
          strokeWidth={OUTLINE_WIDTH}
          className={lineClass}
        />
      ))}
      {segments.map((segment, index) => (
        <line
          key={index}
          x1={segment.from.x}
          y1={segment.from.y}
          x2={segment.to.x}
          y2={segment.to.y}
          strokeWidth={SEGMENT_WIDTH}
          strokeLinecap="round"
          className={lineClass}
        />
      ))}
    </svg>
  );
}
