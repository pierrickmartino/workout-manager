import { test } from "node:test";
import assert from "node:assert/strict";

import { summarizeBackfill, type BackfillJob } from "./enrichment-backfill-view.ts";

// `enrichment-backfill-view` is the pure view-model behind the admin catalog-enrichment
// control (docs/redesign-ia.md, ADR-0071 / ADR-0046). It turns a polled backfill job into
// what the control renders — a status label, whether polling should continue (running) or
// stop (terminal), and the summary count lines — with NO I/O, so the client component stays
// thin and this is unit-testable in isolation.

function job(overrides: Partial<BackfillJob> = {}): BackfillJob {
  return { status: "pending", job_id: "job-1", summary: null, error: null, ...overrides };
}

test("a pending job is running, not terminal, and shows no summary lines", () => {
  const view = summarizeBackfill(job({ status: "pending" }));

  assert.equal(view.isRunning, true);
  assert.equal(view.isTerminal, false);
  assert.deepEqual(view.lines, []);
  assert.equal(view.statusLabel, "Running…");
});

test("a complete job is terminal and renders the four summary counts in order", () => {
  const view = summarizeBackfill(
    job({
      status: "complete",
      summary: {
        enriched: 12,
        skipped_already_complete: 30,
        skipped_nothing_to_work_from: 2,
        skipped_unfillable: 1,
      },
    }),
  );

  assert.equal(view.isRunning, false);
  assert.equal(view.isTerminal, true);
  assert.equal(view.statusLabel, "Complete");
  assert.deepEqual(view.lines, [
    { label: "Enriched", value: 12 },
    { label: "Already complete", value: 30 },
    { label: "Nothing to work from", value: 2 },
    { label: "Unfillable", value: 1 },
  ]);
});

test("a failed job is terminal, running-false, and carries no summary lines", () => {
  const view = summarizeBackfill(job({ status: "failed", error: "worker died" }));

  assert.equal(view.isTerminal, true);
  assert.equal(view.isRunning, false);
  assert.equal(view.statusLabel, "Failed");
  assert.deepEqual(view.lines, []);
});
