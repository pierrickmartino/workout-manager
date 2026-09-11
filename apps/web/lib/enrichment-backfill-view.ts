// Pure view-model + shared types for the admin catalog-enrichment backfill control
// (docs/redesign-ia.md, ADR-0071 / ADR-0046). NO server-only imports, so it is safe in both
// Server and Client Components. The server-only data access (Clerk JWT + fetch) lives in
// `lib/enrichment-backfill.ts`; the wire shapes it consumes are declared here.

// The three states a backfill run reports, mirroring the backend's job envelope: `pending`
// until the worker finishes, then `complete` with summary counts, or `failed` with a message.
export type BackfillStatus = "pending" | "complete" | "failed";

// The summary counts a completed run reports (app/generation/exercise_enrichment_backfill.py):
// how many catalog Stubs were lifted to at least Listable, and why the rest were left alone.
export interface BackfillSummary {
  enriched: number;
  skipped_already_complete: number;
  skipped_nothing_to_work_from: number;
  skipped_unfillable: number;
}

// One polled backfill job: its status, the id to keep polling, the summary once complete, and
// a user-safe error once failed.
export interface BackfillJob {
  status: BackfillStatus;
  job_id: string | null;
  summary: BackfillSummary | null;
  error: string | null;
}

// The result a server action hands back to the client control: the job on success, or a
// user-safe error. Declared here (not in the "use server" actions module, which may export
// only async functions) so both the action and the client component share the one shape.
export interface BackfillActionResult {
  job: BackfillJob | null;
  error: string | null;
}

// What the control renders for a job: a status label, whether the client should keep polling
// (`isRunning`) or stop (`isTerminal`), and the summary count lines (empty until complete).
export interface BackfillView {
  statusLabel: string;
  isRunning: boolean;
  isTerminal: boolean;
  lines: { label: string; value: number }[];
}

const STATUS_LABEL: Record<BackfillStatus, string> = {
  pending: "Running…",
  complete: "Complete",
  failed: "Failed",
};

// Derive the control's view-model from a polled job. Terminal states (complete / failed) stop
// the client's poll loop; only a completed run carries summary lines, rendered in a fixed,
// human-readable order.
export function summarizeBackfill(job: BackfillJob): BackfillView {
  const isRunning = job.status === "pending";
  const lines =
    job.status === "complete" && job.summary
      ? [
          { label: "Enriched", value: job.summary.enriched },
          { label: "Already complete", value: job.summary.skipped_already_complete },
          {
            label: "Nothing to work from",
            value: job.summary.skipped_nothing_to_work_from,
          },
          { label: "Unfillable", value: job.summary.skipped_unfillable },
        ]
      : [];

  return {
    statusLabel: STATUS_LABEL[job.status],
    isRunning,
    isTerminal: !isRunning,
    lines,
  };
}
