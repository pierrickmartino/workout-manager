import { useMemo, useState, type CSSProperties, type KeyboardEvent } from "react";

import type { MuscleRegion } from "@/lib/muscle-region-atlas-view";
import { toFigureRender, type RenderedMuscle } from "@/lib/atlas/atlas-render";
import { groupColorVar } from "@/components/pulse/muscle-colors";
import { HEAT_UNTRAINED_SELECTED_OPACITY, heatFillOpacity } from "@/lib/atlas/muscle-heat";
import type { Figure, View } from "@/lib/atlas/atlas-geometry";
import { cn } from "@/lib/utils";

// The decorative silhouette drawn behind the muscles: neutral surface tokens, never a muscle
// color, so it reads as the body the muscles sit on.
const SILHOUETTE_STYLE: CSSProperties = {
  fill: "var(--color-elevated)",
  stroke: "var(--color-border-lite)",
  strokeWidth: 1,
};

// The fill/stroke for one muscle path from its coverage region (issue #543, honouring
// ADR-0025). A trained muscle warms up with its group hue at an opacity scaled by the
// emphasis-weighted heat `intensity` (`muscle-heat`); an untrained one is a faint neutral outline
// (no fill) — descriptive, never an alarm. Selection brightens the muscle and takes a light
// stroke; a pointer hover or keyboard focus nudges it up a touch so the active muscle reads live.
function muscleStyle(
  region: MuscleRegion | undefined,
  color: string,
  isSelected: boolean,
  isActive: boolean,
): CSSProperties {
  const trained = region?.covered ?? false;
  if (!trained) {
    return {
      fill: color,
      fillOpacity: isSelected ? HEAT_UNTRAINED_SELECTED_OPACITY : 0,
      stroke: isSelected ? "var(--color-text-primary)" : "var(--color-border-lite)",
      strokeWidth: isSelected ? 1.5 : 0.75,
      strokeDasharray: "3 3",
    };
  }
  return {
    fill: color,
    fillOpacity: heatFillOpacity(region?.intensity ?? 0, { selected: isSelected, active: isActive }),
    stroke: isSelected || isActive ? "var(--color-text-primary)" : color,
    strokeWidth: isSelected ? 1.5 : 0.9,
  };
}

interface AtlasFigureProps {
  figure: Figure;
  view: View;
  regionsByMuscle: Map<string, MuscleRegion>;
  selectedMuscle: string | null;
  onSelectMuscle: (muscle: string) => void;
  interactive?: boolean;
}

// One accessible, interactive body view of the anatomical atlas (issue #543). The silhouette is
// drawn behind (decorative, `aria-hidden`); each canonical Muscle is a `role="button"` group
// carrying its warped path(s) and a composed `aria-label` from the view-model (so state + volume
// never ride on color), clickable and keyboard-activatable, so the map is fully operable without
// a pointer. A subtle hover highlight is applied on fine-pointer devices only; the fill
// transition is disabled under `prefers-reduced-motion` and there is no breathing/ripple motion.
export function AtlasFigure({
  figure,
  view,
  regionsByMuscle,
  selectedMuscle,
  onSelectMuscle,
  interactive = true,
}: AtlasFigureProps) {
  const model = useMemo(() => toFigureRender(figure, view), [figure, view]);
  // The muscle currently under a fine pointer or holding keyboard focus. Both drive the same
  // subtle highlight, so a muscle reads as live whether reached by mouse or by Tab — an SVG
  // `<g>` renders no outline ring, so focus is shown by the highlight, not a browser ring.
  const [active, setActive] = useState<string | null>(null);

  function clearActive(muscle: string) {
    setActive((current) => (current === muscle ? null : current));
  }

  function onKeyDown(event: KeyboardEvent<SVGGElement>, muscle: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectMuscle(muscle);
    }
  }

  return (
    <svg
      viewBox={model.viewBox}
      className="h-auto w-full max-w-[220px] overflow-visible"
      role="group"
    >
      <g aria-hidden>
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
        const region = regionsByMuscle.get(muscle.id);
        const isSelected = selectedMuscle === muscle.id;
        const color = groupColorVar(muscle.group);
        const style = muscleStyle(region, color, isSelected, active === muscle.id);
        return (
          <g
            key={muscle.id}
            role={interactive ? "button" : undefined}
            tabIndex={interactive ? 0 : undefined}
            aria-label={region?.ariaLabel ?? muscle.id}
            aria-pressed={interactive ? isSelected : undefined}
            className={cn(interactive && "cursor-pointer outline-none")}
            onClick={interactive ? () => onSelectMuscle(muscle.id) : undefined}
            onKeyDown={interactive ? (event) => onKeyDown(event, muscle.id) : undefined}
            onFocus={interactive ? () => setActive(muscle.id) : undefined}
            onBlur={interactive ? () => clearActive(muscle.id) : undefined}
            onPointerEnter={(event) => {
              if (interactive && event.pointerType !== "touch") setActive(muscle.id);
            }}
            onPointerLeave={() => clearActive(muscle.id)}
          >
            {muscle.occurrences.map((occ, index) => (
              <path
                key={index}
                d={occ.d}
                style={style}
                className="transition-[fill-opacity,stroke,stroke-width] duration-150 motion-reduce:transition-none"
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}
