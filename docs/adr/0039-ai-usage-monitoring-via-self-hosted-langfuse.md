---
status: accepted
---

# 0039 — Operational AI-usage monitoring via self-hosted Langfuse behind a recorder port

The operator needs visibility into AI usage — prompts, tokens, cost, latency, outcome, and
eventually feedback — across every generation. This is **operational observability of the
system, not part of the product domain**: it exists to serve the operator, never the end
user, so it earns no term in `CONTEXT.md` and is deliberately a **stored write-time event
log** — the very shape the domain forbids for XP/Streak/PRs. That is not a contradiction:
the "read-time projection, never a stored ledger" invariant (ADR-0018/0019) governs
*user-facing projections of the record*; it says nothing about operator telemetry, which
cannot be recomputed after the fact (a past call's token count is gone if not captured).

**The unit — a `Generation Call`.** One metered round-trip to the model provider through the
`StructuredLLM` seam. It exists *only on a cache miss*: a cache **hit** is adopt-by-copy with
no provider call, so it has no prompt and no tokens and is simply absent from the log (cache
hit-rate is a separate, non-irreversible metric, deferred). "Generation Call" is chosen to
not collide with the cache artifact (Generated Protocol/Session), the user's verdict
(Generation Feedback), or Regeneration.

**Capture point — a recording decorator, not a wider port.** The public port stays
`StructuredLLM.complete(*, system, user, schema, max_tokens, context) -> str` (ADR-0006):
the return type and the per-generator `parse_*` validation boundary are untouched. Token
counts exist only *inside* each provider, so providers gain a tiny internal result type
(text + normalized `TokenUsage` + model), and a single `RecordingStructuredLLM` wrapper does
timing, catches `GenerationError`, assembles the `Generation Call`, hands it to an injected
`GenerationCallRecorder` port, and returns just `.text`. Recording lives in exactly one place;
each provider only adds its own (irreducibly provider-specific) usage extraction. The one
additive change to the port is a provider-agnostic `context` (generator kind + nullable
`clerk_user_id`) — only the caller knows a call is a "protocol" vs "substitute" generation.

**The recorder is a port.** `GenerationCallRecorder` has a no-op implementation (tests, and
any deployment without Langfuse configured — selected by the factory the same way
`build_llm_client` selects a provider) and a `LangfuseGenerationCallRecorder` for production.
Langfuse is thus quarantined behind our own seam — it never leaks into generators — and the
offline test discipline extends cleanly: **no live Langfuse needed to run tests**, just as
none is needed for Postgres/Redis/Clerk.

**Best-effort, never breaks a generation.** A recorder or `flush()` failure is
swallowed-and-logged; a monitoring write must never turn a successful generation into a
`GenerationError`. Because generation is async on cache miss (ADR-0005), most Generation
Calls happen in a short-lived RQ job whose process may exit before Langfuse's background
batch flushes — so the worker **`flush()`es at the end of each job**, or those events are
silently lost.

**Self-hosted, with full prompt capture.** Langfuse runs on our own infrastructure rather
than Langfuse Cloud, because a prompt is built from the Fitness Profile and therefore carries
**Sensitive Constraints** (injury, rehab, postpartum, medical) — health data. Self-hosting
keeps that data on our infrastructure, so the safety posture behind the cache bypass
(ADR-0003) is not undone by shipping the same data to a third party. Because it stays home,
we capture **full prompt and output text by default** (the reason to adopt Langfuse over a
two-integer table); a metadata/hash-only posture was the fallback only if we had gone Cloud.

**Feedback: lineage now, scoring later.** Generation Feedback maps onto Langfuse Scores, but
feedback lives one hop from the call — on the user's adopted copy, not the shared Generated
artifact — and the cache makes traces many-adopters-to-one. So the **Langfuse trace id is
captured at generation time**, stored on the Generated artifact, carried onto the adopted
copy, and updated on Regeneration (this is the irreplaceable, can't-backfill part). The
actual Feedback → Score push is a **fast-follow**, deferred because its branching (shared
traces, regeneration) is real work and is not needed for the core usage/cost goal.

**Flat traces (v1).** Each Generation Call is its own Langfuse trace. Nesting several calls
of one user request under a parent trace would need a request-scoped trace id threaded
through the generation/worker path; it is a UI grouping nicety, non-irreversible, deferred.

**Pricing is Langfuse's, not the app's.** A Generation Call emits **tokens + model name**
only. Per-model prices are configured once in the self-hosted Langfuse instance; the app
never knows about money and never carries a pricing table that goes stale on every provider
price change. Cost is a projection of tokens × price, computed where the price lives.

**Data lifecycle is in v1 scope.** Holding readable health-data prompts, even on our own
infrastructure, is a standing liability, so lifecycle is not deferred:

- **Retention:** a **90-day** data-retention window on the Langfuse project — long enough for
  real cost/trend monitoring and debugging, short enough to bound the exposure. Pure Langfuse
  config; no app code.
- **Erasure capability:** every trace is stamped with Langfuse's first-class
  `user_id = clerk_user_id`, and a tested, reusable `delete_user_traces(clerk_user_id)`
  operation lives behind the recorder port, making per-user erasure mechanically possible
  today (on demand, or from a future deletion flow).

**Explicitly out of scope:** the account-deletion *trigger* (a Clerk `user.deleted` webhook
receiver with Svix signature verification — an authenticated ingress surface the app does not
have) and a **Postgres cascade** deleting a user's Protocols, Sessions, logs, feedback, and
metrics (the app cascade-deletes nothing today). Those constitute a whole-account-erasure
feature of their own and must not be smuggled in under an observability change; this ADR
delivers only the erasure of the data *this* feature introduces.

## Considered Options

- **Build an in-house `generation_calls` table behind the recorder port** — the natural fit
  for a repo that hand-rolls its cache, LLM port, and repositories, and it keeps all data on
  our Postgres. Rejected in favor of Langfuse for its prompt-replay/cost UI out of the box;
  the recorder-as-port means we can still swap to an in-house recorder later with zero changes
  to providers or generators.
- **Langfuse Cloud (SaaS)** — zero ops, but every event is third-party egress of user health
  data, directly against the instinct behind the safety cache bypass. Rejected; self-hosting
  keeps Langfuse's value without the egress.
- **Widen the public port to return text + usage** — rejected: it re-opens exactly what
  ADR-0006 closed, splitting each generator's `parse_*` boundary and threading a tuple through
  `structured.py` and all five generators. The recording decorator captures usage without
  moving the validation boundary.
- **Each provider self-records** — rejected: duplicates timing/outcome/assembly across all four
  providers and invites drift, the same reason ADR-0006 rejected per-generator provider classes.
- **Emit cache hits to Langfuse for hit-rate** — rejected for v1: a hit is not a provider call,
  so it would pollute token/cost aggregates; hit-rate is non-irreversible and can be added later
  as Langfuse *events* (not generations).
- **Build feedback→Score, request-nested traces, or the full account-deletion subsystem in v1**
  — all deferred: none is required for the stated goal (monitor usage/tokens/cost), and each is
  its own scoped effort.

## Consequences

- The `context` param is a small, additive change rippling to all four providers and every
  `complete()` call site, but the return type and validation boundary are unchanged.
- Langfuse becomes a second store of the most sensitive data we hold; the 90-day retention and
  `delete_user_traces` capability are load-bearing, not optional niceties, and the account-level
  erasure trigger is now a **named, owed follow-up** rather than a silent gap.
- The stored trace-id lineage on Generated artifacts and adopted copies is written once at
  creation (and on Regeneration) and never otherwise mutated, consistent with the immutability
  of Generated content.
