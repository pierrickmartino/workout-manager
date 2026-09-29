# 0086 — An accent tint a component mixes itself is an undeclared pairing

ADR-0081 guarantees the *declared* text-on-fill pairings: five Accents on their
own `-dim` fills, and the on-accent label on the cyan primary-button fill. A call
site that writes `bg-cyan/15` instead mixes a fill of its own, and nothing
measures it. Cyan text on that fill renders at **4.42:1** in Vercel Light, below
the **4.6:1** Contrast Floor. Fourteen call sites carried such a tint.

So the Contrast Floor binds on **declared fills**, not only on declared tokens:
an accent used as a background at a call-site alpha is either a pairing this
project has measured, or a fill that carries no text at all. ADR-0083 deferred
this deliberately — it is a *pairing* question (which text on which tint), not
the foreground-alpha question that record answers — and
[`accent-tint-policy.ts`](../../apps/web/lib/accent-tint-policy.ts) now enforces
it in the existing `web` CI job. It reproduced all twenty-two violations before
the fix and reports none after.

## The dim fills have no headroom beneath them

ADR-0081 derived each Accent to land just above the Floor on its own `0x1f`
(≈12%) tint: PULSE Light cyan reaches 4.62 there, and the tightest variant is
4.61. A deeper tint therefore cannot clear the Floor under the same accent text,
and the measurements say so — cyan on a 15% cyan tint is 4.42, on 20% it is 4.08,
and magenta on a 20% magenta tint is 3.98. **There is no deepened chip.** A
hover state that wants to intensify must move the border, ring or text, which is
already the idiom the neighbouring pills use; the four call sites that deepened a
fill on hover now strengthen their border instead.

The one alpha that survives runs the other way. The primary button's
`hover:bg-cyan/90` fades a *solid* accent fill toward its surface, and its
on-accent label still reads at 4.87:1. That pairing is declared with its alpha
rather than removed, which is what the `alpha` field on a declared pairing is
for.

## A container wash is not measurable, at any alpha

Five call sites tinted a *container* — three states of a superset box, a
composition bracket, a grouped field set — whose text arrives from descendants
that one class string cannot see.
It is tempting to declare those tints against every text token instead, so that
whatever lands inside is safe. That fails at every alpha worth painting: on a
3% cyan wash `text-muted` measures 4.34:1, and on a 5% wash 4.15:1. The Text Ramp
is tuned close enough to the Floor that *any* accent wash costs it its margin.

Those washes are therefore removed rather than declared. Each box already carries
its border, its ring and its cyan label; at 3–5% the wash was below the threshold
of a deliberate signal and above the threshold of a contrast defect.

## Colours from the component side

`assertTokenClassification` iterates the tokens a Skin *declares*, so a colour
the token system had never heard of could reach a component untouched. Three had:

- `--color-danger` — `hover:border-danger/60 hover:text-danger` on the builder's
  remove-session button. No Skin declares it, so Tailwind emits no rule and the
  hover feedback did nothing. It now uses `magenta`, the accent every Skin's own
  palette comment already names as its danger colour, matching the delete control
  in the logbook.
- `--color-bg-primary` — `text-bg-primary` on two labels sitting on a solid cyan
  fill. With no rule emitted, each label inherited its ancestor's colour on an
  accent fill. Both now use `on-accent`, which is exactly the declared pairing for
  that fill.
- `--color-bg` — `ring-offset-bg` on two focus rings, which fell back to
  Tailwind's default offset colour instead of the Skin's `base`. Both now use
  `ring-offset-base`, as the button primitive already did.

The guard therefore checks colours from the component side too: every colour a
`bg-`, `border-`, `ring-`, `text-` or sibling utility names must be one the Skins
declare, or one of the five universal CSS colours (`transparent`, `current`,
`inherit`, `black`, `white`) that belong to no Skin. Each prefix is overloaded —
`border-2` is a width, `border-dashed` a style — so the non-colour forms are
spelled out and anything else is treated as a colour and must be declared.
Unknown colours fail closed, as in ADR-0081 and ADR-0083.

