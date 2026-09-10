"use server";

import {
  fetchEnrichmentBackfillJob,
  startEnrichmentBackfill,
  type BackfillActionResult,
} from "@/lib/enrichment-backfill";

// The thin server actions behind the admin catalog-enrichment control. They exist because
// the backend endpoints are admin-gated and JWT-authenticated server-side (the token never
// reaches the browser), so the Client Component drives them through here. The backend
// enforces `require_admin` — these are not a place to re-check admin. Both unwrap the
// envelope to a `{ job, error }` the control can render.

export async function triggerBackfillAction(): Promise<BackfillActionResult> {
  const result = await startEnrichmentBackfill();
  if (!result.success || !result.data) {
    return { job: null, error: result.error ?? "Could not start the backfill." };
  }
  return { job: result.data, error: null };
}

export async function pollBackfillAction(
  jobId: string,
): Promise<BackfillActionResult> {
  const result = await fetchEnrichmentBackfillJob(jobId);
  if (!result.success || !result.data) {
    return { job: null, error: result.error ?? "Could not read the backfill job." };
  }
  return { job: result.data, error: null };
}
