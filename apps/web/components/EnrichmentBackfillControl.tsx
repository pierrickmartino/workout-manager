"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { pollBackfillAction, triggerBackfillAction } from "@/app/admin/actions";
import { summarizeBackfill, type BackfillJob } from "@/lib/enrichment-backfill-view";
import { Alert } from "@/components/pulse/alert";
import { DataList } from "@/components/pulse/data-list";
import { Button } from "@/components/ui/button";

// How often to re-poll a pending backfill run. A catalog sweep is one LLM call per fillable
// Stub, so a couple of seconds between polls is responsive without hammering the endpoint.
const POLL_INTERVAL_MS = 2000;

// The admin catalog-enrichment control (docs/redesign-ia.md, ADR-0071 / ADR-0046): a single
// "Run backfill" trigger that enqueues a Stub-enrichment sweep and then polls its job to
// completion, showing the live status and, when complete, the summary counts. Gives the
// previously UI-less `POST /exercises/enrichment-backfill` endpoint a real surface. The
// backend enforces the admin gate; this only drives the two server actions and owns the poll
// loop and pending/error UI. All presentation is derived by the pure `summarizeBackfill`.
export function EnrichmentBackfillControl(): React.JSX.Element {
  const [job, setJob] = useState<BackfillJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Never leave a poll scheduled after the control unmounts.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  // Recursively schedule the next poll while the run is pending. A function declaration so it
  // can reference itself; it only touches the stable state setters and its `jobId` argument.
  function schedulePoll(jobId: string): void {
    timer.current = setTimeout(async () => {
      try {
        const result = await pollBackfillAction(jobId);
        if (result.error || !result.job) {
          setError(result.error ?? "Could not read the backfill job.");
          return;
        }
        setJob(result.job);
        if (result.job.status === "pending" && result.job.job_id) {
          schedulePoll(result.job.job_id);
        }
      } catch {
        // A transport fault must not leave the control stuck "Running…": surface it and
        // stop the loop (the user can re-run). Never swallow silently (coding-style).
        setError("Lost contact with the backfill job. Try running it again.");
      }
    }, POLL_INTERVAL_MS);
  }

  function run(): void {
    setError(null);
    startTransition(async () => {
      try {
        const result = await triggerBackfillAction();
        if (result.error || !result.job) {
          setError(result.error ?? "Could not start the backfill.");
          return;
        }
        setJob(result.job);
        if (result.job.status === "pending" && result.job.job_id) {
          schedulePoll(result.job.job_id);
        }
      } catch {
        setError("Could not start the backfill. Try again.");
      }
    });
  }

  const view = job ? summarizeBackfill(job) : null;
  const running = isStarting || (view?.isRunning ?? false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className="label-mono text-[11px] text-text-secondary">
          ENRICHMENT · ADMIN
        </span>
        <p className="font-mono text-[12px] leading-relaxed text-text-muted">
          Lift catalog Stubs up to at least Listable — one AI call per fillable movement,
          run in the background. Safe to re-run: rows already at the bar cost no call.
        </p>
      </div>

      <Button type="button" variant="primary" size="sm" disabled={running} onClick={run}>
        {running ? "Running…" : "Run backfill"}
      </Button>

      {view ? (
        <div className="flex flex-col gap-3">
          <span className="label-mono text-[10px] text-text-muted">
            STATUS · {view.statusLabel}
          </span>
          {view.lines.length > 0 ? (
            <DataList
              rows={view.lines.map((line) => ({
                label: line.label,
                value: line.value,
              }))}
            />
          ) : null}
        </div>
      ) : null}

      {error ? <Alert tone="error">{error}</Alert> : null}
    </div>
  );
}