## What pairs with what

A fill pairs with the text in the same class string, and only when the two can
render in the same state: a bare utility applies always, so it pairs with
anything, while two differently-qualified utilities need not ever meet. A
disabled control is never hovered, so its muted label and a hover fill are not a
pairing, and demanding one would be a false failure — a guard that cries wolf
teaches people to register exemptions mechanically.

A tint with no text beside it fails closed, because text can still reach it from
a descendant. The way out is a declared fill, or the graphic registry below — not
an exemption.

## Graphic fills are a claim, and carry a reason

`GRAPHIC_FILLS` holds the accent tints that carry no text at all: the Training
Heatmap's three tinted density steps and the generation progress track's
reduced-motion segment. Nothing there is measured against the Floor, because the
Floor governs text and these are graphical objects under WCAG 1.4.11. Every heat
cell is an empty `<span>` whose day reaches every user as an `aria-label`, a
`title` and the mirrored caption; the progress bar is an empty `aria-hidden`
`<div>` whose state the `role="status"` region above it announces (ADR-0082).
Both are claims about a specific call site, so each entry carries a required
reason and a test asserts the call site still exists.

## Scope, and what is deliberately outside it

**Translucent chrome stays the browser harness's job**, as the issue that raised
this required be said out loud rather than quietly omitted. `bg-surface/95` on
the tab bar, `bg-base/40` behind a table head, `bg-black/60` under a sheet:
twenty-eight such fills composite against whatever scrolls beneath them, which is
not statically decidable. The guard **classifies** them `harness` rather than
skipping them, and a test asserts that classification covers exactly the surface
and universal colours and never an accent — so the boundary is enforced, not
assumed. Listing them as exemptions in a static registry would be false
assurance, the same reason ADR-0083 gives for ancestor fades.

**Blue still has no dim fill.** `bg-blue/15 text-blue` was the one hand-rolled
tint with no declared token to move to — and a failing one, at 3.77:1. Measured
on a 12% blue tint, blue clears
the Floor in five variants and fails in seven (3.92 in Aurora Light, 3.93 in
Track Light, 3.95 in PULSE Dark and Clay Light, 3.99 in PULSE Light, 4.06 in
Alpine Light, 4.32 in Vercel Light), so declaring `blue-dim` means retuning blue
across seven Skins for a single navigation tile. ADR-0081 already decided blue is
not a chip accent; that tile now uses the neutral `elevated` fill and keeps its
blue icon, which ADR-0081's flat guarantee covers.

## Rejected alternatives

- **Sweep every alpha and lower the ones that fail.** The alpha sweep #567 named
  and rejected. It cannot work: the dim fills are already at the Floor, so the
  only passing alphas are ones nobody would paint, and it answers the wrong
  question — which text sits on the tint, not how much tint there is.
- **Declare each call-site alpha as its own pairing.** Would have kept all
  fourteen tints by adding nine entries spanning 6% to 20%. It measures them
  honestly, but it makes the registry a transcript of whatever authors happened to
  type, and five of the nine would have been declared *failing*.
- **Declare container washes against every text token.** The fail-closed answer
  for descendants, and the one this record would have preferred. The measurements
  refuse it: `text-muted` fails on a 3% wash.
- **A second dim token per accent for hover.** ADR-0081 rejected a parallel Accent
  family for the cost of the values it adds; this would add twelve more for a
  state a border already expresses.
- **Walk the JSX tree to find a container's descendants.** Decides one file and
  loses at the first component boundary, which is exactly where the superset box
  puts its text. A guard whose coverage depends on how a tree was factored is
  worse than one whose boundary is written down.
- **Keep `danger` and declare it as a Skin token.** Six new values for one
  affordance, in a palette where every Skin's own comment already calls magenta
  its danger colour.
