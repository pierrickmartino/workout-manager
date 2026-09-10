import {
  fetchCompletenessBreakdown,
  summarizeCompletenessBreakdown,
  type CompletenessTierView,
} from "@/lib/catalog-completeness-breakdown";
import { Alert } from "@/components/pulse/alert";
import { DataList } from "@/components/pulse/data-list";

// The tier colours echo the retired Completeness badge palette — but only here, on the
// admin ops surface, where the Stub | Listable | Enriched vocabulary is apt (ADR-0041,
// revised): violet for the gold Enriched tier, fainter grounds as content thins out.
const TIER_BAR: Record<CompletenessTierView["key"], string> = {
  enriched: "bg-violet",
  listable: "bg-text-muted",
  stub: "bg-elevated",
};

// The admin Catalog Completeness readout (ADR-0041, revised): a compact catalog-health
// summary — how much of the corpus is at the bar — sitting beside the enrichment backfill
// control as its decision-support. Catalog Completeness is an internal/ops axis, never
// surfaced on a user-facing catalog/library/detail read, so this admin-gated readout is
// the one place its tiers are named. An async Server Component: it fetches server-side
// (the JWT never reaches the browser) and derives all presentation from the pure
// `summarizeCompletenessBreakdown`, so there is no client JS and nothing to hydrate.
export async function CatalogCompletenessBreakdown(): Promise<React.JSX.Element> {
  const result = await fetchCompletenessBreakdown();
  if (!result.success || !result.data) {
    return (
      <Alert tone="error">
        {result.error ?? "Couldn't load the completeness breakdown."}
      </Alert>
    );
  }

  const view = summarizeCompletenessBreakdown(result.data);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className="label-mono text-[11px] text-text-secondary">
          COMPLETENESS · CATALOG HEALTH
        </span>
        <p className="font-mono text-[12px] leading-relaxed text-text-muted">
          {view.isEmpty
            ? "No catalog movements yet — nothing to enrich."
            : `${view.total} movements · ${view.enrichedPercent}% Enriched.`}
        </p>
      </div>

      {view.isEmpty ? null : (
        <>
          <div
            className="flex h-2 overflow-hidden rounded-sm bg-elevated"
            role="presentation"
          >
            {view.tiers.map((tier) => (
              <div
                key={tier.key}
                className={TIER_BAR[tier.key]}
                style={{ flexGrow: tier.count }}
              />
            ))}
          </div>
          <DataList
            rows={view.tiers.map((tier) => ({
              label: tier.label,
              value: `${tier.count} · ${tier.percent}%`,
            }))}
          />
        </>
      )}
    </div>
  );
}
