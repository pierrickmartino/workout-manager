# 0123 — A skeleton dissolves; the header stays live

**Status:** accepted

Every route skeleton (`loading.tsx`) is layout-matched (ADR-0028). When a route's data
resolves, the skeleton is replaced in one frame by the real content, block for block. That
swap is the reveal the view-transitions audit (§6) asks to animate. The audit also names the
trap: each skeleton renders the real `PageHeader`, so a reveal that fades the whole fallback
would fade the header over itself.

## Decision

**Exit only: the skeleton fades off over content that is already there.** The root is live
(ADR-0120). When the Suspense boundary resolves, the real content is painted underneath at
once and doesn't animate. The skeleton's snapshot fades off on top of it over 250ms, opacity
only (`skeleton-out`). The skill's recipe also slides the content up from below, but that
would need a boundary in each of the 15 `page.tsx` files and in every early return they make.
Dissolving the placeholder into what it stood for reads as the same reveal.

**The header stays out of the reveal.** `components/pulse/skeleton-reveal.tsx` provides:

- **`SkeletonPage`**, which every route skeleton now returns. It renders the header as a
  plain sibling, so the header lands in the live root and is replaced instantly by the page's
  identical header. It renders the data region inside `SkeletonReveal`, with a `mt-N` that
  reproduces the page's `gap-N`, so the layout is unchanged.
- **`SkeletonReveal`**, the boundary on its own:
  `<ViewTransition exit="skeleton-out" default="none">`. It is a plain class, not a type map,
  because a Suspense resolve is a transition of its own and carries no type. The in-page
  boundary on Session detail (ADR-0120) uses it directly, since its fallback has no header.

**The root is a fragment, on purpose.** A boundary below a DOM node that unmounts with it
never fires exit. With a `<section>` root around the reveal, nothing would animate. With a
fragment, the reveal's parent is Next's own container, which outlives the fallback.

**It covers all 15 route skeletons, not the audit's seven.** The other eight have the same
shape. The guard would otherwise need an exemption list that says nothing true.

**What doesn't animate:**

- **A skeleton that unmounts because the reader navigated away.** It goes with the route
  boundary of ADR-0121, which suppresses it, so only the route slide runs.
- **The two `fallback={null}` boundaries on History and My Sessions.** There is nothing to
  reveal from. The audit says to leave them, and this does.

## Enforcement

`apps/web/lib/skeleton-reveal-policy.ts`, swept under `npm test`:

- Every `app/**/loading.tsx` returns a `SkeletonPage` at its root. A skeleton returning
  anything else would simply never reveal, and nothing else would notice.
- No `PageHeader` sits inside a `SkeletonReveal`, anywhere in `components/` or `app/`.

`view-transition-boundary-policy.ts` (ADR-0120) holds the boundary to `default="none"` and
requires `skeleton-out` to be styled. ADR-0118's off switch removes the fade under reduced
motion.

## Consequences

Checked in Chromium with the real `RouteTransition`, `SkeletonPage`, `PageHeader` and
`globals.css`, and a `<Suspense>` whose data was released by hand:

- **Navigating in:** no animation from the skeleton.
- **The data resolving:** one animation, the skeleton's 250ms fade.
- **Leaving while the skeleton showed:** only the route slide ran.
- **Under `reduce`:** none of it.

**The header is pixel-identical mid-reveal.** At 3× scale, with the fade frozen halfway, the
header region was pixel-identical to the settled frame (0 of 181,440 pixels changed), while the
skeleton region was still mid-fade. The first version wrapped the whole fallback, header
included. It changed 8,342 header pixels: an identical snapshot composited over live
anti-aliased text visibly thickens the strokes. That is why the header is kept out, and why
the guard rejects a header inside a reveal.

**Route slides are unchanged.** With a fragment root, a skeleton that slides as part of a
route transition (ADR-0121) does so as two groups, the header and the data region, moving in
step.

Nothing here ran through the Next router or the running app, and no CI journey drives a
navigation (audit §11).

## Rejected alternatives

**Fading the whole fallback, header included.** Measured above: the header text thickens for
the length of the fade.

**Pinning the header with a shared `view-transition-name` in both skeleton and page.** The
pair would morph between two snapshots of the same header, which is the opacity dip the audit
describes. It would also need a name in all 15 pages.

**The skill's two-sided reveal**, with the skeleton exiting and the content sliding up. It
needs a content boundary in every page and in each early-return path. Those are easy to miss,
and nothing in the content's own shape tells the guard which region is the data.
