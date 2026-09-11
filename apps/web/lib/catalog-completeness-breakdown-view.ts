// Pure view-model for the admin Catalog Completeness readout (ADR-0041, revised).
// Catalog Completeness is an internal/ops axis — never on a user-facing surface — so
// this is the one place its Stub | Listable | Enriched tiers are named, behind the
// admin gate, as decision-support for the enrichment backfill: how much of the corpus
// is sub-bar and whether Enrichment is keeping up. No server or React imports, so it is
// unit-testable with `node --test`.

// The catalog-health counts the admin endpoint returns, one per tier plus the total.
export interface CompletenessBreakdown {
  stub: number;
  listable: number;
  enriched: number;
  total: number;
}

// One tier as the readout renders it: the pipeline label (apt here — this is the ops
// surface), the raw count, and its share of the catalog as an integer percent.
export interface CompletenessTierView {
  key: "enriched" | "listable" | "stub";
  label: string;
  count: number;
  percent: number;
}

// The whole readout: tiers ordered strongest → weakest (the health reads top-down),
// the total, the headline "% Enriched" figure, and an `isEmpty` flag so the component
// can show an honest "nothing to show" instead of a zero-width bar.
export interface CompletenessBreakdownView {
  tiers: CompletenessTierView[];
  total: number;
  enrichedPercent: number;
  isEmpty: boolean;
}

// Integer percent of `count` out of `total`, guarding the empty catalog (0/0 → 0)
// rather than emitting NaN. Rounded for a glanceable readout, not an audit.
function share(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

// Project the raw counts onto the readout view-model. Tiers are emitted Enriched →
// Listable → Stub so the "at the bar" share leads; percentages are each rounded
// independently, so a mixed catalog's three percents need not sum to exactly 100 —
// acceptable for a health glance, and never presented as an exact partition.
export function summarizeCompletenessBreakdown(
  breakdown: CompletenessBreakdown,
): CompletenessBreakdownView {
  const { stub, listable, enriched, total } = breakdown;
  return {
    tiers: [
      {
        key: "enriched",
        label: "Enriched",
        count: enriched,
        percent: share(enriched, total),
      },
      {
        key: "listable",
        label: "Listable",
        count: listable,
        percent: share(listable, total),
      },
      { key: "stub", label: "Stub", count: stub, percent: share(stub, total) },
    ],
    total,
    enrichedPercent: share(enriched, total),
    isEmpty: total === 0,
  };
}
