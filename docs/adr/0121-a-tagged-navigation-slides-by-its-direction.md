# 0121 — A tagged navigation slides by its direction

**Status:** accepted

The app is a hierarchy: list → detail → edit, with a back control that returns up a level. A
horizontal slide makes that depth readable: deeper arrives from the right, back from the left.
But not every navigation has a depth. Tab to tab is lateral, a query swap stays on the page,
and a server-action redirect is not a click at all. Those must not slide (view-transitions
audit §4).

## Decision

**One route transition, keyed on the pathname.** `components/RouteTransition.tsx` wraps the
page in the root layout:

```tsx
<ViewTransition key={pathname} default="none"
  enter={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" }}
  exit={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" }}>
```

- **Why it works from the layout.** A path change gives the boundary a new key, so React
  unmounts the old page's boundary and mounts the new one. Exit and enter fire, and the
  navigation's type picks the slide.
- **What stays instant.** An untyped navigation resolves to `none`. So does a query-only
  change, which keeps the key.
- **Why a layout wrapper is safe here.** The skill warns against a layout-level boundary
  because layouts persist and never fire enter/exit; the key is what makes this one fire. The
  root layout is the app's only layout, so the remount discards no layout state.
- **No page-level boundaries.** Pages must not add a page-level boundary of their own, because
  it would mount as a unit with this one and never fire. Named boundaries inside the page
  still pair: the sigil morph (ADR-0120) runs alongside the slide.

**A navigation is tagged by spreading a direction, never by writing one.**
`lib/nav-direction.ts` exports `NAV_FORWARD` and `NAV_BACK`, spread onto a `<Link>`. Each
carries `transitionTypes` for the router and a `data-nav-direction` attribute for the DOM.

- **`BackLink` spreads `NAV_BACK` once.** That covers every back control in the app.
- **Forward links are tagged one by one.** That covers the hierarchy in the audit's navigation
  map: Home hero, My Sessions card, Session detail → Live/Log/exercise/"Generate another",
  History → record/edit/repeat/capture, Protocol → Session/edit/exercise, Analytics →
  Strength/Metrics/new Session, Profile → edit/achievements/admin, Admin → catalog → exercise.
  `NavRow` takes an optional `direction`, because one of its rows (Analytics → History)
  crosses to another tab.
- **Untagged links stay instant.** That covers tabs, related exercises, the range and tab
  query swaps, and the catalog drawer (audit §5.4). Leaving a link untagged is the safe
  failure: it swaps the way it always has.

**The navigation guard keeps the direction.** On a dirty form, the guard intercepts the click
and confirms with `router.push`. Before this change, the push carried no type, so a guarded
Back would not have slid back (audit §7). The guard now reads `data-nav-direction` off the
intercepted anchor. `guardedNavigateOptions` turns it into the push's `transitionTypes`, so
Discard animates exactly as the same click on a clean form would. The attribute exists
because `transitionTypes` is a `<Link>` prop that never reaches the `<a>`.

**The slide is the skill's directional recipe.**

- The old page fades out in 150ms while the new one fades in over 210ms after a 150ms delay.
- Both travel 60px over 400ms: enough to read as direction without sweeping the screen.
- The persistent chrome stays pinned above it (ADR-0119), the root stays live (ADR-0120), and
  ADR-0118's off switch removes all of it under reduced motion.

## Enforcement

- `lib/nav-direction-policy.ts` reports any `transitionTypes` prop or property written in a
  component instead of spread from the registry. A typo there matches no key of the route
  transition's map and silently doesn't animate, and it would also skip the attribute the
  guard reads.
- `view-transition-boundary-policy.ts` (ADR-0120) already requires `default="none"` on the
  route transition and a stylesheet rule for each class it names.
- `nav-direction.test.ts` covers the registry and its own-property parse.
  `navigation-guard.test.ts` covers the guard carrying a direction through and dropping an
  unknown one.

