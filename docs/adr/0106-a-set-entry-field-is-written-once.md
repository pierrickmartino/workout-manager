# 0106 — A set-entry field is written once

A Logged Set's amount and Load entry UI was written four times, in four files, with eleven
copies of its field blocks between them:

| File | Private subcomponents |
| --- | --- |
| `AdhocLogForm.tsx` | `SetRowFields`, `RepetitionsFields`, `DistanceFields`, `DurationFields` |
| `CorrectLogForm.tsx` | `SetRow`, `AmountFields`, `AddedSetRow`, `AddedAmountFields` |
| `LogSessionForm.tsx` | `SetRow`, `QuantityField`, `LoadFields` |
| `live-session-sets.tsx` | `SetRow` |

The typed-Load block appeared five times, the distance block four, the duration field four, the
reps field five, the effort picker four (with `RPE_VALUES` declared three times), the note three,
the kind picker twice, the movement field twice.

This was a correctness risk rather than a DRY nit. `Load` is a typed value — absolute,
bodyweight, %1RM, qualitative, range (ADR-0010, and a load-bearing invariant) — and the kind
selector was one of the five copies. Adding a Load kind meant editing four files, and missing
one would degrade a typed Load silently, in exactly one form. The same argument applies to
`QuantityKind` (ADR-0032): its three-way branch was written four times.

## The drift had already happened

The copies were not identical, and nothing in the type system had any way to say so:

- **Two of the five Load value fields asked for no keypad at all.** `CorrectLogForm` declared no
  `inputMode` on either of its Load inputs, so the same field offered a decimal pad in two forms
  and a full QWERTY in the other — a plain regression against ADR-0093, invisible to review
  because the three correct copies were in other files.
- **One distance field was not a numeric field.** `CorrectLogForm`'s pre-filled distance input
  declared no `type` and no `step`, so a 5 km run was typed on an alphabetic keyboard in that one
  form while the other three derived a decimal pad from `type="number" step="any"`.
