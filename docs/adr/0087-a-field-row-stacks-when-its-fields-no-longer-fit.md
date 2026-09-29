# 0087 — A field row stacks when its fields no longer fit

[ADR-0085](0085-a-narrow-screen-never-scrolls-sideways.md) closed the 320px
document overflow at 100% text and named what it did not close: at **200% text**
(WCAG 1.4.4 resize-text — root 16px → 32px, viewport unchanged) 240 of 600
measured cases still widened the document, and every one of them was a
`rem`-sized grid track in a form field row.

The mechanism is not the one ADR-0085 fixed. That was a box CSS floors at its
content's minimum. This is a track with a size decided before the viewport is
consulted: `grid-cols-[7rem_1fr]` is a **224px column** once the root font
doubles, inside a row that a 320px screen has narrowed to 108–158px. No amount
of shrinking inside the row helps, because nothing in the row is allowed to
argue with the 224px.

## The break is driven by the fields, not by a screen size

A breakpoint is not the remedy. Tailwind's `sm:` is 40rem, so `sm:grid-cols-…`
stacks on **every** phone at 100% text too — the change would not be neutral at
the size almost everybody uses, which is why the fix wanted a decision rather
than a mechanical edit.

So the row is a wrapping flex row and each field states the width it asks for:

```tsx
<FieldRow>
  <label className={WIDE_FIELD_CELL}>Load kind…</label>   {/* asks 7rem */}
  <label className={FIELD_CELL}>Load…</label>             {/* asks 5rem */}
</FieldRow>
```

The row keeps its fields side by side while the asks fit and stacks them when
they do not. Nothing is keyed to a viewport width, so **the same rule produces
the old layout at 100% text and a stacked one at 200%**, where a single 5rem
field is already wider than the whole row.

`min-w-0` on every field is what lets a control narrower than its own padding
still render rather than push the line out — the same escape hatch ADR-0085 puts
on a `<fieldset>`.

## The decision about 100% text, stated

One number: **a field asks for 5rem**, and the Load-kind picker, whose longest
option is "Percent of 1RM", asks for 7rem. From that follows what a 320px phone
shows at 100% text, which is the part that needed deciding:

- A row whose asks fit is **unchanged, to the pixel**. `logging`, `live` and
  `correction` render at exactly the height they did before.
- A row whose asks do not fit **stacks a line earlier than it used to**. Four
  rows do: the three-field amount rows (Distance / Unit / Time), the Load
  kind / Load / RPE row, and the Hand-Authored performed-set row, which was
  fitting reps, load and RPE into 60px, 90px and 64px. They stack rather than
  squeeze, and `creation-logged` is 174px taller for it.

5rem is the floor because it is the narrowest a pulse control stays readable at:
an `Input` spends 2rem of its width on its own padding, a `Select` 3.5rem. Below
that the field stops showing the value it holds, which is the failure the
stacking is meant to prevent — not a layout we should reach by squeezing.

## A control's furniture is not text

Stacking gives a field the full row, and on the deepest-nested screen that row
is 114px at 200% text. A `Select` whose chevron gutter is `pr-10` spends 80px of
it on the gutter and 32px on its left padding, and shows **nothing** of the
value. So the chevron and the gutter reserved for it are sized in **px**: they
are the control's own furniture, not text, and WCAG asks for text to scale. At
100% text the rendering is identical to the rem spelling.

This half of the criterion is **measured, not asserted**: `audit/reflow.mjs`
counts, in every case it already visits, each rendered text input and select
whose border box minus its own padding and border leaves less than one mono
character — and gates on that count being zero at 200% text. Sampled over ten
journeys × six Skins, 600 of 894 controls were cramped before; the gated sweep
reports **0 of 8,940** after.

## The guard, and what it cannot prove

[`reflow-policy.ts`](../../apps/web/lib/reflow-policy.ts) gains a third rule:
a length in an arbitrary grid track list — `7rem`, `5rem`, `120px` — is a
**rigid track**. Unlike the content-floored rule it needs no risky descendant,
because a rigid track is rigid whatever it holds; that is what makes it
decidable from a class string.

It reads the length **wherever it sits**, not in one spelling: `minmax(7rem,1fr)`
and `repeat(2,_7rem)` are the same 224px column at 200% text as a bare `7rem`,
and a guard that matched only the bare form would fail open on its own siblings.
Exactly one shape is exempt — `minmax(0, 7rem)`, whose *floor* is zero, so the
track gives the width up under pressure. That is the remedy for the one genuinely
tabular grid, the exercise history table, whose columns must align across rows;
everywhere else the remedy is this ADR's wrapping row. A track a breakpoint
variant introduces is flagged too, since at 320px no `sm:` is active anyway.

The registry ships **empty**, like ADR-0085's: every site the rule flagged was
fixed.

As ever the guard proves a pattern is absent, not that a page fits.
[`audit/reflow.mjs`](../../apps/web/audit/reflow.mjs) measures the rendered
result, and with this change its 200% ratchet is gone: both text sizes are now
gated the same way — **0 of 600 cases overflow at 100% text and 0 at 200%**, in
every journey, Skin, Mode and name fixture.

## Still open

The **authenticated 200% real-app check** the original finding asks for remains
unrun: a fixture at a doubled root font size is not a signed-in phone. And
**Chromium only** — WebKit is not installed in this container, so the two-engine
criterion stays half-met by declaration rather than by silence.
