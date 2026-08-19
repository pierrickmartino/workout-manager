# 0051 — Insert adds a hand-authored prescription to a standalone Session

A user reusing a past workout wants to add a movement to it — and, on the record side,
to log a movement they did but that was never prescribed. We add two affordances:
**Insert** (`CONTEXT.md`, §Plan vs. Record) hand-authors a new Exercise Prescription into
the user's own **standalone Session** (the *plan*); and **Log Correction** grows the
ability to **add** a Logged Set to a record (the *record*), including an off-plan movement.
This ADR records the plan-side decision, which is the surprising one: it overturns the
"prescriptions are not editable after creation" limitation stated in ADR-0044.

**Insert is scoped to standalone Sessions; Protocol members stay on Deploy.** A standalone
Session (generated or Hand-Authored) is a self-contained plan with no positional sequence,
so adding a prescription in place is the direct analog of **Substitution** (ADR-0023) —
an in-place edit of the user's own copy — just "add" rather than "swap." A Protocol-member
Session is different: it lives in an ordered, partially-performed sequence governed by the
tail-only **Deploy** invariant (ADR-0020/0021), where an edit must never touch a performed
Session. Rather than teach Insert the tail gate, we keep it out of Protocols entirely in
v1; adding a movement inside a Protocol remains the Builder's job. The explicit no is
load-bearing: it keeps the settled-tail invariant in exactly one place.

**Session Provenance is immutable origin — Insert never flips it.** Inserting a
hand-authored prescription into an `ai_generated` Session leaves it `ai_generated`, so
Generation Feedback and Regeneration stay available. This mirrors Exercise Provenance,
which Enrichment never changes (ADR-0041), and the existing stance that "a Protocol's
content is not necessarily wholly AI-generated" yet stays AI-originated. Provenance records
*how the plan came to exist*, not *who touched it last*; a hand-added movement is an edit,
not a re-origination.

**Insert edits the plan only — the record is frozen.** Adding a prescription changes what
*future* performances prescribe; every existing Logged Session of that Session is settled
record and is untouched (plan/record separation, ADR-0001/0034). A user who Inserts a
movement, then looks at last week's log, sees last week exactly as performed. Same
semantics as Substitution: an in-place plan edit that never reaches back into the record.

**This reverses ADR-0044's premise, deliberately.** ADR-0044 justified Capture pre-filling
everything at creation on the grounds that "a standalone Session's prescriptions are not
editable after creation." Insert makes prescriptions *addable* after creation (not the same
as editing an existing one's rest/tempo, which stays a create-time choice). The Capture
rationale still holds for the fields Insert does not touch, but the blanket "not editable"
claim no longer does.

## Considered options

- **Let Insert reach Protocol-member Sessions too** — deferred: it would duplicate the
  tail-gated Deploy path (ADR-0020) outside the Builder, risking an edit to a performed
  Session. Adding a movement inside a Protocol stays the Builder's job.
- **Flip Session Provenance to `user_authored` on first hand-add** — rejected: it would
  withdraw Generation Feedback and Regeneration from a plan the AI genuinely originated, and
  contradicts the immutable-origin treatment of Provenance elsewhere (ADR-0041).
- **A full Session editor (reorder, delete, re-time existing prescriptions)** — out of
  scope: v1 Insert only appends a solo (non-Superset) prescription at the end, consistent
  with Regeneration not being Superset-aware (ADR-0023). Broader editing is a later call.
- **Block adding off-plan movements to a record** — rejected: the record is what the user
  *did*, not a mirror of the plan; the persistence layer already accepts any catalog
  movement in a Logged Session. Constraining it would enforce a plan-fidelity the domain
  explicitly disowns.

## Consequences

- **The record side gains "add a set" via Log Correction** (`CONTEXT.md`, §Plan vs. Record):
  an added Logged Set may record any catalog movement, including one never prescribed. Such
  an off-plan set **never changes the Completion Outcome** (it is not prescribed work, so a
  Completed Session stays Completed, ADR-0013) and **never trips the contiguity gate**
  (adding attempted work cannot un-settle a later Session, ADR-0034). This needed no backend
  change — the persistence layer never constrained a record's sets to the plan.
- **A prescription-add seam now exists for standalone Sessions**, alongside Substitution's
  in-place swap. Existing prescriptions' rest/tempo remain create-time only.
- **Insert respects the Sensitive-Constraint posture** the same way Hand-Authored authoring
  does (ADR-0023): a hand-authored prescription is user-chosen, not AI-served, so it raises
  no cache-bypass question (ADR-0003).
- **Reuse friction, addressed separately (not an ADR):** the History row gains a direct
  **Repeat** (plan-backed) / **Capture** (plan-less) control, cutting the `OPEN → Repeat`
  hop; the plan landing is kept so the Start-vs-Log fork survives. `CONTEXT.md` now defines
  the previously-undocumented **Repeat** term.
