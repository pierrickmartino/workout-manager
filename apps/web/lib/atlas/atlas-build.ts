// Pure renderer for the Muscle Atlas assets (issue #542).
//
// One place turns the canonical spec (`muscle-figure-spec.ts`) plus the shared geometry
// (`atlas-geometry.ts`) into the two deliverables: the six SVG documents (three figures × front
// and back) and the manifest that maps every canonical `Muscle` id to the paths/side it occupies.
// The generator script persists what these functions return; the asset test rebuilds them and
// asserts the committed files match, so the artwork on disk can never silently diverge from its
// source of truth.

import {
  FIGURES,
  STYLE_BLOCK,
  VIEWS,
  VIEW_BOX,
  type Figure,
  type Point,
  type Side,
  type View,
  mirrorPoints,
  sideOf,
  silhouetteMarkup,
  smoothClosedPath,
  warpPoint,
} from "./atlas-geometry.ts";
import { MUSCLE_SPECS, type MuscleSpec } from "./muscle-figure-spec.ts";

// One drawable occurrence of a muscle: which view and side it sits on, its parent group, and the
// canonical (un-warped) points behind it. A bilateral muscle expands to two of these per view (a
// left and its mirrored right); a center muscle to one.
export interface MuscleOccurrence {
  id: string;
  group: string;
  view: View;
  side: Side;
  points: Point[];
}

// Expand one spec into its concrete occurrences: mirror each bilateral shape to the opposite side
// so the two halves come from a single authored source, and keep a center shape as drawn. Side is
// read off the canonical points, so it is identical across all three figures (the manifest records
// it once).
export function occurrencesOf(spec: MuscleSpec): MuscleOccurrence[] {
  const out: MuscleOccurrence[] = [];
  for (const shape of spec.shapes) {
    if (spec.symmetry === "center") {
      out.push({ id: spec.id, group: spec.group, view: shape.view, side: "center", points: shape.points });
      continue;
    }
    const mirrored = mirrorPoints(shape.points);
    out.push({ id: spec.id, group: spec.group, view: shape.view, side: sideOf(shape.points), points: shape.points });
    out.push({ id: spec.id, group: spec.group, view: shape.view, side: sideOf(mirrored), points: mirrored });
  }
  return out;
}

// Every occurrence across all muscles, in canonical `MUSCLE_ORDER`, then by view then side — the
// deterministic order the SVGs and manifest are emitted in.
export function allOccurrences(): MuscleOccurrence[] {
  return MUSCLE_SPECS.flatMap(occurrencesOf);
}

function escapeAttr(value: string): string {
  // The ids are curated ASCII labels, but escape the two characters that could break an attribute
  // anyway — cheap insurance so a future rename can never produce malformed markup.
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

const FIGURE_LABEL: Record<Figure, string> = {
  neutral: "Neutral",
  male: "Male",
  female: "Female",
};

// Render one figure/view as a complete, standalone SVG document. The silhouette is drawn first
// (behind), then every muscle path for that view, each warped onto this figure and carrying its
// canonical `data-muscle-id` and `data-side`. Fills/strokes come only from the themeable classes
// in the embedded style block — no path carries a literal color.
export function buildFigureSvg(figure: Figure, view: View): string {
  const paths: string[] = [];
  for (const spec of MUSCLE_SPECS) {
    for (const occ of occurrencesOf(spec)) {
      if (occ.view !== view) continue;
      const d = smoothClosedPath(occ.points.map((point) => warpPoint(point, figure)));
      paths.push(
        `    <path class="atlas-muscle" data-muscle-id="${escapeAttr(occ.id)}" data-side="${occ.side}" d="${d}" />`,
      );
    }
  }
  const label = `${FIGURE_LABEL[figure]} figure, ${view} view — muscle atlas`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW_BOX}" role="img" aria-label="${label}">`,
    STYLE_BLOCK,
    `  <g class="atlas-figure-layer" aria-hidden="true">`,
    silhouetteMarkup(figure),
    `  </g>`,
    `  <g class="atlas-muscle-layer">`,
    ...paths,
    `  </g>`,
    `</svg>`,
    "",
  ].join("\n");
}

// The file name (relative to the figures directory) for one figure/view asset.
export function figureFileName(figure: Figure, view: View): string {
  return `${figure}-${view}.svg`;
}

export interface ManifestOccurrence {
  view: View;
  side: Side;
}

export interface ManifestMuscle {
  group: string;
  occurrences: ManifestOccurrence[];
}

export interface AtlasManifest {
  schema: string;
  contract: string;
  viewBox: string;
  views: readonly View[];
  figures: readonly Figure[];
  muscleCount: number;
  muscles: Record<string, ManifestMuscle>;
}

// Build the figure-agnostic manifest: for each canonical muscle, in `MUSCLE_ORDER`, its parent
// group and every (view, side) it occupies — the lookup that lets a consumer find "which paths are
// the lats" without parsing SVG. The same occurrences appear in all three figures, so the manifest
// is recorded once and applies to every figure.
export function buildManifest(): AtlasManifest {
  const muscles: Record<string, ManifestMuscle> = {};
  for (const spec of MUSCLE_SPECS) {
    muscles[spec.id] = {
      group: spec.group,
      occurrences: occurrencesOf(spec).map((occ) => ({ view: occ.view, side: occ.side })),
    };
  }
  return {
    schema: "workout-manager/atlas-manifest@1",
    contract:
      "data-muscle-id values are canonical Muscle ids (enum values) from apps/api/app/domain/muscles.py",
    viewBox: VIEW_BOX,
    views: VIEWS,
    figures: FIGURES,
    muscleCount: MUSCLE_SPECS.length,
    muscles,
  };
}

// The manifest serialized exactly as it is committed (two-space indent, trailing newline), so the
// generator and the test agree byte-for-byte.
export function manifestJson(): string {
  return `${JSON.stringify(buildManifest(), null, 2)}\n`;
}
