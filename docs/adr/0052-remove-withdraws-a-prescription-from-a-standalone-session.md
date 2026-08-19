# 0052 — Remove withdraws a hand-authored prescription from a standalone Session

A user reshaping a reusable workout wants to take a movement *out* of it, not only add
one. We add **Remove** (`CONTEXT.md`, §Plan vs. Record): it withdraws a single Exercise
Prescription from the user's own **standalone Session** (the *plan*), in place, with **no
AI call** — the symmetric partner of **Insert** (ADR-0051). This ADR records the three
decisions that are surprising or hard to reverse; the rest is Insert's shape run in
reverse.

**Remove is scoped to standalone Sessions; Protocol members stay on Deploy.** Exactly as
Insert (ADR-0051), a standalone Session (generated or Hand-Authored) is a self-contained
plan with no positional sequence, so removing a prescription in place is a direct in-place
edit of the user's own copy. A Protocol-member Session lives in an ordered,
partially-performed sequence governed by the tail-only **Deploy** invariant
(ADR-0020/0021), where an edit must never touch a performed Session; removing a movement
there stays the Builder's job. Keeping Remove out of Protocols keeps the settled-tail
invariant in exactly one place.

**A Session must keep at least one movement — the last prescription cannot be removed.**
The create and Insert paths reject an *empty* Session through `validate_deploy`'s
`empty_session` rule, so an empty standalone Session can never be authored. Allowing Remove
to drop the final prescription would persist a Session that could never have been created,
and the domain has no standalone-Session deletion to fall back on (a Protocol is never
deleted either — `CONTEXT.md`, §Current Protocol). So Remove refuses the last-remaining
prescription (`would_empty_session`) rather than silently reinterpreting "remove the last
one" as "delete the Session."

**Removing a Superset member auto-dissolves a leftover singleton to a solo prescription.**
A Superset needs ≥2 members (ADR-0023); a lone tagged member is not a Superset. Removing
one member of a two-member Superset would leave an invalid singleton, so Remove clears that
survivor's group tag and round-rest, turning it into a valid solo prescription. A group
that still has two-plus members after the removal simply shrinks. This keeps every accepted
Remove leaving a valid plan, with no confusing "you can't remove this" refusal.

## Considered options

- **Let Remove reach Protocol-member Sessions too** — deferred for the same reason as
  Insert: it would duplicate the tail-gated Deploy path (ADR-0020) outside the Builder,
  risking an edit to a performed Session. Removing inside a Protocol stays the Builder's job.
- **Allow removing the last prescription, leaving an empty Session** — rejected: it would
  persist a Session state the create/Insert paths forbid, with no way to re-author it and no
  deletion path to justify it.
- **Refuse removing any Superset member (solo-only, mirroring Insert's solo-only append)** —
  rejected: a flat "you can't remove this" is poor UX for a movement the user plainly wants
  gone. Auto-dissolving the leftover singleton keeps the plan valid and the action
  predictable.
- **Reorder or re-time existing prescriptions in the same edit** — out of scope, exactly as
  Insert (ADR-0051): v1 Remove withdraws one prescription and re-numbers the survivors
  contiguously; broader editing is a later call.

## Consequences

- **Remove edits the plan only — the record is frozen.** Withdrawing a prescription changes
  what *future* performances prescribe; every existing Logged Session is settled record and
  is untouched (plan/record separation, ADR-0001/0034). Logged Sets carry their own
  movement and Load, so a removed prescription leaves no dangling reference in the record.
- **Session Provenance is immutable origin — Remove never flips it.** Removing a movement
  from an `ai_generated` Session leaves it `ai_generated`, so Generation Feedback and
  Regeneration stay available (ADR-0041); a hand-removal is an edit, not a re-origination,
  the same stance Insert takes.
- **A prescription-remove seam now exists for standalone Sessions**, alongside Insert's
  in-place append and Substitution's in-place swap. The survivors are re-numbered into a
  contiguous `0..n-1` run so no position gap is left behind.
- **Remove raises no cache-bypass question** (ADR-0003): it removes user-chosen content and
  serves no generation, so the Sensitive-Constraint posture is not engaged.
