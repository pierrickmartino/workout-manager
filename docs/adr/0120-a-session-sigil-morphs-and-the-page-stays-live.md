# 0120 — A Session's sigil morphs; the page around it stays live

**Status:** accepted

The Workout Signature sigil is deterministic in the Session id, and the component says it is
"identical across surfaces". It is the one real shared element in the app
(view-transitions audit §5.1). When a reader taps a Session on My Sessions or the Home hero,
the sigil they tapped can travel to the same mark on the detail page. That continuity is the
claim the sigil exists to make.

## Decision

**One name per Session, claimed by at most one surface per page.** `WorkoutSigil` takes an
optional `morphSessionId`. When it is set, the mark is wrapped in
`<ViewTransition name={sigilTransitionName(id)} share="sigil-morph" default="none">`. The
claiming surfaces are:

- **The Session detail page.** It always claims.
- **The My Sessions row.** `SessionCard` claims only with `claimsSigilMorph`, and
  `SessionLibraryRow` passes it. Train's Recent panel doesn't: its card has no detail link,
  and keeping the claim opt-in means a page that renders the same Session twice can't
  collide by accident. Two mounted boundaries with one name break the morph.
- **The Home hero, for a real Next Session only.** When a Protocol has no Next Session the
  sigil's seed is the Protocol id. That isn't a Session id and could equal one, so it never
  claims.

`default="none"` means the mark doesn't animate on a revalidation, a list filter or a rename.
It moves only when its pair forms across a navigation. The `sigil-morph` group runs at 400ms,
the shared-element pace, slower than a page change so the eye can follow it.

**The root is live.** `::view-transition-old(root)` is hidden and `::view-transition-new(root)`
doesn't animate. Otherwise a morph would also cross-fade the whole unnamed page. The page now
swaps instantly, as it did before view transitions, and stays interactive while only the sigil
moves. Page motion (step 4) is opted into by name, never inherited from the root.

**The detail page renders its header first.** A shared morph pairs only if the destination's
sigil is in the DOM when the navigation commits. `/sessions/[id]` had a route-level
`loading.tsx`, so a cold navigation committed the skeleton, which has no sigil, and the pair
could never form. The route-level skeleton is gone:

- The page renders after the one Session read: header, sigil, controls, the PROTOCOL heading,
  and Start/Log.
- Only the prescription cards, which wait on the per-movement harder-variation fan-out, sit
  behind an in-page `<Suspense>`. Its fallback is one card skeleton per movement, so nothing
  shifts when the cards arrive.
- `/sessions/[id]/log` used to inherit the deleted boundary and now has its own `loading.tsx`.
  That skeleton also matches the log page, which the inherited one didn't.

The owner chose this over full-route prefetching (every visible row would render a detail on
the server) and hover-intent prefetching (no lead time on a phone).

## Enforcement

`apps/web/lib/view-transition-boundary-policy.ts`, swept under `npm test`:

- Every `<ViewTransition>` under `components/` and `app/` declares `default="none"` as a
  literal. A bare boundary cross-fades on every server action, and nearly every Transition in
  this app is one (audit §2). `BOUNDARY_EXEMPTIONS` ships empty, and an entry needs a reason.
- A boundary with a `name` declares `share`, or the morph silently resolves to none.
- Every class a boundary names, including each value of a type-keyed map, is styled by a
  `::view-transition-*(.class)` rule in `app/globals.css`, so a typo can't fall back to the
  browser's default.
- `liveRootGaps` holds `globals.css` to both live-root declarations.

`sigilTransitionName` is unit-tested in `workout-sigil.test.ts`. ADR-0118's off switch
already covers the morph under reduced motion.

## Consequences

Checked in Chromium with the real `SessionCard`, `WorkoutSigil` and `globals.css`, mounted
through the `audit/` Vite aliases and driven with `startTransition`:

- List → detail and detail → list each ran one animation group, `session-sigil-<id>` at
  400ms, while the root ran no visible animation.
- Growing, shrinking and re-rendering the list started no view transition at all.
- Under `reduce`, the transition started but nothing animated.

This was a one-off probe, not a journey, and it ran through React, not the Next router. That
the App Router commits the detail header in the navigation's first render after dropping
`loading.tsx` follows from how Next handles a segment with no loading boundary, but it was
not observed in the running app, which needs Clerk keys. The audit's §11 gap still holds.

Costs:

- **The tap waits.** A tap on a Session now keeps the old page on screen for one Session read
  instead of showing a skeleton at once. A pending indicator on the link (`useLinkStatus`)
  would cover it, and is left for later.
- **No reverse morph to Home.** Detail → Home still lands on Home's own `loading.tsx`, so the
  reverse morph to the hero won't pair. Detail → My Sessions can, because `/sessions` has no
  route-level skeleton.

The audit's `/train` collision no longer exists: `/train` renders only the Recent panel, not
the library. The opt-in claim is kept so it can't come back.

## Rejected alternatives

**Putting the named boundary inside `SessionCard` unconditionally.** This is the
reusable-component trap the skill warns about. Any page that rendered the card in two places
would break the morph for that Session.

**Leaving the root's cross-fade on.** Every morph would fade the full page under the sigil,
and freeze it behind a snapshot, for the 400ms the sigil moves.

**A sigil in the route skeleton.** `loading.tsx` receives no params, so it can't know which
Session's mark to draw.
