# Triggering the Stub-enrichment backfill

The catalog holds Exercises at three **Catalog Completeness** tiers (ADR-0041): a
name-only **Stub**, a **Listable** movement (description + targeted muscles + execution
steps), and a fully **Enriched** one. New Stubs minted through `POST /api/exercises` are
lifted to Listable automatically by a background job, but Stubs that predate that
feature — or curated seeds that ship below the bar — sit un-enriched until a **backfill**
sweep lifts them.

This page covers running that sweep against an existing backlog. There are two ways in;
both funnel through the one shared `backfill_stub_exercises` pass, so they never drift.

> **What the sweep does and does not do.** It lifts Stubs to **Listable** only —
> description, targeted muscles, execution steps, difficulty. It never writes
> precautions, an Exercise Image, or the Primary/Secondary muscle split: those are
> curator-only, because a fabricated safety note or a wrong illustration is dangerous in
> an injury/rehab-cautious domain (ADR-0041). Rows already at or above Listable cost no
> AI call, so a re-run is cheap and safe.

## Option A — the admin endpoint (ADR-0046)

`POST /api/exercises/enrichment-backfill` enqueues one sweep onto the background worker
and returns immediately with a `job_id`; a companion `GET` polls it. This needs no shell
access to the host — but it is **operator-gated**, and that gate requires a one-time
Clerk setup (below) before the endpoint will admit anyone.

### Prerequisite: mark an operator in Clerk

There is no admin concept in the app beyond a single Clerk **custom claim**. Until Clerk
is configured to emit it, the endpoint returns `403` to everyone — it fails closed.

1. **Set the role on the operator's user.** In the Clerk dashboard, open the user who
   should run maintenance and set **Public metadata** to:

   ```json
   { "role": "admin" }
   ```

   Public metadata is safe here: it is readable by the frontend but only writable from
   the Clerk backend, so a user cannot grant themselves the role.

2. **Surface it in the session token.** Clerk does not put custom metadata in the JWT by
   default. In **Sessions → Customize session token**, add the claim:

   ```json
   { "role": "{{user.public_metadata.role}}" }
   ```

   Now a signed-in operator's token carries `"role": "admin"`; everyone else's carries no
   `role` claim (or a different value), and the endpoint rejects them with `403`.

The claim key and the required value are configurable, in case `role`/`admin` clash with
an existing Clerk setup — both default to the values above:

| Setting (env var) | Default | Meaning |
|---|---|---|
| `ADMIN_ROLE_CLAIM` | `role` | Which JWT claim the gate reads. |
| `ADMIN_ROLE_VALUE` | `admin` | The value that grants access. |

If you change either, keep the Clerk session-token claim name and the metadata value in
lockstep with them.

### Run it

With a signed-in operator's bearer token:

```bash
# Kick off the sweep — returns 202 with a job_id
curl -X POST https://<api-host>/api/exercises/enrichment-backfill \
  -H "Authorization: Bearer $OPERATOR_JWT"
# => {"success":true,"data":{"status":"pending","job_id":"stub-enrichment-backfill", ...}}

# Poll it until status is "complete" (or "failed")
curl https://<api-host>/api/exercises/enrichment-backfill/jobs/stub-enrichment-backfill \
  -H "Authorization: Bearer $OPERATOR_JWT"
# => {"success":true,"data":{"status":"complete","summary":{
#      "enriched":42,"skipped_already_complete":310,
#      "skipped_nothing_to_work_from":0,"skipped_unfillable":3}, ...}}
```

The `summary` reports what the run did: `enriched` were lifted to Listable this run; the
`skipped_*` counts explain the rest — already at/above the bar (no AI call), a blank name
(nothing to work from), or a fill too thin to clear the bar (an AI call was made but
nothing was written, so the row stays a Stub and a later run retries it).

Notes:

- **The worker must be running.** The sweep executes on the same `rq worker generation`
  service that runs Protocol generation and on-create enrichment. If jobs enqueue but
  never complete, the worker is not up (see [`railway.md`](./railway.md) Step 3).
- **A double-trigger is a no-op.** The sweep runs under one fixed job id, so triggering
  again while a run is still in flight returns the in-flight job rather than starting a
  second overlapping sweep. Trigger again after one completes to run a fresh pass.
- The run can take a while on a large catalog — one LLM call per fillable Stub — so poll
  rather than expecting an inline result.

## Option B — the CLI

If you have shell access to a host with the app environment (the API/worker image), run
the sweep directly. It needs the same DB and AI-provider variables as the worker:

```bash
python -m app.generation.exercise_enrichment_backfill
```

It logs the same enriched/skipped summary on completion. This path predates the endpoint
(ADR-0041) and remains valid; the endpoint is an additional way in, not a replacement.
