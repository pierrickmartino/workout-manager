import type { CSSProperties } from "react";

import { toFigureRender, type RenderedMuscle } from "@/lib/atlas/atlas-render";
import type { View } from "@/lib/atlas/atlas-geometry";
import type { MuscleHighlight } from "@/lib/atlas/exercise-highlight";
import { groupColorVar } from "@/components/pulse/muscle-colors";

// The single-exercise Muscle Atlas figure on Exercise Detail (issue #544): one neutral body view
// with the muscles this exercise trains lit — primary hot, secondary a lighter warm — over the
// same original artwork the Stats atlas draws (issue #542). Unlike the Stats atlas it is **not**
// interactive and carries no windowed heat: exercise pages aren't user-body-specific, so the
// figure is the neutral/androgynous one and the highlight is a fixed two-level emphasis. It is
// **decorative** (`aria-hidden`) — the muscles are named in the text beside it, so nothing rides
// on the illustration or color, and there is no motion to honour under `prefers-reduced-motion`.

// The decorative silhouette behind the muscles: neutral surface tokens, never a muscle color, so
// it reads as the body the muscles sit on (matching the Stats atlas figure).
const SILHOUETTE_STYLE: CSSProperties = {
  fill: "var(--color-elevated)",
  stroke: "var(--color-border-lite)",
  strokeWidth: 1,
};

// An untrained muscle: a faint dashed neutral outline with no fill — present so the body reads as
// whole, but never competing with a lit muscle for the eye (descriptive, never an alarm).
const UNLIT_STYLE: CSSProperties = {
  fill: "none",
  stroke: "var(--color-border-lite)",
  strokeWidth: 0.75,
  strokeDasharray: "3 3",
};

// A trained muscle fills with its Muscle Group hue at the emphasis opacity from the view-model, so
// a prime mover reads hotter than an assistor. The stroke takes the same hue so the region reads
// as a solid shape rather than a floating wash.
function litStyle(highlight: MuscleHighlight): CSSProperties {
  const color = groupColorVar(highlight.group);
  return { fill: color, fillOpacity: highlight.opacity, stroke: color, strokeWidth: 0.9 };
}

interface ExerciseMuscleFigureProps {
  view: View;
  byMuscle: Map<string, MuscleHighlight>;
}

// One body view (front or back) of the neutral figure with the exercise's trained muscles lit.
export function ExerciseMuscleFigure({ view, byMuscle }: ExerciseMuscleFigureProps) {
  const model = toFigureRender("neutral", view);
  return (
    <svg
      viewBox={model.viewBox}
      className="h-auto w-full max-w-[180px] overflow-visible"
      role="presentation"
      aria-hidden
    >
      <g>
        <circle
          cx={model.silhouette.head.cx}
          cy={model.silhouette.head.cy}
          r={model.silhouette.head.r}
          style={SILHOUETTE_STYLE}
        />
        {model.silhouette.parts.map((d, index) => (
          <path key={index} d={d} style={SILHOUETTE_STYLE} />
        ))}
      </g>
      {model.muscles.map((muscle: RenderedMuscle) => {
        const highlight = byMuscle.get(muscle.id);
        const style = highlight ? litStyle(highlight) : UNLIT_STYLE;
        return (
          <g key={muscle.id}>
            {muscle.occurrences.map((occ, index) => (
              <path key={index} d={occ.d} style={style} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}
