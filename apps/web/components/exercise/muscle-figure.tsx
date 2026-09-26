import type { CSSProperties } from "react";

import type { View } from "@/lib/atlas/atlas-geometry";
import type { MuscleHighlight } from "@/lib/atlas/exercise-highlight";
import { groupColorVar } from "@/components/pulse/muscle-colors";
import {
  REFERENCE_PATHS,
  REFERENCE_VIEWBOX,
  type ReferencePath,
} from "@/lib/atlas/reference/reference-data";
import { musclesShownIn } from "@/lib/atlas/reference/reference-muscle-map";

// The single-exercise Muscle Atlas figure on Exercise Detail (issue #544): one body view with the
// muscles this exercise trains lit — primary hot, secondary a lighter warm — over the same
// reference artwork the Stats atlas draws (used with the author's permission, see
// lib/atlas/reference/NOTICE.md). Unlike the Stats atlas it is **not** interactive and carries no
// windowed heat: exercise pages aren't user-body-specific, so it draws one fixed figure and a
// fixed two-level emphasis. It is **decorative** (`aria-hidden`) — the muscles are named in the
// text beside it, so nothing rides on the illustration or color, and there is no motion to honour
// under `prefers-reduced-motion`.
//
// The artwork is coarser than our 40-muscle vocabulary, so a muscle with no shape of its own is
// lit on its nearest neighbour (`REFERENCE_REGION_MUSCLES`) rather than going dark. That
// approximation is exactly why this figure stays decorative and the text list stays authoritative.

// The exercise page is not user-body-specific, so it draws the male figure as the generic
// anatomical chart — the same one the atlas falls back to when a Profile has no gender.
const GENERIC_GENDER = "male" as const;

// An unworked muscle: neutral flesh, so the body reads as a whole figure without competing with a
// lit muscle for the eye (descriptive, never an alarm).
const UNLIT_STYLE: CSSProperties = {
  fill: "var(--color-border-lite)",
  fillOpacity: 0.9,
  stroke: "var(--color-border)",
  strokeWidth: 0.5,
};

// A worked muscle fills with its Muscle Group hue at the emphasis opacity from the view-model, so
// a prime mover reads hotter than an assistor.
function litStyle(highlight: MuscleHighlight): CSSProperties {
  const color = groupColorVar(highlight.group);
  return { fill: color, fillOpacity: highlight.opacity, stroke: color, strokeWidth: 0.6 };
}

// The strongest highlight among the muscles drawn in one region: a region lights as `primary` if
// any of its muscles is a prime mover, else `secondary` if any assists, else stays unlit. So a
// region shared by several muscles never under-reads the exercise's emphasis.
function strongestHighlight(
  region: string,
  byMuscle: Map<string, MuscleHighlight>,
): MuscleHighlight | undefined {
  let best: MuscleHighlight | undefined;
  for (const muscle of musclesShownIn(region)) {
    const highlight = byMuscle.get(muscle);
    if (!highlight) continue;
    if (highlight.emphasis === "primary") return highlight;
    best ??= highlight;
  }
  return best;
}

// Collapse a half's flat path list into one entry per source region, preserving order.
function groupPaths(paths: ReferencePath[]): { region: string; paths: ReferencePath[] }[] {
  const order: string[] = [];
  const byRegion = new Map<string, ReferencePath[]>();
  for (const path of paths) {
    if (!byRegion.has(path.muscle)) {
      byRegion.set(path.muscle, []);
      order.push(path.muscle);
    }
    byRegion.get(path.muscle)!.push(path);
  }
  return order.map((region) => ({ region, paths: byRegion.get(region)! }));
}

interface ExerciseMuscleFigureProps {
  view: View;
  byMuscle: Map<string, MuscleHighlight>;
}

// One body view (front or back) of the figure with the exercise's trained muscles lit.
export function ExerciseMuscleFigure({ view, byMuscle }: ExerciseMuscleFigureProps) {
  const groups = groupPaths(REFERENCE_PATHS[GENERIC_GENDER][view]);
  return (
    <svg
      viewBox={REFERENCE_VIEWBOX[GENERIC_GENDER][view]}
      // No `overflow-visible`: each half is cropped by its own viewBox, as the source artwork's
      // nested <svg overflow="hidden"> does — otherwise the other half's figure is drawn too.
      className="h-auto w-full max-w-[180px]"
      role="presentation"
      aria-hidden
    >
      {groups.map(({ region, paths }) => {
        const highlight = strongestHighlight(region, byMuscle);
        const style = highlight ? litStyle(highlight) : UNLIT_STYLE;
        return (
          <g key={region}>
            {paths.map((path, index) => (
              <path key={index} d={path.d} fillRule="evenodd" clipRule="evenodd" style={style} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}
