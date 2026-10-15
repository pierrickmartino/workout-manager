---
status: accepted
---

# 0135 — The AI audit log is an in-house Postgres table

Supersedes [ADR-0039](./0039-ai-usage-monitoring-via-self-hosted-langfuse.md).

ADR-0039 routed every metered **Generation Call** through the `GenerationCallRecorder` port
into a self-hosted Langfuse. Langfuse was never deployed, so in production the factory fell
back to the no-op recorder and nothing was captured anywhere. When a user reported a strange
Generated Protocol, or a generation failed, there was no record of the prompt, the output,
the model, or the reason. Running and maintaining a second piece of infrastructure just to get
that visibility is not worth it for a single operator (#729).

## Decision

**Record into the app's own Postgres, behind the same port.**

- **Same seam, new adapter.** `PostgresGenerationCallRecorder` implements the existing
  `GenerationCallRecorder` port. The `RecordingStructuredLLM` decorator, the
  `StructuredLLM.complete(...) -> str` contract and every generator's `parse_*` boundary are
  unchanged (ADR-0006). Persistence goes through `SqlGenerationCallRepository` into a new
  `generation_call` table. The factory selects this recorder whenever Langfuse is not
  configured. The no-op stays for tests that don't care about the log. Langfuse itself is
  removed in a later slice of #729.
- **Its own session, its own commit.** The recorder opens a short-lived session per call,
  independent of the caller's. A generation whose transaction rolls back still leaves its
  failed call recorded, and those are the failures most worth debugging.
- **Best-effort, as before.** A DB failure is logged and swallowed and never turns a good
  generation into an error. `record` returns `None`, and `flush` is a no-op because every
  record commits before it returns. `delete_user_traces(clerk_user_id)` keeps the erasure
  contract: it deletes that user's rows and **raises** on failure, so un-erased health data is
  never mistaken for erased.
- **Attributed to the caller.** The in-request generators (Session, Protocol, Regeneration,
  Substitute) take the caller's `clerk_user_id` from DI, and the worker passes the job's user
  to the Protocol generator. Catalog enrichment stays unattributed and shows as "system".
- **3-day retention, enforced twice.** Prompts are built from the Fitness Profile, so they carry
  Sensitive Constraints: readable health data. Retention is a named 3-day constant
  (`GENERATION_CALL_RETENTION`). There is no scheduler in the stack, so each record also purges
  rows older than the cutoff (best-effort, after the call is stored), and **every read applies
  the same cutoff**, so an expired row is never served even when a purge failed. The repository
  and recorder take an injectable clock so this is tested deterministically.
- **Full prompt and output capture, shown to admins only.** The table holds the full system
  prompt, user prompt and output, as ADR-0039 intended. Reading them is behind `require_admin`
  (ADR-0046) on the API and the admin resolver on the web, where a non-admin gets a 404. The
  list endpoint returns metadata only; the prompts and output are for the per-call detail view.
  That view also shows the requested schema name and the token budget, so a cut-off output is
  obvious, and a failed call's `GenerationError` text, capped at 2 KB because a provider error
  can echo a whole response body (#731).
- **Tokens only, no cost.** A call stores input/output tokens (null when the provider did not
  report them, never zero) and the model. The app carries no pricing table: ADR-0039's
  "pricing lives where the price lives" no longer has a home, and a stale price table is
  worse than none.
- **Lineage is dropped.** `trace_id` lineage existed so feedback could later be pushed to a
  Langfuse trace. A 3-day log cannot back lasting lineage, so `record` returns no handle and
  the `trace_id` columns stay null until a follow-up removes `TraceCapture` and drops them.

This is still operator telemetry, not a domain record: it earns no `GLOSSARY.md` term, and
the "read-time projection, never a stored ledger" invariant (ADR-0018/0019) does not apply,
for the reason ADR-0039 gave. Recording observes provider calls and changes nothing about
which calls are made, so the safety cache bypass (ADR-0003) is untouched.

## Consequences

- One less service to deploy. The log works wherever the API's database does, in-request
  and in RQ jobs alike.
- The health-data exposure is bounded to 3 days rather than ADR-0039's 90.
- No trend or cost analytics. This is a log viewer for investigating recent calls, not a
  dashboard.
- **Known gap: admin access to the log is not itself audited.** There is one admin today. If
  that changes, record which admin viewed which call.
- Each record runs a purge `DELETE` over the `created_at` index. At this app's call volume
  that is cheap. A scheduler would replace it if volume ever made it matter.
