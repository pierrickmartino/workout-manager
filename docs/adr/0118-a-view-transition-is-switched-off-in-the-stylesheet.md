# 0118 — A view transition is switched off in the stylesheet

**Status:** accepted

ADR-0082 says no movement survives `prefers-reduced-motion: reduce`. Its guard,
`motion-policy.ts`, reads Tailwind class strings in `.tsx` files. A view transition
moves in places that guard cannot see:

- **The browser's default.** Once a `<ViewTransition>` runs, the browser cross-fades the
  root and morphs every named element from its old box to its new one. No CSS of ours is
  involved, so no class string carries the movement.
- **`::view-transition-*` rules.** The slide and reveal recipes the adoption plan uses
  (view-transitions audit §10) are `@keyframes` and pseudo-element rules in
  `app/globals.css`. They aren't Tailwind utilities, they aren't in a `.tsx` file and
  they aren't in a `className`.
- **Callbacks.** `<ViewTransition onEnter={…}>` hands the caller the pseudo-elements to
  animate with the Web Animations API. No stylesheet can cancel that animation.

Without this ADR, the first `<ViewTransition>` would add movement that no guard covers,
and CI would stay green.

## Decision

**One off switch, in the stylesheet, before any view transition exists.**
`app/globals.css` carries, in `@layer base`:

```css
@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(*),
  ::view-transition-image-pair(*),
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation: none !important;
  }
}
```

Under the preference a navigation swaps instantly, the way it did before view
transitions. As ADR-0082 requires, the movement is turned off, not sped up.

- **`!important`** because a later `::view-transition-old(.slide)` is more specific than
  `(*)`.
- **`@layer base`** because an important declaration in an earlier layer beats one in a
  later layer or in no layer. The switch is therefore the strongest important rule the
  stylesheet can hold.
- **The whole transition goes, cross-fade included.** ADR-0082 exempts opacity, but a
  view transition's root fade can't be kept without also keeping the group's morph,
  which is movement, except by per-pseudo rules each later step would have to get right.
  A navigation fade conveys no state, and the instant swap is what the app did before
  this work. The trade costs nothing and keeps the rule to one line.

**Movement stays in CSS.** A `<ViewTransition>` doesn't take `onEnter`, `onExit`,
`onUpdate` or `onShare`. They exist to run imperative animations, and the only way to
make those honour the preference is to read it in JavaScript, which ADR-0082 rules out.

## Enforcement

[`apps/web/lib/view-transition-motion-policy.ts`](../../apps/web/lib/view-transition-motion-policy.ts),
swept by its test under `npm test`, fails closed on three things:

1. **The switch is whole.** `offSwitchGaps` parses `app/globals.css` with PostCSS and
   reports each of the four pseudo-elements that no `animation: none !important` reaches
   inside a reduced-motion query. It runs unconditionally, because the browser's default
   moves with no CSS of ours. A `0s` duration, a missing `!important` or a rule outside
   the media query all count as gaps.
2. **Stylesheet movement is reachable.** Across every `.css` file under `app/` and
   `components/`, an `animation` or moving `transition` must sit either on a
   `::view-transition-*` pseudo-element (the switch reaches it) or inside
   `@media (prefers-reduced-motion: no-preference)` (the stylesheet spelling of
   `motion-safe:`). A transition counts as movement unless every property it names
   only changes colour, opacity or shadow. That is the same exemption ADR-0082 makes,
   but the list is closed, so an unfamiliar property fails. The guard also rejects
   movement declared under `reduce`, an `!important` view-transition animation that
   could outrank the switch, and an `@apply` of a moving utility without its pairing.
   `@keyframes` bodies are ignored, because a keyframe moves nothing until a rule
   applies it.
3. **No callback.** `findViewTransitionCallbacks` reads each `.tsx` file's AST and
   reports any of the four callback props on a `ViewTransition` element.

`STYLESHEET_MOTION_EXEMPTIONS` ships empty, and an entry needs a written reason.

## Consequences

The switch was checked in Chromium. A `document.startViewTransition` over a named
element with a `slide` class runs the browser's group morph, its fades and the slide
under `no-preference`, and runs no animations under `reduce`. The switch still wins
when the slide is declared unlayered and `!important`. This was a one-off probe, not a
journey. The audit's §11 gap still holds: no offline sweep drives a navigation, so
nothing in CI watches a view transition run.

The guard proves the switch is *declared*. It cannot prove that the steps building on
it look right, which needs the navigation harness the audit asks for before the sigil
morph (step 3).

## Rejected alternatives

**`animation-duration: 0s !important`**, the recipe in the `vercel-react-view-transitions`
skill. It still runs every animation, just instantly, so each one still starts, ends and
fires its events. ADR-0082 settled that movement is turned off, not sped up. `none` is
the spelling of off, and it is also what the guard can check without judging durations.

**Gating `<ViewTransition>` on `matchMedia` in a component.** It reads the preference in
JavaScript, has a hydration story to get wrong, and leaves the browser's default
animation to whichever boundary someone forgot to gate.

**Extending `motion-policy.ts`.** That guard is a TSX class-string reader by design
(ADR-0082). A stylesheet needs a CSS parser, and the callback rule needs no class
strings. Folding the two together would make one module answer two unrelated questions.
The shared parts, `parseClassToken` and the utility classifiers, are imported, not
copied.

## Relation to ADR-0082

This ADR narrows ADR-0082's rejection of a global rule. ADR-0082 rejected
`* { animation: none !important }` because it hides the decision from the call site. A
view transition has no call site to hide it from: the browser's default animation is
declared nowhere in our source. The switch is scoped to `::view-transition-*`, so it
can't silently kill a component animation that conveys state, which was the other half
of that objection.
