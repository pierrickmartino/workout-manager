# 0046 — Stub-enrichment backfill gains an admin endpoint trigger (amends ADR-0041)

ADR-0041 shipped `backfill_stub_exercises` as a **deliberately CLI-only** pass — wired
only behind `python -m app.generation.exercise_enrichment_backfill`, never a route,
as a conscious go/no-go for running an AI batch over the shared catalog. That keeps the
batch a conscious human act but requires shell access to the production host, which an
operator lifting an existing backlog of Stubs may not have. We decided to **reopen that
one bullet**: the backfill is now also reachable through an **admin-guarded endpoint**
that *enqueues* the sweep onto the existing `generation` queue. The batch stays a
conscious act — it is gated on an operator role, not merely authentication — so the
"no accidental AI batch" spirit of ADR-0041 is preserved; only the access path widens.
Every other ADR-0041 decision (Listable-only fill, curator-only precautions/image,
provenance-blind eligibility, idempotent-friendly re-runs) stands untouched.

## Considered options

- **Keep it CLI-only, honor ADR-0041 as written (rejected).** Zero new surface, but
  demands shell access to prod and leaves the existing backlog stranded for any operator
  without it.
- **Synchronous endpoint that runs the sweep inline (rejected).** Simplest to reason
  about, but holds the HTTP connection open across one LLM call per fillable Stub —
  minutes of blocking and gateway-timeout risk over a real catalog.
- **Admin endpoint that enqueues one batch job (chosen).** `POST /api/exercises/enrichment-backfill`
  enqueues a single `run_backfill_job` onto the already-deployed `generation` worker and
  returns `202` with a `job_id`; a poll endpoint reads the summary back. Mirrors the
  async-on-cache-miss handoff already used for Protocol generation and on-create
  enrichment (ADR-0005).

## Consequences

- **The batch is gated on an operator role, not just auth.** There is no admin concept in
  the codebase, so one is introduced narrowly: a Clerk custom `role` claim (sourced from
  `public_metadata`), with the claim key and required value configurable in `Settings` and
  the endpoint **failing closed (403)** when the claim is absent or wrong. This keeps
  ADR-0041's "conscious act" property — a normal signed-in user cannot trip an AI batch.
- **A Clerk-side setup step is now load-bearing.** The endpoint is inert until Clerk is
  configured to emit the `role` claim (set `public_metadata.role = "admin"` on the operator
  and map it in the session-token template). The code alone does not make it work; the
  provisioning is documented in the deployment docs.
- **Single fixed job id, so a double-trigger is a no-op.** The sweep is enqueued under a
  constant job id; a re-trigger while one is queued or running returns the in-flight job
  rather than enqueuing a second overlapping sweep that could double-spend AI on the same
  Stub. The per-row step remains idempotent-friendly regardless.
- **The CLI entrypoint stays.** `python -m …` remains valid for an operator with shell
  access; the endpoint is an additional path, not a replacement, and both funnel through
  the one shared `backfill_stub_exercises` so they can never drift.
- **The result is polled, not returned inline.** `run_backfill_job` stores the
  `EnrichmentSummary` (enriched / skipped counts) as its RQ result; a `GET
  …/enrichment-backfill/jobs/{job_id}` surfaces it. The protocol-generation `JobState` is
  not reused — its payload is a `protocol_id`, not a summary — so a small parallel status
  mapper carries the counts.