- **The same picker was captioned two different ways**, and one of them was the word GLOSSARY
  'Quantity' lists under _Avoid_. The terminology guard bans that word as a quoted display label
  (issue #345) but had never seen it: in all four forms the caption was a JSX **text node**, not a
  string literal, so the regex could not reach it. Merging the copies moved the caption into a
  quoted literal in `lib/set-entry.ts` — and the guard failed immediately, with the pre-existing
  violation finally visible. The one form that said "Quantity" was right; the three that did not
  are the ones that moved.
- **The duration field had four different accessible names** for the same thing: `Duration, set
  1`, `Back Squat amount`, `Duration, added set 3`, and `Hold time for set 2`. The second is a
  leftover that reads as neither the caption nor the field.
- **A time placeholder was `mm:ss` in three copies and `25:00` / `5:00` in the fourth.**

## One vocabulary, two providers

The composition rule set's `state-context-interface` dissolves the one real difference between
the copies: **controlled against uncontrolled**. Two of the forms hold their rows in client state
and drive every field with `value`/`onChange`; two seed `defaultValue` and read the values back
out of the `FormData` on submit. Nothing else about a Load field differs between them.

So the family is one contract with two providers:

- **`SetEntryProvider`** — the row is driven by its holder. The ad-hoc log, whose rows live in a
  recoverable draft, and the plan-backed log, which derives a Completion Outcome live from what
  is entered.
- **`SetEntryFormProvider`** — the row is seeded once and then owned by the DOM. Log Correction,
  where every field is pre-filled from the record and the form full-replaces its sets on save.

Both implement `SetEntryContextValue`, shaped as the `state` / `actions` / `meta` contract
ADR-0105 established, so a field renders against the interface and how the row is held is the
provider's business:

- **`state`** — `values` (the row as raw strings), `disabled`, `unit`.
- **`actions`** — one `edit`, taking a patch that names its own vocabulary word. Never a
  per-field callback, so a new field reaches its holder without a new prop.
- **`meta`** — `mode`, the `set-<i>` prefix, and the `subject` a field's accessible name is built
  from. Not state (none of it changes while the row is mounted) and not an action, but every
  field needs it.

`useSetEntryField` is where every branch on the mode lives — it resolves one field's `name`,
`aria-label`, `disabled`, and *which of React's two value props it takes*. That one function is
what lets each field component below it stay blind to which kind of form it is inside.

`setEntryValueBinding` returns exactly one key, never the other as `undefined`: React decides an
input is controlled by whether `value` is nullish, so a binding carrying `value: undefined`
beside a `defaultValue` would read as uncontrolled, and the reverse warns.

## The vocabulary is the wire contract

`SET_ENTRY_FIELDS` names each field exactly as it is submitted — `load_kind`, `load_value`,
`reps`, `distance`, `unit`, `duration`, `rpe`, `note`, `movement`, `kind`. One vocabulary serves
both the `name=` attribute and the values record, so there is no mapping table between them and
therefore nothing for them to drift against. These are the words all four readers walk
(`readAdhocFormRows`, `readLogFormRows`, the correction reader): every form posts
`set-<i>-<field>` under a `set_count` header.

`setEntryValues` fills the record from whatever a caller holds, because each form keeps its own
row type — a draft row, a correction's pre-filled fields, a prescription-seeded log row, a live
set. Absent is the failure worth naming: a controlled `<input value={undefined}>` is an
*uncontrolled* input to React, so every keystroke in it would be silently discarded. Hence the
record is total and a test holds it to the vocabulary.

### A row maps to it through a declared table, never a pair of mappers

Two of the forms hold `camelCase` rows (`loadKind`, `loadValue`) and cannot simply adopt the wire
spelling: the ad-hoc row is also what gets persisted as a recovery draft, and the log row is built
and read by a `lib/` view-model with its own tests. So each declares **one** `SetEntryRowMap`
table, which `rowToSetEntryValues` and `setEntryPatchToRow` read in opposite directions.

The first draft of this change wrote those as two hand-written mapping functions per form, and that
was the same bug class the ADR is about wearing a different hat: a field added to one direction and
forgotten in the other discards that field's edits in silence, and looks exactly like the field
working. One table cannot half-land, and a renamed row field stops compiling.

The forms that hold no row object at all get the same treatment from the other side.
`CorrectLogForm`'s fields are seeded from a pre-fill function keyed by submitted *name*, so its rows
declare a `SetEntryFallbacks` table and `seededSetEntryValues` reads it through that function — in
place of the two near-identical local `seed` closures and one hand-written ten-field literal the
first draft had.

A field absent from a table does not reach the row at all, and one absence is load-bearing:
`showLoad` is a disclosure `LogSessionForm`'s row owns rather than a field the set submits, so it
stays on that row's own patch and cannot arrive through the entry contract.

## What each part is, and what stayed at the call site

`SetEntry.Load` is **the** one place a Load kind is added. It returns its two cells bare rather
than wrapped in a row, because one form puts the effort picker on the same line and a wrapper
here would make that impossible. `SetEntry.Distance` is the opposite: three cells, so it owns the
row they sit in, and `basis-full` is the ask that row makes wherever it is nested beside the
effort picker — which is what keeps a four-field row from being squeezed onto a phone (ADR-0087).

`SetEntry.Quantity` holds the kind branch. Its callers state a width ask *per shape*
(`durationClassName`, `rowClassName`) rather than branching on the kind themselves — a call site
that repeated the branch would be back to four copies of the thing being consolidated. Only the
two asks a call site actually makes exist: no part carries a `className` knob nothing passes, which
is a guess about the next caller rather than a need.

`SetEntry.Kind` is the one part that is controlled under **both** providers, because the picked
kind decides which fields exist below it: a form that seeded it and walked away could not
re-render its own row. So `SetEntryFormProvider` takes that one edit *by name* —
`onKindChange` — rather than a general `edit`, and anything else raising one throws. A seeded row
really can honour only this, and a discarded edit on a form the user is filling in would look
exactly like the field working, which is the failure this whole family exists to prevent.

One claim needs a mechanism outside the family to hold. In a seeded row the Load-kind picker is a
`defaultValue` select, so nothing in `set-entry.tsx` re-renders when it changes — yet ADR-0093
requires the keypad to follow the **picked** kind, not the seeded one. It does, because
`CorrectLogForm` re-serializes its whole form into the recovered draft on every change, so the
pre-fill reader returns the live DOM value and the seed tracks the pick. That is load-bearing and
invisible from either file alone, so `set-entry-fields.test.ts` asserts it against the real form
rather than arguing it.

Three things deliberately stayed out:

- **No `SetEntry.Row`.** The audit's sketch listed one, but only three of the five rows share a
  card: a skipped log row dims and tightens its padding, and a Live Session set is a `Card`. A
  shell three callers use and two override with a flag is the `patterns-explicit-variants` trap
  the same rule set warns about, so the shared string is a constant (`SET_ENTRY_CARD`) and no
  component.
- **`showLoad` is not a field.** It is a disclosure `LogSessionForm`'s row owns, not something
  the set submits, so it stays on that row's own patch rather than passing through the contract.
- **The context value is not memoized.** Nothing in these rows is behind a `React.memo`, so a
  consumer re-renders with its row whatever the value's identity is; a `useMemo` would read as
  saving renders while saving none (ADR-0091). In the Live Session the provider sits *inside* the
  set row, below the `memo` boundary that keeps that screen's re-renders down — no new context
  value crosses it.

## What changed for a user, deliberately

This was a refactor, but five copies cannot be merged without choosing between them. Each choice
below is a normalization onto what the majority already did:

- The two Load fields that asked for no keypad now ask for the one their picked kind implies, and
  the distance field that was not numeric now is. A `range` or descriptive Load still keeps the
  full keyboard in every form — a numeric pad offers neither a hyphen nor letters.
- The Quantity-kind picker is captioned "Quantity" everywhere, and announced "Quantity kind".
  Three of the four forms used the word GLOSSARY puts under _Avoid_; the minority was the one
  following the law, so the majority moved. This is also the one change here that a guard
  demanded rather than merely permitted — see above.
- A duration entered *as* the amount is announced "Duration" everywhere. It is still captioned
  "Time": a lone "Time" would not say which of a distance set's two times it is, which is why the
  caption and the accessible noun are allowed to differ at all.
- A time placeholder is `mm:ss` everywhere. It names the shape of the value rather than giving an
  example of one, which is what keeps it readable as an instruction (ADR-0101).
- A lone amount field now asks for its row's full width in the ad-hoc log, where it had sat in a
  two-column grid that gave it half a row and left the other half empty. The three other forms
  already gave a lone amount field the whole line.

Two things were deliberately **not** normalized, because each would change what a user can do
rather than how one field is written.

The Effort picker still offers 1-10 integers, which is narrower than the domain: GLOSSARY 'Effort'
defines the RPE scale as 0-10 with half-steps. All four copies offered exactly 1-10, so this is
pre-existing — but it is now one list instead of four, which turns closing the gap from a
four-file hunt into a one-line edit. The gap is named at the constant so it cannot be mistaken for
the domain.

The option *order* in the kind picker was left alone. `lib/quantity.ts`'s `AMOUNT_KIND_OPTIONS`
orders them Reps / Duration / Distance for the authoring surfaces, and these forms have always
shown Reps / Distance / Duration. That is a pre-existing inconsistency, and silently reordering a
picker in four forms is a change to what users see rather than a refactor — so the difference is
now stated once, in `SET_ENTRY_KIND_OPTIONS`, instead of being spread across four files.

## The ad-hoc log was in no journey

`adhoc` was a renderable audit case that neither `reflow.mjs` nor `wide.mjs` swept, so that
form was unverified at every width while its three sibling log forms were gated. It is also the
one of the four whose field rows changed shape. Both journeys now render it — the same move that,
when `home` was added, surfaced three pre-existing defects in components it had always rendered.

## Consequences

The four forms went from 1996 lines to 1486, and the shared family is 687 (a 441-line component
module and a 246-line view-model). So this is **not** a line-count win — it is 177 lines *more*
source in total, before the two test files. What it buys is that the eleven copies are one, and
the next Load kind, Quantity kind, keypad decision or accessible-name scheme is a one-place edit
that cannot half-land.

The guard surface is unchanged and this is deliberate: there is no new sweep. `form-input-policy`
already requires the design system's primitives, `spellcheck-policy` already requires a decision
on any field whose placeholder shows a value, and both now have one call site each to ask instead
of five. What a static sweep cannot see is whether the five copies *agree*, which is exactly why
they had drifted — so the thing holding them together is that there is only one of them, pinned
by `lib/set-entry.test.ts` (the vocabulary and the bindings) and
`lib/set-entry-fields.test.ts` (the rendered fields, every claim made against **both**
providers, because the drift was a per-form divergence).
