# 320px reflow at 200% text

Date: 2026-09-29. Issue:
[#572](https://github.com/pierrickmartino/workout-manager/issues/572), split out
of [#570](https://github.com/pierrickmartino/workout-manager/issues/570) /
[#571](https://github.com/pierrickmartino/workout-manager/issues/571), where it
was measured, named and deliberately left open — see
[that record](ui-reflow-validation.md).
Application base: `65fbc1dc435b967ed5754def8a209ee18a8331b6`.
Governed by [ADR-0087](../adr/0087-a-field-row-stacks-when-its-fields-no-longer-fit.md).

**Outcome:** zero document overflow at 320px in all 600 cases at 100% text *and*
all 600 at 200% text. `KNOWN_200_TEXT_OVERFLOW` is empty and the ratchet is
removed. No control anywhere is left without room to show its value — and that
second measure is now gated by the same runner, not asserted in prose.

## Evidence and method

[Summary](ui-reflow-200-text-evidence/reflow-summary.json),
[raw measurements](ui-reflow-200-text-evidence/reflow-results.json.gz).
Runner: [`audit/reflow.mjs`](../../apps/web/audit/reflow.mjs), against the
isolated audit server (`npm run audit:serve`), unchanged in method from the #570
run: 600 cases — 10 journeys × 6 Skins × 2 Modes × 5 name fixtures — each
measured at 100% and at 200% text (root 16px → 32px, viewport unchanged), at a
320×568 portrait viewport.

| | 100% text | 200% text |
| --- | --- | --- |
| #570/#571 (before) | 0 / 600 | 240 / 600 |
| this change | 0 / 600 | **0 / 600** |

Element overflow — recorded, never gated — is 0 in every journey at both sizes.

The summary's `revision` is the **base** commit: the run necessarily precedes the
commit that carries its own output.

## The defect, and why it was its own issue

Every one of the 240 was a `rem`-sized grid track in a form field row.
`grid-cols-[7rem_1fr]` is a **224px** column once the root font doubles, inside a
row a 320px screen has narrowed to 108–158px; the measured culprit columns were
224px (`7rem`), 160px (`5rem`) and 128px (`4rem`). Nothing inside the row can
give way, so this is a different mechanism from the min-content-floored box #571
fixed, and none of #571's rules reached it.

Fixing it changes how those rows lay out, and a `sm:` variant is not the fix:
Tailwind's breakpoints are in `rem`, so `sm:` (40rem) stacks on every phone at
100% text too. The rows are wrapping flex rows instead, each field asking for a
width — the rule and the decision it implies are recorded in ADR-0087.

## What changed

- **`components/pulse/field-row.tsx`** (new): `FieldRow` plus the width
  vocabulary — a field asks for 5rem, the Load-kind picker 7rem.
- **Five forms' field rows**: `LogSessionForm`, `AdhocLogForm`, `CorrectLogForm`,
  `live-session-sets`, `HandAuthoredSessionForm`'s performed-set row — every row
  that held a rigid track.
- **Two more dense forms**, same defect family, cramped rather than overflowing:
  `PrescriptionFieldStack` and `ProfileForm`.
- **`components/exercise/history-panel.tsx`**: its `2.5rem` index column is
  spelled `minmax(0,2.5rem)`. It is a real table whose columns align across
  rows, so it stays a grid and the shrinkable spelling is the whole fix.
- **`components/ui/select.tsx`**: the chevron and its gutter are sized in px.
  They are the control's furniture, not text.
- **`lib/reflow-policy.ts`**: a third rule, `rigid-grid-track`, so CI catches the
  next one. `audit/reflow.mjs` is not in CI; this guard is. It reads a length
  wherever the track list hides it — `minmax(7rem,1fr)`, `repeat(2,_7rem)` — and
  exempts only `minmax(0,…)`, whose floor is zero.
- **`audit/reflow.mjs`**: besides losing the ratchet, it now measures every
  rendered text input and select in each case and gates on none of them being
  left without room for its value at 200% text.

## The 100%-text layout, decided

ADR-0087 states the decision. Measured, at 320px and 100% text: `logging`,
`live`, `correction` and `profile` render at **exactly** their previous page
height — those rows' asks still fit, so they did not move. `creation-logged` is
174px taller: the Hand-Authored performed-set row was fitting reps, load and RPE
into 60px, 90px and 64px, and now stacks rather than squeezes.

## Operability at 200% text

The acceptance criterion is that nothing is lost when the rows stack. Measured
over all 10 journeys × 6 Skins, counting every rendered text control whose border
box minus its own padding and border leaves less than one mono character:

- before: **600 of 894** (sampled: 10 journeys × 6 Skins, one fixture, light Mode)
- after: **0 of 894**, and **0 of 8,940** over the full gated sweep

Every field keeps its label association: the rows changed, the `<label>` and
`FieldLabel`/`Field` wrappers around each control did not.

## Validation

- `node audit/reflow.mjs`: 0/600 at 100% text, 0/600 at 200%, 0/8,940 cramped
  controls at 200%, 0 capture failures, exit 0.
- `npm test`: full web suite, including the extended reflow guard.
- `npx tsc --noEmit`: passes.
- Before/after screenshots at 320px, PULSE light, 100% and 200% text.

## Open, not closed

1. **The authenticated 200% real-app check** named in #570's success criteria is
   still unrun. A fixture at a doubled root font size is not a signed-in phone,
   and this run does not stand in for it.
2. **WebKit.** Not installed in this container; the two-engine criterion stays
   half-met by declaration.
3. **`1fr` tracks elsewhere.** Still unconverted, and still unimplicated: the
   measurement shows no overflow from them at either text size.
