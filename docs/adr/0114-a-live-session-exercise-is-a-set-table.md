# 0114 — A Live Session exercise is a set table

**Status:** accepted

The Live Session spent a whole card on every **set**. Each one repeated its exercise's name,
its prescription ("Prescribed: 5 reps · bodyweight") and its previous performance on two lines,
then four captioned 44px controls — Reps, RPE, Load kind, Load — in a 2×2 grid, then its own
Complete and Skip. A four-set exercise was **1,296px** tall at 390px, about two and a half phone
screens, and a three-round Superset **1,907px**. The screen the user glances at between sets,
sweating, was mostly repetition.

## Decision

A unit the screen already groups (ADR-0023 — a solo Prescription, or a whole Superset) renders
as **one card with one row per set**: the set's tag, then its reps, Load value and RPE as 36px
cells under a shared column header, then its ✓. The facts that do not vary per set move up to
the unit, once:

- **The prescription and last time** read once per member — "4 × 5 · BW · last 5×BW, 5×BW,
  4×BW", collapsing to "last 3 × 12 · 10 kg" when every set matched.
- **The Load kind is asked once per member**, from a picker beside its prescription, and
  applies to that member's sets **still to do**. Nobody switches an exercise from dumbbells to a
  cable between its sets, so asking per set was four selects for one decision. A completed set
  keeps the kind it was completed with, and a done member's picker is disabled.
- **The Load value stays on every row**, always visible. It is the one Load fact that varies per
  set, and for **bodyweight it is the added load** — the field reads `+kg` from zero, so a
  weighted pull-up or dip is one keystroke, not a hidden mode.

A **Superset** names its members with the gym's own **A1 / A2** notation — each with its own
name, prescription, last time and Load kind, since a curl on dumbbells and a dip on bodyweight
share a round but not a kind — and groups its rows under **ROUND 1/3** headings, the order they
are performed in. Its rows are tagged A1 / A2; a solo exercise's rows are tagged by set number.

On the prototype's fixture at 390px the four-set exercise is now **334px** and the three-round Superset **548px**; on the audit fixture a three-set exercise is 292px.

### What each act became

- **Complete** is the row's ✓, and any pending row can be completed out of order, as before.
- **Reopen** (ADR-0089) is the *filled* ✓ on a completed row — tap it again. No confirmation,
  for the reason ADR-0089 gives: the act is its own undo. It still waits out a finish in flight.
- **Skip** is offered for the **current set only**, in the card's footer ("Skip set 2", "Skip A2 ·
  round 1"). Skip's effect is to advance the pointer (ADR-0013), which only the current set holds;
  leaving any other set alone *is* not doing it.

### Where it lives

`lib/live-set-table.ts` is the pure projection (members, tags, rounds, last time, the skip
target); `components/live-session-sets.tsx` lays it out. The row cells are not a new copy of the
set-entry fields: `SetEntry.RepsCell`, `LoadValueCell`, `EffortCell` and `LoadKind` are new parts
of the one family (ADR-0106) — the same names, accessible names and keypads, without a caption,
because the column header is the caption. The Load kind picker is a set-entry row whose values
are the member's first pending set and whose edit fans out to all of them. The cell's unit hint
(`kg`, `%`, `+kg`) is `loadValueHint` in `lib/load.ts`, beside the keypad rule it shares a field
with.

## The row is a wrapping flex row, not a grid

The prototype was a five-track grid (`minmax(0, 1.75rem) … minmax(0, 2.25rem)`), and every static
guard passed it. `audit/reflow.mjs` did not: at 200% text the `rem` tracks doubled while the card
kept its pixels, and **2,700** controls across the live cases were left with no room for their
value — reps fields 18px wide. That is ADR-0087's failure exactly, in a component written after
it. So the row is ADR-0087's answer: each cell asks for a width (`basis-10`, `basis-13`), the
row keeps them on one line while they fit and wraps when they do not. Every row — and the header —
makes the same asks, so at 100% text the cells grow to the same widths and the columns still
align; at 200% each field takes its own line. The Load kind picker likewise asks for 7.5rem and
may shrink, where a fixed width overflowed the card at 200%.

## Considered

Three other shapes were built and measured on a throwaway branch
(`prototype/live-set-density`): a **focus stepper** (only the set in hand has controls, as ±
steppers — 280px, the largest targets, but the upcoming sets' numbers are hidden behind a tap),
and an **accept-first** list (each set one summary line and a ✓, the set in hand opened — 357px,
the fastest "did what was prescribed", but every other edit costs a tap). The table won on the
property the screen exists for: every set's numbers are on screen and editable without opening
anything.

## Consequences

- **Rows are 36px, not 44px.** The ✓ and the cells are smaller targets than the old full-width
  controls. They stay above the 24px WCAG 2.2 minimum, and the ✓ — the act repeated every set —
  is the row's largest square.
- **Per-set Load kind is no longer offered.** A set whose kind genuinely differs from its
  siblings (a top set by weight, back-offs by %1RM) is entered by changing the member's kind
  between them: the pick reaches only the sets still to do. If that proves common it is a
  per-row disclosure, not a return to four selects.
- `audit/extra.mjs` and `audit/revalidate.mjs` measured the completed card's "Prescribed:" and
  "Previous:" notes; they now measure the member's prescription and last-time text in the card
  holding a completed row (`data-member-prescription`, `data-member-last`). The `live` journey's
  fixture gains a two-member Superset with mixed Load kinds, so the member legend and the round
  grouping are swept at every width and text size, not only the solo card.
- `lib/live-set-table.test.ts` holds the projection; `lib/live-set-table-card.test.ts` mounts the
  real list and holds what only the card can show — a member's pick reaching its own pending sets
  and no other member's, a completed row's ✓ reopening it, and Skip on the current set alone;
  `lib/set-entry-fields.test.ts` holds the new cells to the captioned fields' names and keypads
  in both providers.
