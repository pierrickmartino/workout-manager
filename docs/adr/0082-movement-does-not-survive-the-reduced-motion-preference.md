# 0082 — Movement does not survive the reduced-motion preference

**Status:** accepted

A user who sets `prefers-reduced-motion: reduce` is telling the app that movement costs
them something — nausea, dizziness, or simply the inability to read past it. The app
honours that everywhere: no animation and no transition may move anything on screen once
the preference is set. Loading is where this mattered most, because a spinner, a sweeping
progress segment and a pulsing placeholder are exactly what a user stares at while
waiting, but the rule is not scoped to loading.

**Movement is what the preference is about.** A colour change moves nothing. A 150ms
hover tint or a cross-fade is not motion in the sense WCAG 2.3.3 and this preference
address, and cutting it would make the interface feel broken without helping anyone. So
`transition-colors` and `transition-opacity` are **exempt by rule**, and only utilities
whose property list can move something — `transition-transform`, `transition-all`, bare
`transition`, arbitrary lists naming `transform`/`translate`/`scale`/`rotate`, and every
`animate-*` — must be paired with `motion-reduce:animate-none` or
`motion-reduce:transition-none`. This exemption is a decision, not an oversight: a future
reader finding a button with a colour transition and no opt-out is looking at the rule
working, not at a gap.

**The preference is read in CSS, never in JavaScript.** The `motion-reduce:` variant
responds to a preference the user changes while the page is open, and it has no
server/client hydration story to get wrong — both properties a `matchMedia` read in a
component would have to re-earn. The one existing JavaScript read
(`ExerciseCatalogTaxonomy`'s drawer unmount delay) stays, because it needs a *duration*
rather than a style; nothing else may join it.

**The pairing is co-located.** The opt-out must sit in the same class string as the
movement it guards, so a reader of either sees both. A pairing split across sibling
arguments of `cn()` reads, at each site, as an unguarded animation.

## Enforcement

[`apps/web/lib/motion-policy.ts`](../../apps/web/lib/motion-policy.ts) holds the rule and
[`motion-policy.test.ts`](../../apps/web/lib/motion-policy.test.ts) sweeps every `.tsx`
under `components/` and `app/` in the existing `web` CI job. It reads the source with the
TypeScript parser rather than as text, so prose in a comment that happens to name a
utility is not a finding, and a bare `transition` token is read as a utility only inside
a `className` attribute or a class-builder call, where it cannot be English.

`MOTION_EXEMPTIONS` ships empty. An entry asserts that a specific animation must keep
running for someone who asked for less movement, so a written reason is a required field
rather than a comment. Unknown `animate-*` utilities fail closed, matching the token
treatment in ADR-0081: an author adding movement must say what happens to it under the
preference.

## Consequences

The guard is the only enforcement for transitions. The browser matrix's probe reads
computed `animation-name`, which is structurally blind to transitions, and a transition's
computed style is identical whether or not it would move — proving "nothing moved" in a
browser means driving each state change and sampling, which would cost more than it
establishes over a rule applied to the source. Animations keep their browser evidence in
the `motion` journey of
[`audit/resilience.mjs`](../../apps/web/audit/resilience.mjs).

That probe rejects any non-zero `animation-duration`, so the common
`animation-duration: 0.01ms` reduced-motion idiom does not satisfy it. Movement is turned
off, not sped up.

The generation progress bar changes shape rather than freezing. A stopped sweep segment
would rest at the left third of its track and read as a determinate "33% complete" — a
number generation cannot know, and the kind of invented precision this app refuses
elsewhere. Under the preference the fill spans the track at reduced strength: same box,
no movement, no implied progress. The track carries no `progressbar` role, because it has
no value to report; the `role="status"` region above it already announces the state.

## Rejected alternatives

**A global `@media (prefers-reduced-motion: reduce) { * { animation: none !important } }`.**
It fails closed for free, including for code not yet written, which is its real appeal.
Rejected because it hides the decision from the call site, cannot express the
colour/opacity exemption that makes the rule truthful, and would silently kill a future
animation that genuinely conveys state. A fail-closed guard buys the same coverage while
leaving the intent visible where the movement is declared.

**Governing every `transition-*`.** Uniform, and it needs no judgement at the call site,
but it would require an opt-out on 48 colour transitions that move nothing. A rule people
believe is over-broad is a rule people allowlist their way around, and the allowlist is
where real findings go to hide.

**Rendering components in the guard** rather than reading their source. The repo can
render TSX offline (`lib/form-accessibility.test.ts`), which would resolve `cn()` and
`cva` composition exactly. Rejected because a rendering guard only covers components it
enumerates, and the regression it must catch is movement added to a component that does
not exist yet.
