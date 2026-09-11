# 0065 — Structured set semantics are optional annotations, and warm-ups leave working-set analytics

Free text is flexible but weak for analytics and live-session speed: a plan that only
says "3×10, moderate" cannot tell a warm-up from a working set, prescribe a coaching
cue, or feed a per-movement note into History. We add three structured annotations —
**Set Type**, **Exercise Note**, and **Set Note** — plus a **Target Effort** target
(ADR-0066 covers Effort's type). The load-bearing, surprising part worth recording is
what we deliberately did **not** do: they are all **optional**, the plan Prescription
stays **homogeneous**, generation stays **flat**, and the *only* behavioural
consequence is that a **warm-up leaves working-set analytics**. Everything else is a
descriptive label.

## The granularity decision: plan-level annotations, per-set on the record

A Prescription today is `sets: N` identical sets — one `reps`, one `load`, one `rest`.
Set Type, per-set effort, and per-set notes are inherently *per individual set* and
*heterogeneous*, which collides with that homogeneous model. We resolve it the cheapest
honest way (rejecting a per-set plan-row rewrite):

- **On the plan (`ExercisePrescription`)** the new fields are **Prescription-level**:
  the whole movement line carries at most one Set Type, one Target Effort, and one
  Exercise Note. A genuinely heterogeneous *plan* — "warm-up ×2, then working ×3, then a
  drop set" — is authored as **consecutive Prescriptions**, the shape the Builder and
  hand-authoring already produce. `sets: 3` with no annotations stays exactly `sets: 3`;
  a plain three-sets-of-ten needs no choice at all.
- **On the record (`LoggedSet`)**, which is *already* one row per performed set, the
  per-set fields land naturally: **Set Type** and **Set Note** (and the typed Effort of
  ADR-0066) tag what actually happened, set by set, so live logging can distinguish a
  warm-up from a working set without any plan-side per-set structure.

We rejected a typed per-set overlay on the plan (`[{type, effort, note}, …]`): it would
force a rewrite of generation, the `parse_*` boundaries, Substitution/Duplicate/Redeem
carry-forward, and the Builder UI to express something consecutive Prescriptions already
express. Revisit only if prescribing mixed sets *within one movement line* becomes a
real requirement.

## Set Type is a curated, fixed enum — descriptive only

**Set Type** is a member of a *curated, closed* set — the same species as Training
Type, Progression Scheme, and the Skin catalog, never user- or AI-invented. The v1
members are **warm-up, working, drop, failure, AMRAP**, and **unset resolves to
working**, so every existing row and every un-annotated set reads as a working set and
nothing about existing history shifts.

**It never feeds Progression.** AMRAP as a Set Type collides with two things that
already exist: the rep-target grammar `"5+"` that `progression.py` reads, and
Greyskull's built-in AMRAP final set (ADR-0064). We keep the axes **independent**: Set
Type is a *descriptive annotation* on plan and record; **schemes keep reading the rep
grammar** and ignore Set Type entirely. Tagging a set `AMRAP` documents intent for the
reader and analytics; it changes no stepping. This is the same "one umbrella term,
refuse the redundant variant" discipline that keeps Superset from splitting into a
separate "circuit" (ADR-0023).

## The one behavioural consequence: warm-ups leave working-set analytics

Set Type is a record annotation, so it can sharpen the honest read-time projections —
but only where counting a warm-up would actively mislead:

| Projection | Behaviour |
|---|---|
| **Volume** (kg tonnage) | **Excludes `warm-up`**; working / failure / AMRAP / drop count. Warm-up tonnage is not working volume. |
| **Estimated 1RM / Personal Record / Top Set** | **Excludes `warm-up`** as a record candidate; the rest stay eligible, still behind the existing absolute-Load + trustworthy-rep gate (which already keeps light sets from setting records). |
| **Completion Outcome** | **Unaffected** — the plan's prescribed-set *count* is what is checked (ADR-0013/0045), not the record's per-set labels. |
| **XP** | **Unaffected** — stays type-neutral and rewards every attempted set; a warm-up is still work, and no honesty caveat leaks into the currency (ADR-0018). |
| **Logged Count** | **Unaffected** — counts performances, never sets. |

Legacy Logged Sets have no Set Type → read as `working` → still counted everywhere, so
the change is purely additive: no user's existing Volume, PR, or XP moves.

## Notes are free text, escaped at the boundary

**Exercise Note** is a plan-side coaching cue on the Prescription; **Set Note** is a
record-side note on the LoggedSet. Both are nullable, length-capped, and **HTML-escaped
at the write boundary** — user input that renders in the UI, governed by the same
nonce-CSP DOM-XSS posture as the rest of the app (ADR-0036). There is **no
Session-level note** in v1 (a whole-workout comment is a separate ask). The plan carries
no per-set note (consistent with the homogeneous plan above).

## Generation stays flat; these are user-authored refinements

In v1 the generator **never emits** Set Type, Target Effort, or notes — exactly as
Regeneration is deliberately not Superset-aware (ADR-0023). The prompt, the `parse_*`
boundaries, and the two-layer generation cache (ADR-0003) are **untouched**: structured
semantics are a *manual refinement* a user layers onto a generated plan through the
Builder, standalone in-place edits, or hand-authoring (the no-AI plan-edit posture of
ADR-0051/0052/0064). This is what honours "do not force these fields." AI-emitted
effort and set types are a clean future extension, deferred.

## Carry-forward follows the plan/record split

The plan-side fields (Set Type, Target Effort, Exercise Note) are Prescription
properties like reps/load/rest/tempo/scheme, so they copy faithfully across
**Duplicate, Redeem, Share, and Substitution** (ADR-0043/0057) and are re-numbered
untouched through a **Deploy** tail edit (ADR-0020). **Capture** leaves them unset — a
plan-less record never captured a plan's cue, the same way it leaves rest, tempo, and
Superset unset (ADR-0044). The record-side fields (Set Type, Set Note, Effort) stay on
the record and are subject to **Log Correction** like any other Logged Set field.

## Schema

Additive, all nullable, one Alembic migration; every existing row reads `NULL`, no
backfill:

- **`ExercisePrescription`**: `set_type: str | None`, `note: str | None`
  (`target_effort` is ADR-0066).
- **`LoggedSet`**: `set_type: str | None`, `note: str | None` (`effort` is ADR-0066).

## Considered options

- **Typed per-set overlay on the plan** — rejected: rewrites generation, `parse_*`,
  carry-forward, and the Builder to express what consecutive Prescriptions already do.
- **Drop `AMRAP` from Set Type** (it is already a rep grammar) — rejected: the label is
  cheap, reads honestly on the record, and independence from the rep grammar is easy to
  hold; keeping all five members is more useful than policing overlap.
- **Let Set Type feed Progression** — rejected: two AMRAP notions and a per-scheme
  branch for a descriptive label; schemes stay a function of reps + logged effort.
- **Exclude warm-ups from XP / Completion / Streak too** — rejected: XP and Streak
  reward *work performed* and are deliberately type-neutral (ADR-0018); a warm-up is
  real work. Only the two projections a warm-up would *mislead* (working volume, strength
  records) exclude it.
- **Generator emits the new fields in v1** — rejected: forces the fields, and expands
  the prompt/`parse_*`/cache surface. Kept flat.

## Consequences

- **Backward-compatible by construction.** Unset Set Type is `working`; no existing
  Volume, PR, Top Set, or XP figure changes.
- **Two projections gain a filter.** The Volume engine and the Estimated-1RM/PR/Top-Set
  selection drop `warm-up` LoggedSets before aggregating; every other projection is
  untouched.
- **Live logging can label sets fast.** The record already has per-set rows, so tagging
  Set Type / Effort / Note during a Live Session (ADR-0012) rides the existing finish
  payload with no new plan structure — the "live-session speed" the request wanted.
- **The plan surface grows by two nullable columns, the record by two** — no new tables,
  no new invariants beyond the warm-up exclusion.
