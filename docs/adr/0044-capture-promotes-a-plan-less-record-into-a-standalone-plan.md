# 0044 — Capture promotes a plan-less record into a standalone user-authored plan

A user who logged a workout ad-hoc — a plan-less Logged Session, recorded with no plan
behind it (ADR-0031) — wants to keep doing it: "make this into a reusable workout." We add
**Capture** (`CONTEXT.md`, §Generation & Reuse): a hand-triggered promotion of one of the
user's own **plan-less records** into a new **standalone Session**. Capture is the first
act that crosses the plan/record line in the *record → plan* direction, so this ADR records
why it is a distinct act from Duplicate, why its result is always `user_authored`, why a
human finalizes the plan rather than the server guessing, and why the source record is
left untouched.

**Capture is not Duplicate — the glossary boundary is load-bearing.** Duplicate (ADR-0043)
copies an existing *Session* (a plan) into another plan, preserving its Provenance and
`trace_id`. An ad-hoc record is **not** a Session — it is a plan-less record, and there is
no source plan whose Provenance could be preserved. Overloading "Duplicate" to also mean
record → plan would dissolve exactly the plan/record distinction the domain is built to
protect (ADR-0001), and would force a lie about lineage (whose `trace_id`?). So Capture is
its own term, its own affordance, and its own endpoint. The result is always a
`user_authored` Hand-Authored Session (ADR-0040) with **no `trace_id`**: the plan is
genuinely authored now, from a record, by the user — Generation Feedback and Regeneration
are correctly hidden on it, because no AI ever wrote it.

**A human finalizes the plan; the server never fabricates the parts a record can't hold.**
A record knows the exercises, the per-set counts, and the loads and quantities actually
performed — but it structurally does **not** hold rest, tempo, or Superset grouping. A
standalone Session's prescriptions are not editable after creation (there is no
prescription-edit endpoint; Deploy is Protocol-scoped, ADR-0020), so creation is the user's
one chance to set those fields. Capture therefore **seeds the existing Hand-Authored
Session builder** from the record (exercises, quantity kinds, per-set values → prescription
defaults; `sets` = the count of a contiguous same-exercise run, target reps = the performed
range, recommended Load = the heaviest performed set) and leaves rest / tempo / Supersets
**blank for the user to fill** — never invented. This reuses the builder's own
`validate_deploy` boundary (Sensitive-Constraint suppression included, ADR-0023).

**Capture creates only a plan; it never re-logs.** The record already exists. The existing
author-and-log path (`author_and_log_session`) always writes both a plan and a first Logged
Session; reusing it here would fabricate a **second** performance and double-count XP,
Streak, and records — all read-time projections over the logbook (ADR-0018/0019). So Capture
submits through a **plan-only** author path that creates the standalone Session and logs
nothing.

**The source record is left plan-less and untouched.** Capture spawns a plan *alongside*
the record; it does not convert or retro-link it. Re-pointing the record's `session_id` at
the new plan would rewrite a settled record (ADR-0034) and could hand a plan-less log the
ability to advance a Protocol (ADR-0013) it never belonged to. The new plan carries **no
Logged Sessions** (plan/record split), and mutating either never affects the other.

## Considered options

- **Overload Duplicate to also cover record → plan** — rejected: it erases the plan/record
  boundary and forces dishonest Provenance/lineage on a plan that was never a Session.
- **One-click server synthesis (no human step)** — rejected: a standalone Session's
  prescriptions can't be edited afterward, so guessing (or permanently omitting) rest,
  tempo, and Supersets at creation strands the user with an unfixable plan. The record's
  unknowns should be filled by the person who did the workout, or left blank — not
  fabricated by the server with no recourse.
- **Reuse `author_and_log_session` as-is** — rejected: it always logs, double-recording a
  performance that already happened and inflating every read-time projection.
- **Retro-link / convert the source record to the new plan** — rejected: it rewrites a
  settled record (ADR-0034) and could let a formerly plan-less log advance a Protocol
  (ADR-0013). Capture leaves the record exactly as it was.
- **Offer Capture on plan-backed records too (capture *as-performed*)** — deferred, not
  rejected on principle: what a user did can diverge from what was prescribed, so an
  "as-performed" capture on a plan-backed record is a real, distinct result from Duplicate's
  "as-prescribed" copy. Left out of v1 to avoid two similar affordances on one detail page;
  revisit once the record detail page and Capture both exist.

## Consequences

- **Regeneration and Generation Feedback are hidden on a Captured plan** — it is
  `user_authored`, same as any Hand-Authored Session (ADR-0040). Correct: no AI wrote it.
- **Completion Outcome is naturally inert on it.** The Captured Session is standalone
  (parentless), so logging it advances no Protocol (ADR-0013).
- **Capture is offered only on plan-less records.** A plan-backed record shows Duplicate
  instead; the two affordances never appear together in v1.
- **No cache or safety-bypass interaction.** Capture is a no-AI promotion of an
  already-owned record; it touches no generation cache and raises no Sensitive-Constraint
  cache-bypass question (ADR-0003), though the authored plan still passes the
  Sensitive-Constraint-aware `validate_deploy` posture (ADR-0023).
- **A new plan-only author seam exists** alongside `author_and_log_session` — authoring a
  standalone `user_authored` Session without recording a performance.
