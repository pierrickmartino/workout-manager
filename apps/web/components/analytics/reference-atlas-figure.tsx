import { useMemo, useState, type CSSProperties, type KeyboardEvent } from "react";

import type { MuscleRegion } from "@/lib/muscle-region-atlas-view";
import type { Figure } from "@/lib/atlas/atlas-geometry";
import { groupColorVar } from "@/components/pulse/muscle-colors";
import { heatFillOpacity, HEAT_UNTRAINED_SELECTED_OPACITY } from "@/lib/atlas/muscle-heat";
import {
  REFERENCE_PATHS,
  REFERENCE_VIEWBOX,
  type ReferenceGender,
  type ReferenceHalf,
  type ReferencePath,
} from "@/lib/atlas/reference/reference-data";
import { canonicalMuscleFor } from "@/lib/atlas/reference/reference-muscle-map";
import { cn } from "@/lib/utils";

// The reference Muscle Atlas figure (Olkre/Sasha-s-Body-Map, used with the author's permission —
// see lib/atlas/reference/NOTICE.md). Renders one half (front | back) of the artwork for the
// chosen gender, recolored by our coverage: every muscle is drawn as a neutral flesh base so the
// body always reads as anatomy, with a heat overlay in the group hue for a trained muscle. The
// reference's coarse regions map to our canonical Muscle vocabulary (reference-muscle-map), so a
// tap opens the same drawer and the same aria-label as the rest of the atlas. Descriptive only
// (ADR-0025): an untrained muscle stays neutral grey, never a colored nudge.

const BASE_STYLE: CSSProperties = {
  fill: "var(--color-border-lite)",
  fillOpacity: 0.9,
  stroke: "var(--color-border)",
  strokeWidth: 0.5,
};

function overlayStyle(
  region: MuscleRegion | undefined,
  color: string,
  isSelected: boolean,
  isActive: boolean,
): CSSProperties {
  const trained = region?.covered ?? false;
  const fillOpacity = trained
    ? heatFillOpacity(region?.intensity ?? 0, { selected: isSelected, active: isActive })
    : isSelected
      ? HEAT_UNTRAINED_SELECTED_OPACITY
      : 0;
  return {
    fill: color,
    fillOpacity,
    stroke: isSelected || isActive ? "var(--color-text-primary)" : "transparent",
    strokeWidth: isSelected ? 1.4 : isActive ? 1 : 0,
  };
}

interface MuscleGroupPaths {
  key: string;
  canonical: string | null;
  paths: ReferencePath[];
}

// Collapse the flat path list for a half into one entry per source region (preserving order), so a
// whole muscle highlights and selects together.
function groupPaths(paths: ReferencePath[]): MuscleGroupPaths[] {
  const order: string[] = [];
  const byMuscle = new Map<string, ReferencePath[]>();
  for (const path of paths) {
    if (!byMuscle.has(path.muscle)) {
      byMuscle.set(path.muscle, []);
      order.push(path.muscle);
    }
    byMuscle.get(path.muscle)!.push(path);
  }
  return order.map((muscle) => ({
    key: muscle,
    canonical: canonicalMuscleFor(muscle),
    paths: byMuscle.get(muscle)!,
  }));
}

function genderOf(figure: Figure): ReferenceGender {
  return figure === "female" ? "female" : "male";
}

interface ReferenceAtlasFigureProps {
  figure: Figure;
  half: ReferenceHalf;
  regionsByMuscle: Map<string, MuscleRegion>;
  selectedMuscle: string | null;
  onSelectMuscle: (muscle: string) => void;
  interactive?: boolean;
}

export function ReferenceAtlasFigure({
  figure,
  half,
  regionsByMuscle,
  selectedMuscle,
  onSelectMuscle,
  interactive = true,
}: ReferenceAtlasFigureProps) {
  const gender = genderOf(figure);
  const groups = useMemo(() => groupPaths(REFERENCE_PATHS[gender][half]), [gender, half]);
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
      viewBox={REFERENCE_VIEWBOX[gender][half]}
      // No `overflow-visible` here: each half is cropped by its own viewBox, exactly as the source
      // artwork's nested <svg overflow="hidden"> does. Letting it overflow drew the neighbouring
      // half's figure on top of this one (the "doubled body" bug).
      className="h-auto w-full max-w-[220px]"
      role="group"
    >
      {groups.map((group) => {
        if (!group.canonical) {
          return (
            <g key={group.key} aria-hidden>
              {group.paths.map((p, i) => (
                <path key={i} d={p.d} fillRule="evenodd" clipRule="evenodd" style={BASE_STYLE} />
              ))}
            </g>
          );
        }
        const region = regionsByMuscle.get(group.canonical);
        const isSelected = selectedMuscle === group.canonical;
        const isActive = active === group.canonical;
        const color = groupColorVar(region?.group ?? "");
        const overlay = overlayStyle(region, color, isSelected, isActive);
        const canonical = group.canonical;
        return (
          <g
            key={group.key}
            role={interactive ? "button" : undefined}
            tabIndex={interactive ? 0 : undefined}
            aria-label={region?.ariaLabel ?? canonical}
            aria-pressed={interactive ? isSelected : undefined}
            className={cn(interactive && "cursor-pointer outline-none")}
            onClick={interactive ? () => onSelectMuscle(canonical) : undefined}
            onKeyDown={interactive ? (event) => onKeyDown(event, canonical) : undefined}
            onFocus={interactive ? () => setActive(canonical) : undefined}
            onBlur={interactive ? () => clearActive(canonical) : undefined}
            onPointerEnter={(event) => {
              if (interactive && event.pointerType !== "touch") setActive(canonical);
            }}
            onPointerLeave={() => clearActive(canonical)}
          >
            {group.paths.map((p, i) => (
              <g key={i}>
                <path d={p.d} fillRule="evenodd" clipRule="evenodd" style={BASE_STYLE} />
                <path
                  d={p.d}
                  fillRule="evenodd"
                  clipRule="evenodd"
                  style={overlay}
                  className="transition-[fill-opacity,stroke,stroke-width] duration-150 motion-reduce:transition-none"
                />
              </g>
            ))}
          </g>
        );
      })}
    </svg>
  );
}
