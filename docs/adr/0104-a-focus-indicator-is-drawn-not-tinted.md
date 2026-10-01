# 0104 — A focus indicator is drawn, not tinted

The Reference Atlas figure (`components/analytics/reference-atlas-figure.tsx`) makes each
muscle group a selectable SVG `<g>` with `role="button"` and `tabIndex={0}`, carrying
`outline-none` and no focus ring. Its `onFocus` handler sets the group `active`, which
changes the heat overlay's fill — so there *was* feedback, and that is what made it worth a
finding rather than a nit:

- it is a colour shift on an already-tinted shape, and the same shift the pointer hover
  produces, so it reads as "this is warm" rather than "this is where you are";
- a trained muscle is already tinted in the group hue at an intensity that encodes volume
  (ADR-0025), so the change is largest on untrained muscles and smallest on exactly the ones
  a reader is most likely to be navigating toward;
- it was the only signal a keyboard reader got while traversing ~20 regions, against
  `focus-visible:ring-2 focus-visible:ring-cyan` on every other interactive surface in the app.

## The ring is a third path

An `outline` is the usual answer and the wrong one here: engines differ on `outline` over SVG,
and where it does paint it traces the group's bounding box, not the muscle — a rectangle
across the torso for a shape that is nothing like a rectangle.

The audit suggested a `stroke` + `stroke-width` under `:focus-visible`, which is right, but
not on the overlay path: that path's stroke is an **inline style**, which no stylesheet rule
can override, and it is already carrying the selected and hovered states. So the indicator is
its own stroke-only copy of the region's paths — `fill: none`, `stroke: transparent`,
`stroke-width: 0` at rest — with one rule in `globals.css` painting it on focus:

```css
.atlas-region:focus-visible .atlas-region-ring {
  stroke: var(--color-cyan);
  stroke-width: 2;
}
```

Three details carry weight. `vector-effect: non-scaling-stroke` keeps the ring 2px **on
screen**: the figure is at most 220px wide across ~500 user units, so a scaled 2-unit stroke
would be under a pixel. `pointer-events: none` keeps the copy out of hit-testing, so the
region underneath stays tappable and the ring cannot swallow a tap. And the ring is drawn
*after* the overlay, so it is not dimmed by a heat fill painted over it.

The rule lives in the stylesheet rather than as call-site utilities for the same reason the
component already styles its strokes with CSS variables: one rule beside the figure's own
conventions, rather than four utilities repeated on every path of every region. `var(--color-cyan)`
re-tints per Skin, so the ring is the accent the rest of the app focuses with.

`outline-none` stays on the group, and is only defensible *because* the ring is drawn — which
is the pairing `REVIEW.md` already asks for everywhere else.

## What is held, and by what

[`lib/atlas-focus-ring.test.ts`](../../apps/web/lib/atlas-focus-ring.test.ts) answers two
different questions, deliberately apart:

- **The figure renders the ring** — asserted by rendering it. One ring per region path (so the
  indicator traces the whole muscle, not its first shape), carrying `aria-hidden` and **no
  inline style**, since an inline stroke is precisely what would put the ring back out of the
  stylesheet's reach. A non-interactive figure renders none, because nothing in it takes focus.
- **The stylesheet makes it visible on focus and invisible at rest** — asserted by reading
  `globals.css` (the `tapActionSelectors` idiom from ADR-0099), so the test holds the rule the
  app ships rather than a copy of the rule's text.

There is no sweep. A focus indicator is a property of a rendered surface, and the one general
guard that exists for this already passes: every other interactive surface pairs its
`outline-none` with a `focus-visible:ring-*`, and this was the one SVG exception.

**One claim neither half can make is that `:focus-visible` matches an SVG `<g>` at all**, and
that is the assumption the whole design rests on. The atlas figure is in no audit journey
(ADR-0088's hole, and the one surface here where the sweeps measure nothing new — the ring takes
no space and takes no taps), so it was checked by a **one-off Chromium probe, not a checked-in
harness**: the compiled stylesheet (`styles.css?direct` off the audit server) beside the
component's markup shape, reading `getComputedStyle` on the ring in three states.

| state | `:focus-visible` | ring `stroke` | `stroke-width` |
|---|---|---|---|
| at rest | no | `rgba(0, 0, 0, 0)` | `0px` |
| after `Tab` | **yes** | `rgb(41, 231, 224)` | **`2px`** |
| after blur | no | `rgba(0, 0, 0, 0)` | `0px` |

`pointer-events: none` and `vector-effect: non-scaling-stroke` compute throughout. The `2px` is
the on-screen width, confirming the non-scaling stroke, and the colour is PULSE's cyan resolved
from the token rather than written at the call site.

Whether the ring is *perceivable* against a heat-tinted muscle in all six Skins is still a
question for an eye on a screen — the contrast matrix (ADR-0081) covers text and fills, not
strokes over artwork.
