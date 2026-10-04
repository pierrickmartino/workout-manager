---
status: proposed
---

# 0111 — A Calibration re-pitches the un-performed tail

A user can generate a Protocol but not re-pitch the one they are holding. When a plan reads
too easy or too hard, the app's three existing adaptation mechanisms all decline the job:

- **Progression** (ADR-0004/0026/0064) adjusts *one* Prescription's load, automatically, and
  only once a prior exposure exists — it cannot act on a first exposure, cannot touch volume,
  and gives the user no say.
- **Fitness Level folding** (ADR-0004 §2) reaches only the *next* generation, because the level
  is a cache-key dimension. It also only ever moves **up**: `advance_level` computes
  `min(baseline + earned, MAX_FITNESS_LEVEL)` and `_is_strong` requires *every* set at low
  effort, so a Protocol that is too **hard** produces no signal at all. *(Both faults were
  since settled by ADR-0112, which renamed the fold `effective_fitness_levels` and made it
  bidirectional over a window of recent Sessions; the reasoning above describes the state
  this ADR was written against.)*
- **Regeneration** replaces a Session's *content* on negative Generation Feedback, once. It is
  the wrong instrument for "the numbers are wrong but the movements are right", and generating
  a fresh Protocol instead **supersedes** the Current Protocol (CONTEXT 'Current Protocol') —
  a total loss of position for "week 3 feels heavy".

So we add a fourth, and the point of this ADR is to record how it stays inside the domain's
hardest invariants rather than what it does.

## What a Calibration is

A **Calibration** is a user-chosen **relative offset from a Protocol's authored values**,
applied to its un-performed tail. The act is **Calibrate**. It is deliberately *not* a position
on a scale: the app never claims to know an absolute difficulty for a Session, and the offset is
read against whatever the plan already says.

- **The user supplies the direction; the system supplies the magnitude.** Both halves of the
  original request ("let me adjust it" / "base it on my profile and recent sessions") are true
  at once only in this shape.
- **No AI.** It is a pure function in `app/domain/`, the same species as `next_prescription`
  and the level fold (`advance_level`, since ADR-0112 `effective_fitness_levels`). It makes no
  Generation Call, touches no cache, and needs no job queue.
  ADR-0004 §3's deferral of history-aware AI generation is untouched.
- **It never swaps a movement.** `progression.py`'s invariant — "it **never auto-swaps** a
  movement … the swap stays a user-initiated **Substitution**" — holds across Calibration too.
  Exercise *selection* is never a difficulty lever.
- **One integer, anchored at the Next Session.** A Calibration applies from the **Next Session**
  through the end of the tail, so it is a single value on the Protocol rather than a piecewise
  function over positions. Because the offset is *relative*, the generation's own week-to-week
  shape — including its deload weeks (ADR-0001/0020) — survives at every Calibration.

## Why it is materialised, not an overlay

Progression is a read-time overlay; a Calibration is a **write**. The resolved Load, Quantity,
sets, rest and Target Effort are persisted onto the un-performed Prescription rows, and the
integer is stored on the Protocol as the user's *intent*.

An overlay was the obvious sibling design and was rejected on cost: today's overlay contract is
`NextPrescription`'s reps-and-load, and a Calibration moves sets and rest as well, so **every**
read that reports prescribed work would have to route through a widened overlay or disagree with
its neighbours — the Live Session's set list, the Completion Outcome derivation, the Scheme
Preview, the Prescription Summary. Materialising confines the change to one write path and buys
two things outright: **Progression then steps from the calibrated base**, with no second overlay
to order and no double-counting, and the Builder shows real values a user can hand-edit.

The price is recorded under *Consequences*: a Calibration is **not exactly reversible**.

**The integer is stored even though the values are materialised**, because three settled
behaviours need it and none can be derived from the rows: the ±3 clamp needs a current value to
clamp, stacking needs a base to add to, and the Fitness Level fold (below) needs to know a
Calibration is standing. It is a stored *choice*, the blessed species — the same as a
**Progression Scheme** selection or a **Favorite** — so ADR-0018's no-stored-ledger rule, which
governs *derived* facts (XP, Streak, Personal Records), is not in play.

## How a notch resolves

The integer becomes field changes at write time, and this is the one place the profile and the
record enter:

