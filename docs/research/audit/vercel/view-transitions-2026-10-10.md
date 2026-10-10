# Vercel React view transitions audit: `apps/web`, 10 October 2026

**Audit date:** 10 October 2026. **Reviewed:** `docs/vercel-react-audit` at `2692048`
(main `0ec56f0` plus audit docs only). **Skill:** `vercel-react-view-transitions`
(`.claude/skills/vercel-react-view-transitions/`).

**Context.** This is a *post-implementation* audit.
- The earlier pre-implementation audit (`view-transitions-audit.md`) planned the work.
  Its plan shipped as ADR-0118 to ADR-0124, and the file was then deleted in `bff6389`.
- This report checks what shipped against the skill's checklist: the five patterns, the
  placement rules, `default="none"` use, types on links, Suspense reveals, persistent
  elements and reduced motion. It then looks for surfaces the rollout missed.

**Method.**
- Read the seven ADRs and every `<ViewTransition>` in the code (6 components).
- Listed every file with a `<Link>` (49) and every `router.push` / `router.replace`
  (10), and classified each navigation.
- Read every `<Suspense>` fallback (6 inline boundaries plus the route `loading.tsx`
  files).
- Checked the drawers, the lists and `audit/` for a navigation journey.

All findings are from reading the code. Nothing was run in a browser for this audit
(see VT-4).

## Summary

The rollout follows the skill closely, including its subtler rules. There are no
correctness bugs in what shipped. The findings are about coverage:

| ID | Finding | Pattern | Impact | Effort |
| --- | --- | --- | --- | --- |
| VT-1 | The exercise page's HISTORY-tab skeleton doesn't use `SkeletonReveal`, so it pops instead of dissolving like every other skeleton | Suspense reveal (ADR-0123) | Low (inconsistency) | XS |
| VT-2 | About 9 hierarchical links don't spread `NAV_FORWARD`, so these list-to-detail and hub-to-child steps swap instantly while their siblings slide | Route change (ADR-0121) | Low-medium | S |
| VT-3 | Programmatic navigations after an action carry no direction | Route change (ADR-0121) | Low | S |
| VT-4 | Still unverified in the running app: no journey drives a real navigation (already tracked in TASKS §11) | Verification | **Medium** (risk) | M |

## Checked against the skill: what is right

| Skill rule | How the app meets it |
| --- | --- |
| Reduced motion always | ADR-0118: a `!important` off switch on every `::view-transition-*` under `prefers-reduced-motion`, added before any boundary. |
| Persistent elements isolated | ADR-0119: one registry (`lib/persistent-transition.ts`). The groups are frozen with z-index tiers, the blurred chrome uses the backdrop-blur workaround, and the rules are unlayered so a later recipe can't un-pin them. |
| Shared element (priority 1) | ADR-0120: the Workout Sigil morphs between the My Sessions row, the Home hero and Session detail. It has unique names per Session and an opt-in claim (`claimsSigilMorph`), so two copies on one page can't collide. It uses `default="none"` with an *explicit* `share`, avoiding the skill's first "morph never fires" trap, and an untyped `share`, avoiding the second. |
| Never fade-out exit on pages with morphs | The page exit is a directional slide (ADR-0121), never a fade. |
| Route change, type-keyed | ADR-0121: one `RouteTransition` keyed on the pathname, with `nav-forward` / `nav-back` maps and `default: "none"`. Links are tagged only by spreading `NAV_FORWARD` / `NAV_BACK`, which `lib/nav-direction-policy.ts` enforces. `BackLink` and the session cards are typed. |
| Lateral navigation not directional | The tab bar, sidebar and exercise tabs carry no type, so they swap instantly. This matches the skill's guidance for lateral navigation. |
| Ordered sequence slides by position | ADR-0122: the strength pager reuses `nav-forward` / `nav-back` around the records only, keyed on `offset`. |
| Suspense reveal uses plain strings, not types | ADR-0123: `SkeletonReveal` is `exit="skeleton-out" default="none"`. It is not a type map, because a Suspense resolve carries no type. `SkeletonPage` keeps the header out of the reveal. |
| State change enter/exit | ADR-0124: the resume banner sets its slot inside `startTransition`, and the toast mounts on `useDeferredValue(visible)`. Both boundaries are the top node under an already-mounted parent, so their enter and exit fire. |
| `router.back()` / browser back | ADR-0121 records that these carry no type and swap instantly. The app's back controls are forward pushes to a `?from=` target, so they *can* be typed. |
| No manual `startViewTransition` | None in the code. |

## Findings

### VT-1: HISTORY-tab skeleton is outside `SkeletonReveal` (Low)

**Where:** in `app/exercises/[id]/page.tsx:133`, the HISTORY tab streams behind
`<Suspense fallback={<HistoryTabFallback />}>`. `HistoryTabFallback` (`:179`) returns
three bare `Skeleton`s.

**Why:**
- Every route skeleton returns `SkeletonPage`, and the Session detail's in-page
  `PrescriptionListSkeleton` wraps itself in `SkeletonReveal`.