## Consequences

The real `RouteTransition`, `SessionCard`, `WorkoutSigil` and `globals.css` were checked once
in Chromium through the `audit/` aliases, with a stubbed `usePathname` driven by
`startTransition` and `addTransitionType` the way the router drives it:

- **Forward:** the old page faded and slid out while the new one slid in, and the sigil
  morphed alongside.
- **Back:** the same, mirrored.
- **Untyped path change:** no animation.
- **Under `reduce`:** no animation.

The guard's confirmed push was covered only by its unit tests, not in a browser. Nothing ran
through the Next router itself, and no CI journey drives a navigation (audit §11).

The audit harness's `next/link` stub now drops `transitionTypes`, as `next/link` does.
Otherwise every journey would log React's unknown-prop warning.

Not covered here:

- **Browser back.** The browser back button and swipe-back carry no type and swap instantly.
  This app barely uses `router.back()`; its back controls are forward pushes to a `?from=`
  origin, which is why they can slide.
- **The Strength pager.** Its `Older →` / `← Newer` is an ordered sequence, not a hierarchy.
  It is step 5.

## Amendment: the rest of the navigation map (view-transitions audit, 10 Oct 2026)

The post-implementation audit
(view-transitions-2026-10-10, since removed,
VT-2 and VT-3) found hierarchical steps the first pass left untagged. Each is a direction
judgement, so the classification lives here rather than in a guard that forces a type on every
link.

**Now forward:**

- Protocol route stop → its Session (`pulse/training-route.tsx`).
- Strength trajectory tile → its exercise (`analytics/strength-trajectories.tsx`).
- Analytics' "See all records" teaser → Strength (`pulse/recent-records.tsx`). The direction
  is the caller's, through `teaserDirection`, like `NavRow`'s: Home renders the same teaser,
  where it crosses to another tab and stays untagged.
- Catalog drawer's Alternatives → `/exercises/[id]`. The drawer sits over the catalog list, so
  opening a movement is list → detail. This narrows "the catalog drawer" above: opening and
  closing the drawer is still not a navigation.
- Train hub → My Sessions, My Protocols, the catalog.
- The generation launchpad → `/protocols/new`, `/sessions/new`, `/sessions/build`,
  `/sessions/log`, on Train and on Home alike.
- History's and My Sessions' page actions → `/logs/new`, `/sessions/new`.

**Programmatic, after an action:** a `router.push` has no `<Link>` to spread onto, so it passes
`navigateOptions(direction)` from `lib/nav-direction.ts`. `guardedNavigateOptions` builds its
options through the same helper.

- Generation → the adopted Protocol: `nav-forward` (`lib/use-protocol-generation.ts`).
- Admin delete → the catalog: `nav-back` (`AdminExerciseDelete`).
- Live Session Finish → `/history`, and the save-then-`replace` of the log and authoring forms,
  stay instant. A replace is not a step in the hierarchy, and Finish lands on another tab.

**Left untagged, against the audit's suggestion:**

- An Achievement's "Open the logged session" (`pulse/stamp-detail.tsx`). The record sits in
  History, a related place rather than a level deeper; the component already says so.
- The exercise page's related-movement list (`exercise/specs-panel.tsx`). Exercise to
  exercise is lateral: these are the "related exercises" above.
- My Sessions' empty-state "start something new in Train" link, which goes up a level, not down.

## Rejected alternatives

**A `DirectionalTransition` in each page component**, the skill's default. It is about 28
edits, and a new page that forgets the wrapper silently doesn't animate. The keyed layout
boundary covers every page, including ones not written yet.

**`template.tsx`.** The root template remounts per top-level segment, so `/sessions` →
`/sessions/1` would not remount it. Templates per level would nest boundaries that mount as a
unit, and those don't fire.

**Defaulting untagged navigations to forward.** `default` is also what a revalidation or a
redirect resolves to, so everything would slide.
