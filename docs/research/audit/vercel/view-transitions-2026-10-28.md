# Vercel React view transitions audit: `apps/web`, 28 October 2026

**Audit date:** 28 October 2026. **Reviewed main:** `1bd31f4`. **Skill:**
`vercel-react-view-transitions` (`.claude/skills/vercel-react-view-transitions/`).

**Context.** This is the second post-implementation audit.
- The view transitions shipped as ADR-0118 to ADR-0124.
- The 10 October audit (`ccc893d`, removed from the tree in `2d528a2`; read it with
  `git show 2d528a2^:docs/research/audit/vercel/view-transitions-2026-10-10.md`) found
  VT-1 to VT-4. **VT-1 to VT-3 are fixed** (`d604f5f`, recorded in the ADR-0121 amendment).
  **VT-4** (verification in the running app) is still open and tracked in `TASKS.md` §11.
- Since then, 121 commits have changed `apps/web`, adding 45 components and 6 routes:
  the Curated Protocol flow, the AI audit log, the Avatar picker, Session plan editing, the
  History month view (ADR-0138) and the facet rails. This audit checks the new surface
  against the skill and the ADRs, and re-checks the old one for drift. New findings are
  numbered from VT-5.

**Method.**
- Listed every `<ViewTransition>` (6 components, unchanged), every file that imports `next/link`
  (52), every `router.push` / `router.replace` (11) and every `<Suspense>` (6), and
  classified each navigation added or changed since `d604f5f` against the ADR-0121 map.
- Read the new routes' `loading.tsx` files and the pagers, and checked the persistent
  chrome for new elements.
- Ran the view transition guards: `view-transition-*`, `nav-direction*`,
  `persistent-transition*`, `skeleton-reveal*` and `navigation-guard` tests.
  **76 of 76 pass.**

All findings are from reading the code. Nothing was watched in a browser; that is still
VT-4.

## Summary

The new surface mostly follows the rules without being told to: the AI audit log's pager
reuses the page-turn boundary (ADR-0122), and every new `loading.tsx` returns `SkeletonPage`.
The new Session-edit, Avatar and Curated-detail links are typed, and every new back control
is a `BackLink`. The findings are a few **unclassified links** and **one ordered sequence that
doesn't turn**. One deferred decision is now due:

| ID | Finding | Pattern | Impact | Effort |
| --- | --- | --- | --- | --- |
| VT-5 | Home's quick actions are untyped, while the launchpad and hero on the same screen slide forward to the same places | Route change (ADR-0121) | Low-medium (inconsistency) | XS |
| VT-6 | The Protocol builder's only way back (`CANCEL — DISCARD CHANGES`) is untyped: the builder slides in, then swaps out instantly | Route change (ADR-0121) | Low | XS |
| VT-7 | `/protocols/new` and `/protocols/new/curated` are siblings going in, but a parent and child coming back | Route change (ADR-0121) | Low | XS (a decision) |
| VT-8 | The History month arrows step through an ordered sequence but swap instantly, while the app's two other same-path pagers turn a page | Ordered sequence (ADR-0122) | Medium-low | S |
| VT-9 | The 10 October audit deferred list-identity animations on History "until V-1 windows the list". ADR-0128 and ADR-0138 have done that, so the decision is due | List identity | Low | S (a decision, then S) |

**Carried, not duplicated:**
- **VT-4:** nothing drives a real navigation in the running app (TASKS §11). VT-5 to VT-8
  should be checked by the same journey.
