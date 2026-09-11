# 0043 — Duplicating a Session preserves its Provenance and lineage, and lands standalone

A user wants to reuse a workout they already own without re-authoring it — "give me
this Session again so I can tweak and log it." We add **Duplicate** (`CONTEXT.md`,
§Generation & Reuse): a hand-triggered deep-copy of a user-owned Session into a **new
standalone Session**. The one surprising, hard-to-reverse choice is that the copy keeps
the source's **Session Provenance** (`ai_generated` | `user_authored`) and its
`trace_id` lineage unchanged, rather than being reborn as `user_authored`. This ADR
records why.

**Provenance tracks who authored the *content*, not who performed the copy.** Session
Provenance is load-bearing: Generation Feedback and Regeneration are hidden on a
`user_authored` plan (ADR-0040), because "the AI gave me a bad plan / regenerate it" is
nonsensical for a plan the user wrote by hand. Duplicating does not re-author anything —
the prescriptions were still written by whoever wrote the original. The precedent is
**Adopt** (ADR-0003): adopting a Generated Protocol deep-copies it into a user-owned,
fully *editable* Protocol whose Sessions stay `ai_generated`; editing a plan never flips
its Provenance. Duplicate is the same species of copy, so it follows the same rule. The
rejected alternative — stamp every duplicate `user_authored` because "the user clicked
the button" — was declined as dishonest labelling: it would strip Generation Feedback and
Regeneration off a copy of an AI plan the user may want to regenerate precisely *because*
it came from the AI.

**`trace_id` lineage travels with the content.** For an `ai_generated` source, the
`trace_id` links the plan to the generation that produced it — used for AI-usage
monitoring (ADR-0039) and to condition Regeneration. Because the copy is the same content,
it carries the same lineage forward (as Adopt does), while remaining a **distinct Session
row** with its own identity. A `user_authored` source has no `trace_id` to carry.

**The copy is always standalone, and never a record.** Duplicate produces a *plan*: it
deep-copies Exercise Prescriptions and Supersets (full-fidelity — unlike Regeneration,
which strips Supersets because it is *generating* new prescriptions, not copying settled
ones) but **no Logged Sessions**, honoring the cardinal plan/record split (ADR-0001). The
destination is always standalone — `protocol_id` and any Week/Day/position are dropped —
so duplicating a Protocol-member Session lifts one workout *out* of the plan without
touching the source Protocol or its records. Placing a Session *into* a Protocol remains
the Builder/Deploy path (ADR-0020); Duplicate deliberately does not overlap that seam.

## Considered options

- **Stamp the copy `user_authored`** — rejected: dishonest (no re-authoring occurred) and
  it would strip Generation Feedback / Regeneration from a copy of an AI plan, contradicting
  the Adopt precedent that a copy preserves content Provenance.
- **Start the copy with fresh/no lineage** — rejected: breaks AI-usage traceability
  (ADR-0039) and leaves Regeneration on an `ai_generated` duplicate unconditioned, for no
  benefit; the copy already has its own row identity, so shared lineage costs nothing.
- **Allow duplicating into the Current Protocol's tail** — rejected for v1: that is exactly
  the Builder/Deploy responsibility (ADR-0020), and overlapping it would fork tail
  re-enumeration across two seams. Duplicate yields a standalone plan; Builder places
  Sessions into Protocols.
- **Copy the source's Logged Sessions too** — rejected: a plan and a record are never the
  same thing (ADR-0001). A duplicate is a fresh plan with an empty logbook.

## Consequences

- **Regeneration and Generation Feedback stay available on an `ai_generated` duplicate** —
  the intended outcome of preserving Provenance. A `user_authored` duplicate hides them,
  same as its source.
- **Completion Outcome is naturally inert.** A duplicate is standalone (parentless), so
  logging it advances no Protocol (ADR-0013) — the same as any standalone Session.
- **No cache or safety-bypass interaction.** Duplicate is a no-AI copy of an already-owned
  Session; it touches no generation cache and raises no Sensitive-Constraint cache-bypass
  question (ADR-0003).
- **The copy is renamed by no one.** The source's user-given name is carried verbatim, so
  a user's Session list may show two identically named entries until one is renamed;
  identity is by id, not name.
- **Editing the duplicated plan's structure later is out of v1 scope**, exactly as for a
  Hand-Authored Session (ADR-0040): "reusable" means *log it again*, and Structural edits
  remain a Protocol-scoped Builder concern.
- **The Duplicate *control* is withheld on a Protocol-member Session** (the Session view reads
  `is_protocol_member` off the Session read). Lifting one workout *out* of a plan the user is
  actively working through has no value at that surface — the intent there is to *do* the Next
  Session, not fork it — so Duplicate is offered only on standalone Sessions (and the record
  side offers **Repeat**, reusing the existing plan without a copy). This withholds an
  *affordance*, not the *capability*: the `POST /api/sessions/{id}/duplicate` endpoint is
  unchanged and still lifts a Protocol member out standalone when called.
