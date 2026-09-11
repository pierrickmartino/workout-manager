import "server-only";

import { apiGet, apiSend, type Envelope } from "./api";
import type { BackfillJob } from "./enrichment-backfill-view";

// Server-side data access for the admin catalog-enrichment backfill (ADR-0046). Both
// endpoints are gated by `require_admin` on the backend; the transport seam (lib/api.ts)
// attaches the Clerk JWT, which never reaches the browser — so these are called only from
// server actions, never a Client Component. Re-export the server-free types/view-model so
// server callers can import them from one place.
export * from "./enrichment-backfill-view";

// Enqueue a Stub-enrichment sweep over the whole catalog. Returns a `pending` job whose
// `job_id` the caller polls; a double-trigger while a run is in flight returns that same
// in-flight handle rather than starting a second sweep (ADR-0046).
export async function startEnrichmentBackfill(): Promise<Envelope<BackfillJob>> {
  return apiSend("/api/exercises/enrichment-backfill", "POST");
}

// Poll one backfill run: `pending` until the worker finishes, then `complete` with summary
// counts or `failed` with a user-safe message. An unknown id is a 404 (an error envelope).
export async function fetchEnrichmentBackfillJob(
  jobId: string,
): Promise<Envelope<BackfillJob>> {
  return apiGet(
    `/api/exercises/enrichment-backfill/jobs/${encodeURIComponent(jobId)}`,
  );
}