- **Perf audit V-10** ([react-best-practices 2026-10-28](react-best-practices-2026-10-28.md#v-10-dynamic-routes-with-no-loading-boundary-medium)):
  14 routes have no `loading.tsx`, so they have no skeleton to dissolve (pattern 2). The
  three `/history/[id]/*` routes dissolve from the History *list* skeleton, which is the
  wrong shape for a detail page. Fixing V-10 fixes the reveal too.

## Checked against the skill: what is right

| Skill rule | How the app meets it now |
| --- | --- |
| Reduced motion always | ADR-0118's off switch is unchanged. `view-transition-motion-policy.ts` passes. |
| Persistent elements isolated | Still four (`header`, `tabBar`, `sidebar`, `syncToast`). The new header Avatar sits inside the pinned header, so it needs no entry of its own. The sidebar's new nested admin entries are inside the pinned sidebar. |
| Shared element (priority 1) | The sigil morph is unchanged: three surfaces, one claim per page. The new Session-edit page has no sigil, so there is no pair and the sigil leaves with the page slide, which is the documented fallback. |
| Route change, type-keyed | One `RouteTransition` keyed on the pathname. New typed links include Session detail → edit, Profile → Avatar, Curated picker → detail, the AI audit log's row and table links, and the admin dashboard tiles. Every new back control is a `BackLink`. |
| Ordered sequence slides by position | The AI audit log pager (`GenerationCallPager.tsx`) wraps its list in `TimelinePageTransition` keyed on the page, with `Older →` as `NAV_FORWARD` and `← Newer` as `NAV_BACK`, exactly as ADR-0122 does for Strength. |
| Suspense reveal uses plain strings | The new `loading.tsx` files (`/admin/ai-audit-log`, its `[id]`, `/profile/avatar`) return `SkeletonPage`. `recent-sessions-panel.tsx` streams with `fallback={null}`, which the policy allows. |
| Lateral navigation not directional | `NewProtocolChoices` is deliberately untyped ("siblings, not a drill-down"), as are the tab bar, sidebar, exercise tabs and the catalog's "Add to Protocol" jump across the hierarchy. |
| Programmatic navigation | The Live Session Finish → `/history` and the save-then-`replace` of the three new hand-authored forms stay instant, as ADR-0121 decides. |
| No manual `startViewTransition` | None. |

## Findings

### VT-5: Home's quick actions are untyped (Low-medium)

**Where:** `components/pulse/quick-actions.tsx:41` and `:57`, rendered on Home
(`app/dashboard/page.tsx:157`). The hrefs come from `lib/quick-actions.ts`:
`/sessions/[id]/live` (primary), `/sessions/build`, `/sessions/log` and `/sessions`.

**Why:** the same screen already tags these steps forward. The session hero's links are
typed, and the generation launchpad slides to `/sessions/build` and `/sessions/log` "on Train
and on Home alike" (ADR-0121 amendment). So the same destination slides from one button and
swaps from the button below it.

**Fix:**
- Spread `NAV_FORWARD` on the primary Start and on Build and Log. Add the direction to the
  `QuickAction` view-model, the way `NavRow` and `teaserDirection` already do, so the
  component stays a thin renderer and `quick-actions.test.ts` pins the choice.
- Leave `/sessions` untyped: from Home it crosses to the Train tab, the same judgement
  ADR-0121 made for the records teaser.
- Add the classification to the ADR-0121 map.

### VT-6: the Protocol builder's Cancel is untyped (Low)

**Where:** `components/ProtocolBuilder.tsx:285` links `CANCEL — DISCARD CHANGES` to
`/protocols/[id]` with no direction. `/protocols/[id]/edit` has no `BackLink`, so this is the
page's only way up.

**Why:**
- Protocol → edit slides forward (`app/protocols/[id]/page.tsx:99`), but the way back swaps
  instantly.
- On a dirty builder, the navigation guard reads `data-nav-direction` off the clicked anchor.
  There is none here, so the confirmed Discard is instant as well.

**Fix:** spread `NAV_BACK` on the link. The guard then carries the direction through without
further changes (ADR-0121, "The navigation guard keeps the direction").

### VT-7: the new-Protocol choice is lateral going in and hierarchical coming back (Low)

**Where:**
- `NewProtocolChoices.tsx` links `/protocols/new` ↔ `/protocols/new/curated`, untyped on
  purpose: "The two are siblings, not a drill-down" (ADR-0130).
- But `app/protocols/new/curated/page.tsx:33` renders `<BackLink href="/protocols/new">`,
  which spreads `NAV_BACK`. Going to Curated swaps instantly; leaving it slides back, as if
  Curated were a level deeper.

**Fix:** pick one reading and record it in the ADR-0121 map:
- **Siblings (matches ADR-0130):** make the Curated page's way out a peer `NewProtocolChoices`
  tab, or point its `BackLink` where `/protocols/new` points (`/dashboard`), so both siblings
  go up to the same parent.
- **Parent and child:** type the "Choose a Curated Protocol" choice `NAV_FORWARD` and keep the
  `BackLink`.

The first reading keeps ADR-0130's intent and is the smaller change.

### VT-8: the History month arrows don't turn a page (Medium-low)

**Where:**
- `components/HistoryMonthView.tsx:179` (`MonthArrow`) calls `onNavigate`.
- That calls `goToMonth` → `apply` in `components/HistoryBrowser.tsx:101-135`, a plain
  `setFilters` plus `replaceFilterQuery`.
- There is no Transition and no boundary keyed on the month, so the grid and cards swap
  instantly.

**Why:**
- Months are an ordered sequence: previous and next, newest first. The skill reserves
  directional slides for exactly this case.
- The app already turns a page for its other two same-path pagers (Strength, ADR-0122; the
  AI audit log). History is the busiest of the three.

**Fix:**
- Wrap the month grid and its cards in a month-keyed boundary. Reuse `TimelinePageTransition`
  (`key={filters.month}`), and update its comment: it says the timeline is "the app's one
  ordered sequence", which is no longer true.
- Run `goToMonth` inside `startTransition` with the direction as a transition type. A client
  state change has no `<Link>` to spread onto, so add a registry helper in
  `lib/nav-direction.ts` (for example `startDirectedTransition(direction, update)` calling
  `addTransitionType(direction)`). Then extend `nav-direction-policy.ts` to report a
  hand-written `addTransitionType("…")` string, the same way it reports a hand-written
  `transitionTypes`.
- Earlier months read their cards on demand (`fetchHistoryCards`), so the cards land after
  the turn, outside any Transition. Decide whether the turn animates the grid with a skeleton
  where cards are pending, or waits for the read in an async Transition. The first is
  simpler and keeps the arrow instant.
- Amend ADR-0122 (or ADR-0138) with the third pager.

**Check:** the VT-4 journey once it exists. Until then, check in Chromium through the
`audit/` aliases the way ADR-0122 was checked.

### VT-9: list identity on History is now due for a decision (Low)

**Where:** the 10 October audit listed a keyed `<ViewTransition>` per History card (pattern 3,
list identity) under "Considered and not recommended". The reason was that the list was
unbounded and every named boundary would defeat `content-visibility`, and the trigger was
"revisit only after V-1 windows the history list".

**What changed:** ADR-0128 windowed History, and ADR-0138 now shows one month at a time
(`HistoryCardList.tsx:69`, `history-row-defer`). A month holds at most a few dozen cards, so
the snapshot cost the deferral was about is bounded now.

**Decide:**
- **Adopt:** key a bare `<ViewTransition>` (or `default="none" update="auto"
  enter="…" exit="…"`) per card, with no wrapper element between the list and the
  boundary. Run facet changes in `startTransition` so cards that leave fade out and the rest
  close the gap. This would also cover the layout-displacement morph below the list.
  Measure that `history-row-defer` still pays off at month size, or drop it.
- **Decline:** record the reason in ADR-0138 (for example, facet changes should feel
  instant), and drop the item.

Do it after VT-8, because both touch the same boundary: the month turn is the outer
boundary and the cards would be inner ones. A parent that mounts as a unit suppresses its
children's enter and exit (skill: "Nested VT limitation"), so the two have to be designed
together.

## Considered and not recommended

- **Profile Avatar → Avatar picker as a shared element:** the medallion appears on both
  pages, but the picker shows a grid in which the current Avatar is only one cell, and the
  header Avatar is a third copy inside pinned chrome. That is a fragile pair for a screen
  visited rarely.
- **A sigil on the Session-edit page** to extend the morph: the edit page is a form, and its
  header is a title. A morph would need a sigil added only to make the morph happen.
- **Sigils on History cards:** the sigil is a Session (plan) identity (ADR-0120). A Logged
  Session card morphing into a plan header would blur the plan and record split.
- **The catalog and atlas drawers:** unchanged since 10 October; they use CSS transitions,
  which respect `motion-reduce`.