- This is the one skeleton that swaps abruptly when its content arrives.

**Fix:** wrap `HistoryTabFallback`'s return in `<SkeletonReveal>`. The guard in
`lib/skeleton-reveal-policy.ts` may need this boundary added to its sweep, so a later
in-page skeleton is caught too.

### VT-2: Hierarchical links without a direction (Low-medium)

These `<Link>`s go one level deeper (list to detail, or hub to child) but carry no type,
so the route transition resolves to `none` and they swap instantly. Their siblings slide:
the Session card spreads `NAV_FORWARD`, and every `BackLink` spreads `NAV_BACK`.

| File | Link | Suggested type |
| --- | --- | --- |
| `components/pulse/training-route.tsx` | Protocol route stop → `/sessions/[id]` | `NAV_FORWARD` |
| `components/analytics/strength-trajectories.tsx` | trajectory tile → exercise | `NAV_FORWARD` |
| `components/pulse/recent-records.tsx` | record teaser → its source | `NAV_FORWARD` |
| `components/pulse/stamp-detail.tsx` | achievement → its source record | `NAV_FORWARD` |
| `components/exercise/catalog-detail.tsx`, `specs-panel.tsx` | catalog drawer / specs → `/exercises/[id]` | `NAV_FORWARD` |
| `app/train/page.tsx` | Train hub → `/sessions`, `/protocols`, `/exercises` | `NAV_FORWARD` |
| `components/pulse/generate-training-launchpad.tsx` | → `/protocols/new`, `/sessions/new`, `/sessions/build`, `/sessions/log` | `NAV_FORWARD` |
| `app/history/page.tsx`, `app/sessions/page.tsx` | page action → `/logs/new`, `/sessions/new` | `NAV_FORWARD` |

**Leave untyped:** the tab bar, sidebar and exercise tabs (lateral), the `/offline` and
`/shared` pages (entry points), the builder's drag-chrome links, and
`history-panel.tsx` → `/history` (a jump across the hierarchy).

**Fix:**
- Spread the type on each link above.
- Each choice is a direction judgement, so list the classification in ADR-0121's
  navigation map rather than adding a guard that forces a type on every link.

### VT-3: Programmatic navigations after an action are untyped (Low)

**Where:**

| Call | Destination | Suggested type |
| --- | --- | --- |
| `lib/use-protocol-generation.ts:42` `router.push` | the adopted Protocol | `nav-forward` |
| `components/AdminExerciseDelete.tsx:47` `router.push` | back to the catalog list | `nav-back` |
| `components/LiveSessionScreen.tsx:454,479` `router.push` | `/history` after Finish | none: keep instant |
| `components/LogSessionForm.tsx:76`, and `router.replace` after a save in `HandAuthoredSessionForm`, `CorrectLogForm`, `AdhocLogForm` | the saved record | none: keep instant (a replace is not a step in the hierarchy) |

**Fix:** for the first two, pass `{ transitionTypes: [direction] }` through the existing
helper (`guardedNavigateOptions` in `lib/navigation-guard.ts`, or a sibling
`navigateOptions(direction)`). The policy forbids a hand-written `transitionTypes`
literal.

### VT-4: Verification in the running app is still open (Medium risk)

**Status:**
- ADR-0118 to ADR-0124 were each checked in Chromium against real components.
- No transition has been watched through the Next router in the running app.
- Nothing in `apps/web/audit/` drives a route navigation: `resilience-navigation.mjs`
  drives filter inputs and needs a real signed-in app.

The deleted audit's §11 described this gap, and it is still tracked as the "View
Transitions in the running app" item in TASKS §11. **No duplicate task is added here.**
VT-1 to VT-3 should be checked by the same journey once it exists.

## Considered and not recommended

- **List-identity animations on History and catalog filtering:**
  - A keyed `<ViewTransition>` per row, plus `startTransition` around the filter
    update, would animate rows in and out.
  - But both lists are long and unpaged. History is unbounded
    ([web audit V-1](react-best-practices-2026-10-10.md#v-1-history-sends-and-renders-the-whole-record-high-grows-over-time)),
    and the admin catalog has about 500 rows.
  - Every named boundary is a snapshot, which defeats the `content-visibility` savings.
  - Revisit only after V-1 windows the history list.
- **The catalog and atlas drawers via `<ViewTransition>`:**
  - Both drawers (`ExerciseCatalogTaxonomy` `DetailDrawer`, `analytics/atlas-drawer`)
    animate with CSS transitions, which already respect `motion-reduce`.
  - A view transition would snapshot the whole page under a fixed overlay for no
    visible gain.
- **Reveals for `fallback={null}` boundaries** (`/train`, `/sessions`, `/history`,
  `/admin/exercises`): there is no skeleton to dissolve. An enter fade on the content
  would need a boundary in each panel, which is the same trade-off ADR-0123 rejected.
- **Another shared element:**
  - The deleted audit found the sigil to be the only real shared visual (§5). No image
    morphs exist, and the catalog detail is a drawer, not a route.
  - Nothing has changed since, so no new candidates.
