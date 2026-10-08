# 0122 — The Strength pager turns a page

**Status:** accepted

`/analytics/strength` pages its Personal Record timeline with `← Newer` and `Older →`, which
set `?offset=`. It is the app's one ordered sequence, where direction carries position. The
view-transitions audit (§7) calls it the one place a directional slide is unambiguously
right.

ADR-0121's `RouteTransition` cannot animate it. That boundary is keyed on the pathname, and
the pager changes only the query, so the boundary stays mounted and never fires enter or exit.

## Decision

**A boundary keyed on the page, around the records only.**
`components/analytics/timeline-page-transition.tsx` wraps the Personal Records card in
`<ViewTransition key={offset} default="none">`, with the same `nav-forward` / `nav-back` map
as the route transition.

- **Which records move.** Each page turn exits the old page of records and enters the next.
  The section heading, the pager and the charts above stay put.
- **Which way they move.** `Older →` spreads `NAV_FORWARD`, so the next page arrives from the
  right. `← Newer` spreads `NAV_BACK`, so it arrives from the left.
- **When they don't move.** A revalidation, or a first load, has no type and doesn't move.

**The sequence reuses the hierarchy's types.** Both mean the same thing on screen: new
content arrives from the right, or from the left. A second pair of types would add classes,
registry entries and a guard path without any visible difference. The stylesheet's comment
says `nav-forward` covers "deeper" and "next".

**`loading.tsx` stays.** A shared morph needed its route skeleton removed (ADR-0120), because
the destination must be on screen when the navigation commits. A page turn doesn't need that,
and the reason is in Next's layout router. The segment's `LoadingBoundary` is a plain
`<Suspense>` inside a `TemplateContext` keyed by `createRouterCacheKey(segment, true)`, which
leaves out search params. So an `?offset=` change re-renders into an already revealed
boundary. Inside a navigation's transition, React keeps the current records on screen instead
of showing the fallback, then commits the next page together with the pager's type. Entering
the page from Analytics is a new segment and still shows the skeleton.

## Enforcement

No new guard. The existing ones cover it:

- `view-transition-boundary-policy.ts` holds the boundary to `default="none"` and to classes
  that are styled.
- `nav-direction-policy.ts` holds the pager links to the registry spreads.
- ADR-0118's off switch removes the slide under reduced motion.

## Consequences

The real `RouteTransition` and `TimelinePageTransition` were checked once in Chromium through
the `audit/` aliases, holding the path and changing the offset:

- **Older:** the old page of records slid out and the new one slid in.
- **Newer:** the same, mirrored.
- **Untyped change or revalidation:** no animation, and the route transition did not fire.
- **Under `reduce`:** no animation.

That the App Router keeps the old records on screen until the next page is ready rests on the
layout-router source read above. It was not observed in the running app, and no CI journey
drives a navigation (audit §11).

**Scrolling is unchanged.** The pager links keep `next/link`'s default scrolling, which may
move the viewport during a page turn. If that fights the slide on a phone, `scroll={false}` on
the two pager links is the follow-up. It changes behaviour beyond animation, so it isn't made
here.

The last page usually holds fewer records, so the pager below it shifts up as the shorter
card arrives. That shift is the same as before the slide.
