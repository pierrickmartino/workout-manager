import { ViewTransition } from "react";

import { cn } from "@/lib/utils";
import {
  computeSigilGeometry,
  sigilTransitionName,
  SIGIL_VIEWBOX,
} from "@/lib/workout-sigil";
import {
  accentTint,
  trainingTypeAccentVar,
} from "@/lib/training-type-accent";

// The Workout Signature mark (GLOSSARY: Workout Signature): a Session's recognizable, generated
// geometric sigil — a faint base polygon plus a constellation of nodes — framed in a small
// medallion. Deterministic in the Session id, so the same Session shows the same mark on every
// surface (Home hero, My Sessions, Train, Session detail) and two Sessions read as two marks.
// The fill hue is the Skin-aware Training Type accent, always shown alongside the type label
// (colour is never the sole carrier). No hooks / no I/O — safe in Server Components.

interface WorkoutSigilProps {
  // The Session's stable identity — the sole seed, so the mark is identical across surfaces.
  seedId: number | string;
  // The Session's Exercise count — drives the node count (clamped for legibility).
  exerciseCount: number;
  // The Session's Training Type — selects the Skin-aware accent hue.
  trainingType: string;
  // Rendered medallion size in px (square). Defaults to a list-row size.
  size?: number;
  className?: string;
  // The Session whose mark this is, when this surface claims the cross-page morph (ADR-0120).
  // Left unset where the same Session could render twice on one page, or where the seed is not
  // a Session id (the Home hero's Protocol fallback): two claims of one name break the morph.
  morphSessionId?: number;
}

export function WorkoutSigil({
  seedId,
  exerciseCount,
  trainingType,
  size = 46,
  className,
  morphSessionId,
}: WorkoutSigilProps): React.JSX.Element {
  const accentVar = trainingTypeAccentVar(trainingType);
  const accent = `var(${accentVar})`;
  const { rotation, polygon, nodes, center } = computeSigilGeometry(
    seedId,
    exerciseCount,
  );
  const glyph = Math.round(size * 0.86);
  const polygonPoints = polygon.map((point) => `${point.x},${point.y}`).join(" ");
  const nodePath = nodes.map((node) => `${node.x},${node.y}`).join(" ");

  const medallion = (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md border",
        className,
      )}
      style={{
        width: size,
        height: size,
        borderColor: accentTint(accentVar, 0.3),
        backgroundColor: accentTint(accentVar, 0.05),
      }}
    >
      <svg
        width={glyph}
        height={glyph}
        viewBox={`0 0 ${SIGIL_VIEWBOX} ${SIGIL_VIEWBOX}`}
        role="img"
        aria-label={`${trainingType} workout mark`}
      >
        <g transform={`rotate(${rotation} ${center.x} ${center.y})`}>
          <polygon
            points={polygonPoints}
            fill={accentTint(accentVar, 0.08)}
            stroke={accentTint(accentVar, 0.35)}
            strokeWidth={1}
          />
          {nodes.length > 1 ? (
            <polyline
              points={nodePath}
              fill="none"
              stroke={accentTint(accentVar, 0.5)}
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
          ) : null}
          {nodes.map((node, index) => (
            <circle key={index} cx={node.x} cy={node.y} r={node.r} fill={accent} />
          ))}
          <circle
            cx={center.x}
            cy={center.y}
            r={2}
            fill={accentTint(accentVar, 0.6)}
          />
        </g>
      </svg>
    </span>
  );

  if (morphSessionId === undefined) return medallion;
  // Off by default, so a revalidation or a list filter never animates the mark; it moves only
  // when the same Session's sigil unmounts on one page and mounts on the next.
  return (
    <ViewTransition name={sigilTransitionName(morphSessionId)} share="sigil-morph" default="none">
      {medallion}
    </ViewTransition>
  );
}
