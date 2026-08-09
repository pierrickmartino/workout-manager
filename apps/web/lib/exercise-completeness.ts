// The client view-model for Catalog Completeness (ADR-0041). Whether a catalog
// Exercise meets the shared quality bar is a read-time projection — Stub → Listable
// → Enriched — the backend computes provenance-blind and returns on every catalog
// read. This module is the single source of truth for how that state renders as a
// badge beside the Provenance marker, in both the Exercise Library and Exercise
// Detail. Pure and browser-safe (no server-only imports), so the mapping is
// unit-tested without a browser — the twin of the backend projection in
// `app/domain/exercise.py`.

// The three completeness states, exactly as the API serializes them (a distinct axis
// from Provenance, which is trust — see CONTEXT: Catalog Completeness).
export const CATALOG_COMPLETENESS = {
  stub: "stub",
  listable: "listable",
  enriched: "enriched",
} as const;

export type CatalogCompleteness =
  (typeof CATALOG_COMPLETENESS)[keyof typeof CATALOG_COMPLETENESS];

// How a completeness state presents as a Badge: its micro-label, an explanatory
// tooltip, and the Badge variant. The variants are deliberately distinct from the
// Provenance palette (cyan CURATED / magenta AI-GEN) so the two axes read as
// separate: a filled `violet` for the gold Enriched tier, and progressively fainter
// `muted`/`outline` pills as content thins out.
export interface CompletenessBadge {
  label: string;
  title: string;
  variant: "violet" | "muted" | "outline";
}

const PRESENTATION: Record<CatalogCompleteness, CompletenessBadge> = {
  enriched: {
    label: "ENRICHED",
    title: "Meets the full quality bar: description, muscle emphasis, difficulty, precautions, and an image",
    variant: "violet",
  },
  listable: {
    label: "LISTABLE",
    title: "Has a description, targeted muscles, and execution steps",
    variant: "muted",
  },
  stub: {
    label: "STUB",
    title: "Name only — awaiting enrichment",
    variant: "outline",
  },
};

function isCatalogCompleteness(
  value: string | undefined,
): value is CatalogCompleteness {
  return (
    value === CATALOG_COMPLETENESS.stub ||
    value === CATALOG_COMPLETENESS.listable ||
    value === CATALOG_COMPLETENESS.enriched
  );
}

// Resolve a completeness state to its Badge presentation, or `null` when there is
// nothing honest to show. An absent value (a read that omits it) or an unrecognized
// one yields `null` — the safe posture: never invent a completeness claim, just omit
// the badge — mirroring how the AI-affordance gate treats an unknown provenance.
export function completenessBadge(
  completeness: string | undefined,
): CompletenessBadge | null {
  return isCatalogCompleteness(completeness) ? PRESENTATION[completeness] : null;
}
