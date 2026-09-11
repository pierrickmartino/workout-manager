import "server-only";

import { apiGet, type Envelope } from "./api";
import type { CompletenessBreakdown } from "./catalog-completeness-breakdown-view";

// Server-side data access for the admin Catalog Completeness readout (ADR-0041, revised).
// The endpoint is gated by `require_admin` on the backend; the transport seam (lib/api.ts)
// attaches the Clerk JWT, which never reaches the browser — so this is called only from a
// server component, never a Client Component. Re-export the server-free view-model so
// server callers can import it from one place.
export * from "./catalog-completeness-breakdown-view";

// Catalog-health counts by Completeness tier — decision-support for the enrichment
// backfill (how much of the corpus is sub-bar, and whether Enrichment is keeping up).
export async function fetchCompletenessBreakdown(): Promise<
  Envelope<CompletenessBreakdown>
> {
  return apiGet("/api/exercises/completeness-breakdown");
}
