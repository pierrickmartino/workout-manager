# 0099 — Every tap target answers the first tap

`touch-action` appeared nowhere in `app/`, `components/` or `globals.css`.

On a touch browser that means every button, link and field in the app carries the
double-tap-zoom delay: the browser receives the tap, then waits to see whether a
second one is coming before it dispatches the click. It is ~300ms, it is on every
tap, and this is a PWA whose central screen is a Live Session logged between
efforts with one thumb.

So one rule in `@layer base`:

```css
a, button, summary, input, select, textarea, [role="button"] {
  touch-action: manipulation;
  -webkit-tap-highlight-color: color-mix(in srgb, var(--color-cyan) 20%, transparent);
}
```

## `manipulation` gives up one gesture, not zooming

`touch-action: manipulation` disables double-tap zoom **on these elements** and
nothing else: panning and pinch-zoom still work, there and everywhere. The page
stays zoomable, which is the accessibility question that matters (the viewport sets
no `user-scalable=no` either — see the audit's *Verified clean*).

It is in the base layer, so a utility still wins. The @dnd-kit drag handles that
spell `touch-none` keep `touch-action: none` and their touch drags are unaffected.

## The tap highlight is set, and not to `transparent`

The platform default is an untinted grey box that belongs to no Skin and is close to
invisible in a dark Mode. The usual remedy — `-webkit-tap-highlight-color:
transparent` — is only safe beside an `:active` state of one's own, and this app
styles `:hover` and `:focus-visible` but not `:active`. (`:hover` is unreliable on
touch: it is synthesized, often sticky, and sometimes not applied at all.)

Removing the highlight with nothing behind it would leave a tap unacknowledged until
the next screen paints, which is the opposite of what this ADR is for. A soft accent
wash re-tints per Skin, reads as the app's own, and still answers the finger.

## The guard

[`lib/tap-target-policy.ts`](../../apps/web/lib/tap-target-policy.ts) watches the two
ways this stops being true.

`tapActionSelectors` returns the selector list the stylesheet actually declares, so
the test holds it against the native controls rather than against a copy of the
rule's own text. It returns `[]` when nothing declares `touch-action: manipulation`,
which is a finding and not a pass — a sweep against an empty covered set would
otherwise accept everything.

`findUncoveredTapTargets` sweeps every component and page for an ARIA widget role on
an element no selector reaches, which is the usual way a tap target escapes a rule
written in element names. Roles that name a region or announce something (`alert`,
`status`, `group`, `img`, `dialog`) are read, not tapped, and are not its business.

A role written on a component tag is resolved through a one-entry map — `next/link`
renders an `<a>`, so `<Link role="tab">` is covered — and **anything else capitalized
is reported**. What a component renders is not decidable from its call site, and
guessing is the one answer that would hide a `<div>` behind a friendly name.

What neither proves is that a tap *feels* immediate. That is a property of a device
and a browser, and no offline test can see it.

## Consequences

- A new interactive surface is a native control, a `[role="button"]`, or it extends
  the base rule; the sweep decides which, not a reviewer's memory.
- A control that genuinely needs a custom gesture states `touch-none` (or its own
  `touch-action`) as a utility at the call site, where it outranks the base rule and
  is visible in the diff.
