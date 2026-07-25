# 0031 — Records may stand alone: the plan-less Logged Session

A hybrid athlete goes for a run nobody prescribed and wants to log it. Today they
cannot: `LoggedSession.session_id` is a non-null foreign key and the only write
path is `POST /api/sessions/{session_id}/logs`, so every record must point at a
Session — a *plan*. To log an ad-hoc run the user would first have to make the AI
prescribe them a run, which is absurd. This ADR records that a **Logged Session
may exist with no Session behind it**.

**A mandatory `session_id` was accidental coupling, not the invariant.** The
domain's cardinal rule is that a plan (what the AI prescribes) and a record (what
the user did) are *never the same thing* (`CONTEXT.md`, ADR-0001). A required
plan-pointer on every record quietly asserts the opposite — that a record cannot
exist without a plan. Making `session_id` nullable is therefore the *honest*
reading of the plan/record split, not a violation of it: a record of performed
work is a first-class thing whether or not a plan ever described it.

**Training type moves onto the record.** Every read that slices by training type
(Fitness Level advancement, per-type Analytics, the `objective · training_type`
label) reads it off the parent Session via `_training_type()`. A plan-less record
has no parent to join to, so `LoggedSession` gains an **always-populated**
`training_type` column: plan-backed records copy it from their Session at log
time, plan-less records carry their own. The join-based `_training_type()` and its
clerk-scoped twin are retired, and a one-time backfill populates existing rows.
The movement, not the record, was the wrong home for training type anyway — a
kettlebell swing is strength *or* cardio depending on how it was programmed, so the
catalog Exercise cannot know the intent; the performance does.

**A new route, not an overloaded one.** The URL `/api/sessions/{session_id}/logs`
structurally cannot express "no session", so a plan-less log posts to a new
`POST /api/logs`. Both routes funnel into the one `log_session` service (whose
`session_id` becomes `int | None`), which keeps the shared work — the
Performed-Body-Weight snapshot (ADR-0026), the catalog-validity guard, the
draft-building — in one place; only the ownership guard becomes conditional. The
boundary enforces a mutual exclusion: **plan-less ⇒ `training_type` required and
`session_id`/`completion_outcome` forbidden**; plan-backed ⇒ `training_type`
copied from the Session and the request's ignored.

**The Exercise stays a real catalog entry.** A run resolves to a catalog Exercise
("Running") like any movement — one nullable FK on the row (`session_id`), never
two. This inherits name-dedup (ADR-0002), Exercise Detail, the Top Set trend, and
Substitution for free, and avoids a Logged Set that points at neither a plan nor a
movement.

## Considered options

- **Back-form a one-off plan from the record** — rejected: it fabricates a
  prescription the AI never issued purely to satisfy a foreign key, the exact
  dishonesty the codebase refuses elsewhere (`domain/volume.py` returns `None`
  rather than a guessed figure; Execution Steps refuse invented step boundaries).
- **A separate "Logged Activity" concept beside Logged Session** — rejected:
  doubles the record model and forces XP, Streak, Achievements, and Analytics to
  each read two sources forever, for no domain gain.
- **A per-request optional `session_id` on one unified route** — rejected: a
  breaking change to a live endpoint and its web actions, and it muddies a genuine
  HTTP distinction between "log against my plan" and "log what I just did".

## Consequences

- **Completion Outcome is naturally undefined** for a plan-less record: nothing was
  prescribed, so nothing can be left un-attempted. It is already client-asserted and
  nullable (ADR-0013), and an ad-hoc run structurally cannot advance a Protocol
  because it carries no `session_id` — the gating invariant holds by construction.
- **XP and Streak keep working untouched.** Both are read-time projections over
  Logged Sessions/Sets and are documented as blind to training type
  (`domain/experience.py`, `domain/streak.py`), so a plan-less run earns and counts
  exactly like any other logged work with no new code.
- The `training_type` denormalization is the one irreversible-ish step (a backfill);
  the nullable FK and the conditional guard are otherwise additive.
