// PROTOTYPE — throwaway. Renders one half (front | back) of the detailed anatomical body map
// derived from Sasha's Body Map, recolored by our coverage: every muscle is a group of paths that
// together form the grey body; a trained muscle is tinted with its group hue at the heat opacity,
// an untrained one stays neutral grey (so the body reads as anatomy, never as an alarm). Same
// interaction contract as the shipped AtlasFigure. See NOTICE.md — derived artwork, prototype only.

import { useMemo, useState, type KeyboardEvent } from "react";

import type { MuscleRegion } from "@/lib/muscle-region-atlas-view";
import { groupColorVar } from "@/components/pulse/muscle-colors";
import { heatFillOpacity, HEAT_UNTRAINED_SELECTED_OPACITY } from "@/lib/atlas/muscle-heat";
import { SASHA_PATHS, SASHA_VIEWBOX, type SashaPath } from "./sasha-figure-data";

type Half = "front" | "back";

// Sasha's coarse muscle labels → our canonical Muscle ids (the coverage/heat + group-color key).
// A few Sasha muscles collapse onto one canonical muscle (upper/lower chest → Pectoralis Major;
// the three delt heads → Deltoids); `head` maps to nothing and always stays neutral.
const MUSCLE_MAP: Record<string, string | null> = {
  "upper-chest": "Pectoralis Major",
  "lower-chest": "Pectoralis Major",
  abs: "Rectus Abdominis",
  obliques: "Obliques",
  "front-delts": "Deltoids",
  "side-delts": "Deltoids",
  "rear-delts": "Deltoids",
  biceps: "Biceps Brachii",
  triceps: "Triceps Brachii",
  forearms: "Forearms",
  quads: "Quadriceps",
  hamstrings: "Hamstrings",
  calves: "Gastrocnemius",
  glutes: "Gluteus Maximus",
  lats: "Latissimus Dorsi",
  traps: "Trapezius",
  "lower-back": "Erector Spinae",
  head: null,
};

// The neutral "flesh" grey the untrained body is drawn in — a real fill (not a faint wash), so
// the anatomy reads at a glance the way the reference does.
const NEUTRAL_FILL = "var(--color-border-lite)";

interface MuscleGroupPaths {
  key: string;
  canonical: string | null;
  paths: SashaPath[];
}

// Collapse the flat path list for a half into one entry per Sasha muscle, preserving order, so a
// whole muscle highlights/selects together.
function groupPaths(half: Half): MuscleGroupPaths[] {
  const order: string[] = [];
  const byMuscle = new Map<string, SashaPath[]>();
  for (const path of SASHA_PATHS[half]) {
    if (!byMuscle.has(path.muscle)) {
      byMuscle.set(path.muscle, []);
      order.push(path.muscle);
    }
    byMuscle.get(path.muscle)!.push(path);
  }
  return order.map((muscle) => ({
    key: muscle,
    canonical: MUSCLE_MAP[muscle] ?? null,
    paths: byMuscle.get(muscle)!,
  }));
}

interface SashaFigureProps {
  half: Half;
  regionsByMuscle: Map<string, MuscleRegion>;
  selectedMuscle: string | null;
  onSelectMuscle: (muscle: string) => void;
  maxWidth?: number;
}

export function SashaFigure({
  half,
  regionsByMuscle,
  selectedMuscle,
  onSelectMuscle,
  maxWidth = 220,
}: SashaFigureProps) {
  const groups = useMemo(() => groupPaths(half), [half]);
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
      viewBox={SASHA_VIEWBOX[half]}
      className="h-auto w-full overflow-visible"
      style={{ maxWidth }}
      role="group"
    >
      {groups.map((group) => {
        // The head (and any unmapped shape) is decorative body, not an addressable muscle.
        if (!group.canonical) {
          return (
            <g key={group.key} aria-hidden>
              {group.paths.map((p, i) => (
                <path key={i} d={p.d} fillRule="evenodd" clipRule="evenodd" fill={NEUTRAL_FILL} />
              ))}
            </g>
          );
        }
        const region = regionsByMuscle.get(group.canonical);
        const isSelected = selectedMuscle === group.canonical;
        const isActive = active === group.canonical;
        const trained = region?.covered ?? false;
        const color = groupColorVar(region?.group ?? "");
        const overlayOpacity = trained
          ? heatFillOpacity(region?.intensity ?? 0, { selected: isSelected, active: isActive })
          : isSelected
            ? HEAT_UNTRAINED_SELECTED_OPACITY
            : 0;
        return (
          <g
            key={group.key}
            role="button"
            tabIndex={0}
            aria-label={region?.ariaLabel ?? group.canonical}
            aria-pressed={isSelected}
            className="cursor-pointer outline-none"
            onClick={() => onSelectMuscle(group.canonical!)}
            onKeyDown={(event) => onKeyDown(event, group.canonical!)}
            onFocus={() => setActive(group.canonical)}
            onBlur={() => clearActive(group.canonical!)}
            onPointerEnter={(event) => {
              if (event.pointerType !== "touch") setActive(group.canonical);
            }}
            onPointerLeave={() => clearActive(group.canonical!)}
          >
            {group.paths.map((p, i) => (
              <g key={i}>
                {/* Neutral base: the muscle as part of the grey body. */}
                <path d={p.d} fillRule="evenodd" clipRule="evenodd" fill={NEUTRAL_FILL} />
                {/* Heat overlay: the group hue at the coverage opacity, tinting the base. */}
                <path
                  d={p.d}
                  fillRule="evenodd"
                  clipRule="evenodd"
                  fill={color}
                  fillOpacity={overlayOpacity}
                  className="transition-[fill-opacity] duration-150 motion-reduce:transition-none"
                />
              </g>
            ))}
          </g>
        );
      })}
    </svg>
  );
}
