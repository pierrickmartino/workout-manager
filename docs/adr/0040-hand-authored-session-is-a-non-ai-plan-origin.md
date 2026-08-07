# 0040 — A hand-authored Session: a non-AI plan origin, authored and first-logged in one atomic call

A user wants to log a full workout they did today or in the past — adding exercises,
rest, and Supersets **exactly like editing an AI-generated plan** — without asking the
AI to invent one. Today they cannot: the only Session-create path is
`POST /api/sessions/generate` (AI), and the only no-AI record path is the ad-hoc
plan-less log (ADR-0031/0033), which is a *flat list of Logged Sets* with no rest, no
Superset, and no sets/reps structure. Rest, tempo, and Supersets are **plan**
vocabulary — attributes of an Exercise Prescription — so the honest home for them is a
Session, not a record. This ADR records that a Session may be **hand-authored** (a new,
non-AI plan origin) and that authoring one and logging its first performance is a single
atomic action.

**Rest and Supersets belong to the plan, so the user is authoring a plan.** The domain's
cardinal rule is that a plan and a record are never the same thing (`CONTEXT.md`,
ADR-0001). A Logged Set carries the *performed* Quantity, Load, and perceived difficulty
and deliberately has no rest field (a record's only time concept is Session Duration,
ADR-0014). Wanting to "log a workout *with* rest and Supersets" is therefore wanting to
author a plan and then record a performance of it — not to grow the record model. We
resolve the request as a **Hand-Authored Session** (a plan) plus an ordinary plan-backed
log of it, rather than by bolting plan concepts onto the record.

**Sessions gain a Provenance.** A hand-authored plan is as legitimately "not AI" as a
`user_entered` Exercise (ADR-0033). `Session` gains a `provenance` of `ai_generated` |
`user_authored`, mirroring the Exercise trichotomy on a distinct axis. It is load-bearing,
not cosmetic: Generation Feedback and Regeneration (ADR-0006/§Regeneration) assume the AI
wrote the plan — offering "the AI gave me a bad plan" or "regenerate" on a plan the user
wrote by hand is nonsensical — so those affordances read `provenance` and are hidden for
`user_authored` Sessions.

**Author-and-first-log is one atomic endpoint.** The build-and-log screen is a single
submit that must yield both a reusable Session *and* its first Logged Session, or neither
— never a half-written Session with no record, nor an orphaned write. A new
`POST /api/sessions` authors the standalone Session and writes its first performance in
one transaction, **reusing the existing `log_session` service** (ADR-0031) internally so
the Performed-Body-Weight snapshot (ADR-0026), the catalog-validity guard, and the typed
Load/Quantity boundary are shared, not reimplemented. The Session **persists as a reusable
plan**; every *subsequent* performance goes through the existing plan-backed
`POST /api/sessions/{id}/logs` — "I did that routine again" is a two-tap re-log, not a
re-authoring. Prescription/Superset validation reuses the Builder's deploy validation
(ADR-0020/0023).

**Movements resolve by search-and-create, not catalog-only.** Because this surface is
fundamentally *logging what you did*, its exercise picker uses search-and-create
(`POST /api/exercises`, ADR-0033), minting a `user_entered` Exercise on a miss — unlike
the Builder's catalog-only picker. Catalog-only would block logging a real movement the
catalog lacks, the exact case ADR-0033 exists to solve.

**The Sensitive-Constraint Superset suppression is honored.** ADR-0023's suppression is a
**safety rule**, not a Builder detail: a user with a Sensitive Constraint (injury, rehab,
postpartum, medical) is never handed superset-intensity work. It applies here identically —
the manual authoring surface auto-unlinks Supersets and shows the same banner for such a
user — so the safety posture does not depend on whether the AI or the user placed the
Superset.

## Considered options

- **Enrich the plan-less log to carry rest/Superset** — rejected: it puts plan vocabulary
  on the record, contradicting the cardinal plan/record split, and would force XP, Streak,
  Analytics, and PRs to reckon with a rest concept a record has never had.
- **Two client calls (author, then log)** — rejected for the *first* performance: a
  one-screen submit could half-fail into a Session with no record. (Re-logging a persisted
  Session *does* use the plain log route — there is nothing to atomically pair it with.)
- **A throwaway Session hidden after logging** — rejected: a plan-backed log needs a
  Session row anyway, so hiding it is strictly more work for less value than surfacing it
  as the reusable plan it already is (per the "persist as reusable" decision).
- **Reuse `ai_generated` provenance / omit provenance** — rejected: dishonest labelling
  (no AI was involved) and it would wrongly offer Generation Feedback / Regeneration on a
  hand-written plan.

## Consequences

- **Completion Outcome is naturally inert.** A hand-authored Session is parentless, so its
  log advances no Protocol (ADR-0013) — the same as logging today's AI standalone Session.
  Outcome stays optional/nullable; no new gating.
- **Correction works unchanged.** These logs are plan-backed (they carry a `session_id`)
  but parentless, so Log Correction (ADR-0034) applies with no contiguity gate to satisfy.
- **No cache interaction.** No AI call means no generation cache and no safety cache-bypass
  question (ADR-0003) — the Session is born owned and mutable, never shared.
- **Editing the authored plan later is out of v1 scope.** The Builder is Protocol-scoped;
  re-opening a standalone Hand-Authored Session for structural edits is a later slice.
  "Reusable" here means *log it again*, not *edit the plan again*.
- **Live training comes essentially for free later.** A Hand-Authored Session is a Session
  like any other, so running it as a Live Session (ADR-0012) needs no new plan model — but
  it is not v1 (this feature is log-after-the-fact only).
