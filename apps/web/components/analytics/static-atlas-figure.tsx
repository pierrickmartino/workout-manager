import type { CSSProperties, ReactNode } from "react";

import type { MuscleRegion } from "@/lib/muscle-region-atlas-view";
import type { Figure } from "@/lib/atlas/atlas-geometry";
import { groupColorVar } from "@/components/pulse/muscle-colors";
import { heatFillOpacity, HEAT_UNTRAINED_SELECTED_OPACITY } from "@/lib/atlas/muscle-heat";
import {
  REFERENCE_PATHS,
  REFERENCE_VIEWBOX,
  type ReferenceHalf,
  type ReferencePath,
} from "@/lib/atlas/reference/reference-data";
import { canonicalMuscleFor } from "@/lib/atlas/reference/reference-muscle-map";

// The reference Muscle Atlas figure (Olkre/Sasha-s-Body-Map, used with the author's permission —
// see lib/atlas/reference/NOTICE.md), read-only. Renders one half (front | back) of the artwork
// for the chosen gender, recolored by our coverage: every muscle is drawn as a neutral flesh base
// so the body always reads as anatomy, with a heat overlay in the group hue for a trained muscle.
// Descriptive only (ADR-0025): an untrained muscle stays neutral grey, never a colored nudge.
//
// It takes no handlers and no selection and uses no hooks, so a Server Component can render it
// (audit C-4). The empty-state atlas renders this; the atlas around it is still a client
// component, so moving it server-side is the web audit's V-3. The interactive figure
// (`reference-atlas-figure`) builds on the same parts and adds selection, hover and focus.

const BASE_STYLE: CSSProperties = {
  fill: "var(--color-border-lite)",
  fillOpacity: 0.9,
  stroke: "var(--color-border)",
  strokeWidth: 0.5,
};

export function overlayStyle(
  region: MuscleRegion | undefined,
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
    fill: groupColorVar(region?.group ?? ""),
    fillOpacity,
    stroke: isSelected || isActive ? "var(--color-text-primary)" : "transparent",
    strokeWidth: isSelected ? 1.4 : isActive ? 1 : 0,
  };
}

export interface MuscleGroupPaths {
  key: string;
  canonical: string | null;
  paths: ReferencePath[];
}

// Collapse the flat path list for a half into one entry per source region (preserving order), so
// a whole muscle highlights and selects together.
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

// The artwork for one half of one figure: its viewBox and its muscles, grouped.
export function atlasArtwork(
  figure: Figure,
  half: ReferenceHalf,
): { viewBox: string; groups: MuscleGroupPaths[] } {
  const gender = figure === "female" ? "female" : "male";
  return {
    viewBox: REFERENCE_VIEWBOX[gender][half],
    groups: groupPaths(REFERENCE_PATHS[gender][half]),
  };
}

export function AtlasSvg({ viewBox, children }: { viewBox: string; children: ReactNode }) {
  return (
    <svg
      viewBox={viewBox}
      // No `overflow-visible` here: each half is cropped by its own viewBox, exactly as the source
      // artwork's nested <svg overflow="hidden"> does. Letting it overflow drew the neighbouring
      // half's figure on top of this one (the "doubled body" bug).
      className="h-auto w-full max-w-[220px]"
      role="group"
    >
      {children}
    </svg>
  );
}

// A source region with no canonical Muscle: anatomy only, nothing to name or select.
export function AnatomyOnly({ group }: { group: MuscleGroupPaths }) {
  return (
    <g aria-hidden>
      {group.paths.map((p, i) => (
        <path key={i} d={p.d} fillRule="evenodd" clipRule="evenodd" style={BASE_STYLE} />
      ))}
    </g>
  );
}

// One shape of a muscle: the neutral anatomy base with the heat overlay above it. `children` is
// drawn on top (the interactive figure's focus ring).
export function MuscleShape({
  d,
  overlay,
  children,
}: {
  d: string;
  overlay: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <g>
      <path d={d} fillRule="evenodd" clipRule="evenodd" style={BASE_STYLE} />
      <path
        d={d}
        fillRule="evenodd"
        clipRule="evenodd"
        style={overlay}
        className="transition-[fill-opacity,stroke,stroke-width] duration-150 motion-reduce:transition-none"
      />
      {children}
    </g>
  );
}

interface StaticAtlasFigureProps {
  figure: Figure;
  half: ReferenceHalf;
  regionsByMuscle: Map<string, MuscleRegion>;
}

export function StaticAtlasFigure({ figure, half, regionsByMuscle }: StaticAtlasFigureProps) {
  const { viewBox, groups } = atlasArtwork(figure, half);
  return (
    <AtlasSvg viewBox={viewBox}>
      {groups.map((group) => {
        if (!group.canonical) return <AnatomyOnly key={group.key} group={group} />;
        const region = regionsByMuscle.get(group.canonical);
        const overlay = overlayStyle(region, false, false);
        return (
          <g key={group.key} aria-label={region?.ariaLabel ?? group.canonical}>
            {group.paths.map((p, i) => (
              <MuscleShape key={i} d={p.d} overlay={overlay} />
            ))}
          </g>
        );
      })}
    </AtlasSvg>
  );
}