- **The Fitness Level band decides the magnitude** — reusing `cache._level_bucket`
  (beginner / intermediate / advanced, at levels 4 and 8) to pick one of three fixed increments.
  Not percentage math: `progression.py` already rejects that reasoning ("a fixed-increment step
  keeps the rule simple and auditable (vs. percentage math on noisy free-text loads)").
  The step inherits Progression's deliberate **asymmetry** — `DECREASE_KG` is 5.0 against
  `INCREASE_KG`'s 2.5 because "backing off … is the cautious direction for a fitness app" — so
  easier travels further per notch than harder.
- **Recent records decide which lever moves.** Recent **Incomplete** Completion Outcomes mean
  capacity ran out, so easier drops a **set**; **Completed** at high logged **Effort** means
  capacity was fine and intensity was not, so easier moves **Load**.
- **Where no Load can move**, the step moves **Quantity** or **sets** instead. A `%1RM`, `range`
  or `qualitative` Load is exactly what Progression leaves untouched, and a lever that silently
  no-ops on a whole class of Prescriptions is not a lever. This is what makes the rule **total**.
- **Volume is sub-capped at one set per Prescription** across the whole Calibration; further
  notches fall through to Load/Quantity. The ±3 clamp bounds *intent*, not structure, and a
  Session whose sets halved is barely the same Session — **Completion Outcome** would be
  measuring something else.

## The rule for work that arrives later

Under a materialised model the Calibration lives in the numbers, so anything added afterwards
could arrive un-calibrated. One rule covers every case:

> **The resolver applies to numbers the system chose, never to numbers the user typed.**

As the code stands, that rule **needs no implementation** — a fact worth recording, because it
looks like it should. A **Substitution** changes only the Prescription's `exercise_id`
(`evolve_prescription_row(p, exercise_id=…)`), preserving its sets, Quantity and Load, which
already carry the standing Calibration; a replacement therefore inherits the re-pitch by
construction. A Prescription **hand-authored** through the Builder is persisted verbatim,
which is the other half of the rule and equally free — silently re-pitching what someone typed
is the one genuinely dishonest behaviour available here.

The rule becomes live code only if Substitution ever starts supplying its *own* Load or
Quantity. At that point the replacement must be resolved from the **authored** pitch
(`standing=0, desired=<the stored offset>`) before it is written, because it arrives at the
plan's authored pitch rather than at the one the rest of the tail carries.

## Bounds, safety, and disclosure

**Clamped −3…+3, server-enforced**, stacking until the rail, with hard floors on resolution
(`sets >= 1`, as Deploy already validates; a reduction that would take a bodyweight-plus-added
Load to zero collapsing to bare `"bodyweight"`, reusing `progression.py` rather than re-deriving
it). The clamp earns its number by doing design work: **hitting the rail is what hands the user
to the Fitness Level fold.** You may re-pitch ±3; a user pressed against the rail is saying their
declared Level is wrong, and the fold is what fixes the *next* generation.

**A Sensitive Constraint does not gate either direction.** ADR-0058 already settled the
analogous question permissively — a Sensitive Constraint user may **Redeem** a plan *built for
another user and not tailored to their constraints*, receiving a **caveat rather than a
refusal**. Refusing that same user "+1" on their own plan would be incoherent. Three things
reinforce it: ADR-0003's bypass is about never serving **shared, AI-authored** content, and a
Calibration is neither; the clamp bounds the travel; and **Readiness** already forces **Extra
Caution** for these users, which is the domain's designated place to say "train cautiously".
A refusal would also be theatre — the plan is a recommendation, and the record is what the user
actually did.

**Disclosure is silent on the plan, with one exception.** Under a materialised rewrite the effect
is *self-evidencing*: the loads, sets and rest visibly change. There is no hidden mutation to
disclose, so no plan-level badge and no per-Prescription marks — **Prescription Summary** keeps
its rule of rendering "only the *advanced* values that differ from their default". The exception
is the **rail**: a control that silently stops responding is a defect, not a design, and the rail
is the one point where the app says no.

## The write path

A sibling of **Deploy**, not Deploy itself. A Calibration changes **no shape** — no position
moves, no Session appears or vanishes, no Prescription is added or removed — so
`reenumerate_tail` is pure overhead and `DeployDraft` (which carries titles and whole
prescription lists) is the wrong payload. It reuses what it must: `deploy_validation`'s floors
and `protocol_progress`'s performed-prefix read, never re-deriving which Sessions are
un-performed, and it writes through the one `PrescriptionDraft` persistence manifest (ADR-0069)
rather than a bespoke update. It keeps Deploy's **rejected-whole, nothing-persisted** posture, so
a Calibration that would floor out somewhere leaves the plan untouched.

**The performed prefix is never touched** (ADR-0020). A Session already performed keeps whatever
values it was performed under, which is correct: the record shows what was actually prescribed at
the time. This also means the reach of a Calibration shrinks as the user trains — "each Session
in my Protocol" is really "each Session in my un-performed tail", and that is the invariant, not
a limitation to engineer around.

## What this does not claim

- **It is not a difficulty score.** There is no stored or displayed absolute figure, and the
  term is banned in `CONTEXT.md`'s `_Avoid_` list alongside "intensity" for the same reason
  **Readiness** is three states rather than a recovery percentage (ADR-0001).
- **It does not touch the record.** It is a plan edit: XP, Streak, Personal Records,
  Achievements, Volume and the Training Heatmap are read-time projections of Logged Sets and
  recompute unchanged.
- **It does not re-pitch a Session for one occasion.** "I slept badly" is **Readiness**
  territory; the user does less and the Completion Outcome records it honestly.
- **It is not offered on standalone Sessions in v1.** The mechanism is provenance-blind by
  construction, so extending it to generated, Redeemed and Hand-Authored standalone Sessions is
  a later addition rather than a redesign. A Hand-Authored Session's owner can already edit it
  in place (**Insert** / **Remove**), so they gain least.

## Considered options

- **Correct the Fitness Level and regenerate** — rejected as the primary remedy: regenerating
  **supersedes** the Current Protocol, so it costs the user their position for a numbers problem.
  Retained as the *downstream* mechanism the clamp hands off to.
- **Extend Progression to be bidirectional and faster, with no user control** — rejected: it
  cannot act on a first exposure, moves only load, and leaves the user no say, which was the
  substance of the request.
- **Route it through the LLM port**, as Regeneration does — rejected on reversibility, not cost:
  an AI re-pitch cannot be a relative offset. "Easier" then "harder" lands on a third plan rather
  than back where it started, and it would need a Regeneration-style once-per-Session limit to
  contain the spend.
- **A read-time overlay** — rejected on the widened overlay contract described above; it would
  have bought exact reversibility at the price of routing every prescribed-work read through it.
- **Per-Session anchors** (calibrate from any un-performed Session) — rejected: it makes the
  Calibration a piecewise function over positions, and both storage shapes are damaged by Deploy
  (`reenumerate_tail` invalidates positional anchors; the tail delete/insert destroys
  per-`session_id` rows). Anchoring at the Next Session removes the whole class of problem, and
  the relative offset already preserves the plan's shape.
- **An absolute 1–10 dial** — rejected: it is a score, and it would collide head-on with
  **Fitness Level** (which *is* 1–10) and with a catalog Exercise's own `difficulty` field.
- **Gating the increase for Sensitive Constraint users** — rejected against ADR-0058's
  precedent, as argued above.
- **Exercise swaps as a difficulty lever** — rejected: it would be the domain's first auto-swap
  and would collide with **Substitution**.

## Consequences

- **A Calibration is not exactly reversible, and the ADR says so.** Resolution reads mutable
  state (the Fitness Level band, recent records) and the floors clip irreversibly, so returning
  the integer to 0 returns the user to *a* plan resolved at today's state — not to the one the
  generation authored. Exact reversal would require per-Prescription shadow columns, which is
  the overlay with extra steps.
- **The clamp bounds intent, not magnitude.** ±3 is on the integer. A user who calibrates +1 at
  Level 3, progresses to Level 8 and calibrates +2 more has travelled further in kilograms than
  "+3" suggests. This is accepted: the alternative is tracking cumulative drift, which is a
  ledger.
- **`Protocol` gains one nullable integer column** (`0044_protocol_calibration`). No Exercise
  Prescription field is added, so ADR-0069's field spine, its authorship partition and
  `tests/test_prescription_spine.py` are untouched.
- **A second write path reaches the un-performed tail.** The frozen-prefix invariant is now
  server-enforced in two places (Deploy and Calibrate), so it must be read from
  `protocol_progress` in both and never re-derived.
- **Export emits the Protocol's Calibration** for faithfulness; the calibrated values are simply
  the plan, so no record or CSV shape changes.
- **The bidirectional `advance_level` fold is specified here and ships separately.** It mutates a
  cache-key dimension, so it needs its own slice, its own evidence threshold and its own tests.
  The evidence rule is the **standing Calibration weighted by Sessions performed under it** —
  mirroring `DEFAULT_STRONG_SESSIONS_PER_LEVEL`'s three-sessions-per-notch cadence — because a
  Calibration nobody has trained against is an opinion, not evidence. *(Superseded by
  ADR-0112, which shipped that slice as `effective_fitness_levels` and settled the evidence as
  the **Completion Outcome plus graded perceived effort** over a window of recent Sessions,
  keeping the three-sessions-per-notch cadence. The standing Calibration is not an input.)*
