// Pure render model for the anatomical Muscle Atlas body map (issue #543).
//
// The atlas ships six committed SVG documents (three figures × front/back, issue #542), but the
// Stats screen renders muscles as *interactive* nodes — each addressable, heat-shaded, and
// keyboard-activatable — so the app draws the figure from the same geometry the assets are
// generated from rather than injecting an opaque SVG string. This module is the seam: it turns a
// `Figure` + `View` into render-ready path data (one entry per canonical Muscle, its warped path
// `d` strings, its parent group) plus the structured silhouette, and it resolves a
// `Profile.gender` to the figure to draw. Pure and server-free — no DOM, no fetch — so the body
// map's geometry is unit-testable without a browser and the client component stays a thin shell.

import {
  VIEW_BOX,
  silhouetteModel,
  smoothClosedPath,
  warpPoint,
  type Figure,
  type SilhouetteModel,
  type Side,
  type View,
} from "./atlas-geometry.ts";
import { MUSCLE_SPECS } from "./muscle-figure-spec.ts";
import { occurrencesOf } from "./atlas-build.ts";

// One drawable occurrence of a muscle on a figure: which `side` it sits on and its warped SVG
// path `d`. A bilateral muscle has a left and a right; a center muscle has one.
export interface RenderedOccurrence {
  side: Side;
  d: string;
}

// One canonical Muscle prepared for the body map on a given figure/view: its canonical `id`
// (the `data-muscle-id` contract, matching the view-model's `region.muscle`), its parent
// `group`, and every warped path occurrence to draw. A muscle absent from the view (e.g. a
// back-only muscle on the front figure) is simply omitted.
export interface RenderedMuscle {
  id: string;
  group: string;
  occurrences: RenderedOccurrence[];
}

// Everything one interactive body view needs to render: the shared `viewBox`, the structured
// `silhouette` behind the muscles, and the addressable `muscles` in canonical order.
export interface FigureRenderModel {
  viewBox: string;
  silhouette: SilhouetteModel;
  muscles: RenderedMuscle[];
}

// Resolve a `Profile.gender` to the atlas figure to draw. The vocabulary is the backend Gender
// enum ("M" / "F"); anything else — null, unset, or an unrecognized value — falls back to the
// neutral/androgynous figure, so the map always renders a body (issue #543 AC).
export function resolveFigure(gender: string | null | undefined): Figure {
  if (gender === "M") return "male";
  if (gender === "F") return "female";
  return "neutral";
}

// Build the render model for one figure/view: warp each canonical muscle's authored occurrences
// onto this figure and keep only those on this view, preserving the canonical `MUSCLE_ORDER`.
// The same geometry the committed SVG assets are generated from, so the in-app body map and the
// standalone asset can never disagree on a muscle's shape.
export function toFigureRender(figure: Figure, view: View): FigureRenderModel {
  const muscles: RenderedMuscle[] = [];
  for (const spec of MUSCLE_SPECS) {
    const occurrences = occurrencesOf(spec)
      .filter((occ) => occ.view === view)
      .map((occ) => ({
        side: occ.side,
        d: smoothClosedPath(occ.points.map((point) => warpPoint(point, figure))),
      }));
    if (occurrences.length === 0) continue;
    muscles.push({ id: spec.id, group: spec.group, occurrences });
  }
  return { viewBox: VIEW_BOX, silhouette: silhouetteModel(figure), muscles };
}
