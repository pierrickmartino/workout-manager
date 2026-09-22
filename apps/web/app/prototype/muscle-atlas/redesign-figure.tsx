// PROTOTYPE — throwaway. Renders the redesigned "Sasha-style" anatomical figure: contiguous
// muscle bellies that tile the body, each with faint fiber striations, heat-shaded from the mock
// coverage. Same interaction contract as the shipped `AtlasFigure` (click / Enter / Space to
// select, hover/focus to preview), so it can drop into the same variants.

import { useMemo, useState, type CSSProperties, type KeyboardEvent } from "react";

import type { MuscleRegion } from "@/lib/muscle-region-atlas-view";
import { VIEW_BOX, silhouetteModel, type Figure, type View } from "@/lib/atlas/atlas-geometry";
import { groupColorVar } from "@/components/pulse/muscle-colors";
import { heatFillOpacity, HEAT_UNTRAINED_SELECTED_OPACITY } from "@/lib/atlas/muscle-heat";
import { cn } from "@/lib/utils";
import { renderRedesign, type RenderedRedesignMuscle } from "./redesign-spec";

// The body the muscles sit on. A hair darker than the shipped silhouette so the fuller muscle
// coverage still reads against it where a muscle is untrained.
const SILHOUETTE_STYLE: CSSProperties = {
  fill: "var(--color-elevated)",
  stroke: "var(--color-border-lite)",
  strokeWidth: 1,
};

function bellyStyle(
  region: MuscleRegion | undefined,
  color: string,
  isSelected: boolean,
  isActive: boolean,
): CSSProperties {
  const trained = region?.covered ?? false;
  if (!trained) {
    return {
      fill: color,
      fillOpacity: isSelected ? HEAT_UNTRAINED_SELECTED_OPACITY : 0.05,
      stroke: isSelected ? "var(--color-text-primary)" : "var(--color-border-lite)",
      strokeWidth: isSelected ? 1.4 : 0.8,
    };
  }
  return {
    fill: color,
    fillOpacity: heatFillOpacity(region?.intensity ?? 0, { selected: isSelected, active: isActive }),
    stroke: isSelected || isActive ? "var(--color-text-primary)" : color,
    strokeWidth: isSelected ? 1.4 : 1,
  };
}

interface RedesignFigureProps {
  figure: Figure;
  view: View;
  regionsByMuscle: Map<string, MuscleRegion>;
  selectedMuscle: string | null;
  onSelectMuscle: (muscle: string) => void;
  maxWidth?: number;
}

export function RedesignFigure({
  figure,
  view,
  regionsByMuscle,
  selectedMuscle,
  onSelectMuscle,
  maxWidth = 240,
}: RedesignFigureProps) {
  const silhouette = useMemo(() => silhouetteModel(figure), [figure]);
  const muscles = useMemo(() => renderRedesign(figure, view), [figure, view]);
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
      viewBox={VIEW_BOX}
      className="h-auto w-full overflow-visible"
      style={{ maxWidth }}
      role="group"
    >
      <g aria-hidden>
        <circle
          cx={silhouette.head.cx}
          cy={silhouette.head.cy}
          r={silhouette.head.r}
          style={SILHOUETTE_STYLE}
        />
        {silhouette.parts.map((d, index) => (
          <path key={index} d={d} style={SILHOUETTE_STYLE} />
        ))}
      </g>
      {muscles.map((muscle: RenderedRedesignMuscle) => {
        const region = regionsByMuscle.get(muscle.id);
        const isSelected = selectedMuscle === muscle.id;
        const isActive = active === muscle.id;
        const color = groupColorVar(muscle.group);
        const style = bellyStyle(region, color, isSelected, isActive);
        // Fibers read as definition on a filled muscle; brighter when the muscle is live.
        const fiberOpacity = region?.covered
          ? isSelected || isActive
            ? 0.55
            : 0.32
          : 0.12;
        return (
          <g
            key={muscle.id}
            role="button"
            tabIndex={0}
            aria-label={region?.ariaLabel ?? muscle.id}
            aria-pressed={isSelected}
            className="cursor-pointer outline-none"
            onClick={() => onSelectMuscle(muscle.id)}
            onKeyDown={(event) => onKeyDown(event, muscle.id)}
            onFocus={() => setActive(muscle.id)}
            onBlur={() => clearActive(muscle.id)}
            onPointerEnter={(event) => {
              if (event.pointerType !== "touch") setActive(muscle.id);
            }}
            onPointerLeave={() => clearActive(muscle.id)}
          >
            {muscle.occurrences.map((occ, index) => (
              <g key={index}>
                <path
                  d={occ.d}
                  style={style}
                  className="transition-[fill-opacity,stroke,stroke-width] duration-150 motion-reduce:transition-none"
                />
                {occ.fibers.map((fiber, fiberIndex) => (
                  <path
                    key={fiberIndex}
                    d={fiber}
                    fill="none"
                    stroke={color}
                    strokeWidth={0.7}
                    strokeLinecap="round"
                    style={{ opacity: fiberOpacity }}
                    className={cn(
                      "transition-opacity duration-150 motion-reduce:transition-none",
                    )}
                  />
                ))}
              </g>
            ))}
          </g>
        );
      })}
    </svg>
  );
}
