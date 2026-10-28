---
status: proposed
---

# 0143 — Equipment Substitution re-expresses Load and keeps the Prescribed Original

A user without the kit their Protocol Session needs wants the same training with what they
have. We extend Substitution rather than generate a new Session. **Equipment Substitution**
batches a Substitution over every Exercise Prescription the chosen Available Equipment blocks.
It edits that one Session in place, so the rules on plans and records still hold. Only an
un-performed Protocol Session is edited (ADR-0020), and only a Completed Logged Session moves
the Protocol forward (ADR-0013).

## Decisions

- **Available Equipment per action.** Substitution and Equipment Substitution take the
  Available Equipment for this action. It is pre-filled with the Default Equipment, and an
  explicit empty set means bodyweight only (the same rule as ADR-0038). The saved profile is
  never changed.
- **Load is re-expressed, not carried.** When the new Exercise needs different equipment, its
  Load becomes bodyweight for a bodyweight movement and qualitative otherwise ("pick a
  challenging weight"). Sets, Quantity, rest, tempo, and target Effort are kept. A kg figure is
  meaningless across equipment, and an AI-guessed weight has no record behind it.
- **The Prescribed Original is stored.** The first Substitution snapshots the Exercise, Load, and
  Progression Scheme. Later Substitutions leave it unchanged, and **Restore** brings all three
  back. It is a plan-only field, marked *not carried* in the prescription spine (ADR-0069), so
  a Share never leaks the sharer's original Load. While the snapshot is held, a scheme that does
  not fit the new Load kind falls back to the default (ADR-0064).
- **Same muscles is checked, at Muscle Group level, on AI output only.** Curated catalog
  Alternatives are trusted. An AI-invented substitute receives the original's Primary and
  Secondary Muscles. It is accepted only if its Primary Muscles cover every Muscle Group the
  original's Primary Muscles roll up into. Otherwise it is retried once, then left as it was
  and flagged. A check at individual-Muscle level would reject good swaps wherever catalog data
  is still coarse ("back").
- **Preview, then generate.** The preview lists the catalog swaps and marks the rows that will
  need the AI, but it makes no AI call. Declining therefore never leaves orphaned AI Exercises in
  the shared catalog. The rows succeed or fail independently.
- **Started from the Session page only.** A Live Session works from its own client-side copy
  (ADR-0012). The action is disabled while one is open for the Session.

## Considered Options

- **Generate a whole alternative Session.** Rejected. It discards the movements the user can
  still do, and it drifts from what the Protocol prescribed.
- **A one-off stand-in Session that counts toward the Protocol position.** Rejected. It would
  need a new concept, a standalone Session that advances a Protocol, which blurs plan and
  record. Restore covers the "only for this week" need.
- **Apply the swap to the same movement in every later Session.** Rejected as the default. Being
  without kit is usually temporary, and single Substitution can repeat the swap where wanted.
