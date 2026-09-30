# View Transitions audit — React `<ViewTransition>`

Date: 2026-09-30. Scope: `apps/web` — the App Router shell, all 35 page components, every
`<Link>`/`router.push` navigation, both `<Suspense>` boundaries, all seven `loading.tsx`
route fallbacks, and the shared UI primitives under `components/pulse/`.

Method: static source inspection against this repo's copy of the
`vercel-react-view-transitions` skill, following its Step 1 audit order (navigation triggers
→ Suspense boundaries → page inventory → persistent elements → shared visual elements →
skeleton/content control pairs), plus a dependency check run against an installed
`node_modules` to establish what is actually reachable rather than what the version numbers
suggest. **No application code was changed.** Nothing was verified in a browser: this report
classifies surfaces and names the traps, it does not certify that any animation looks right.

**Current state: zero adoption.** `ViewTransition`, `addTransitionType`, `transitionTypes`
and `viewTransitionName` appear nowhere in `app/`, `components/` or `lib/`. There is no
`@media (prefers-reduced-motion: reduce)` block anywhere in `app/globals.css`. This is a
greenfield adoption, not a repair.

**Priority:** P1 = blocks adoption or breaks an invariant. P2 = the animation silently will
not fire, or fires where it shouldn't. P3 = polish, ordering, or a judgement call.

---

## 1. Prerequisites — verified, not assumed

The skill says Next.js App Router users should *not* install `react@canary` because the
App Router bundles canary internally. That is true here, but it has a consequence the skill
doesn't spell out, and it is the one hard blocker:

| Module | Version | `ViewTransition` | `addTransitionType` |
|---|---|---|---|
| `react` (app's own) | 19.2.7 stable | **absent** | **absent** |
| `next/dist/compiled/react` | 19.3.0-canary-3f0b9e61 | present | present |

- **P1 —** `next.config.js:2` has no `experimental.viewTransition`. The flag exists in this
  Next version (`next/dist/server/config-shared.d.ts:699`, `viewTransition?: boolean`) and
  defaults to `false` (`:1416`). Without it the App Router does not alias `react` to its
  compiled canary for this purpose and does not wrap navigations in a Transition that
  carries types. This is a one-line config change and it is step zero.
- **P1 —** `@types/react` is stable 19.x, so `import { ViewTransition } from "react"` will
  not type-check even once the runtime resolves. Expect to need a local type declaration.
  Budget for this — it is the most common way this adoption stalls on the first commit.
- **Confirmed available (no workaround needed):** `transitionTypes?: string[]` on `next/link`
  (`next/dist/client/app-dir/link.d.ts:183`) and on `NavigateOptions` for
  `router.push`/`replace` (`app-router-context.shared-runtime.d.ts:14`). Both are documented
  as forwarding to `React.addTransitionType`. This is the cleanest possible integration
  surface, and it means **no page in this app needs a client wrapper just to tag a
  navigation** — the links are already Server Components and stay that way.

---

## 2. What this app is architecturally good at, and what it isn't

Two structural facts decide most of what follows.

**Good: "back" is a forward push, so directional animation actually works.** The skill's
sharpest limitation is that `router.back()` and the browser back button carry no transition
types, so directional slides silently resolve to `default`. This app barely uses
`router.back()` — there are zero call sites. Instead, every "back" control is a real
`<Link>` to a `?from=` origin resolved by `lib/back-target.ts` (`backTarget`,
`appendFrom`), rendered through **one** component: `components/pulse/back-link.tsx:19`.
A single `transitionTypes={['nav-back']}` there covers all 28 back controls across 23 files.
Forward navigation has a similar chokepoint problem but no single component — see §7.

**Bad: nearly all client interactivity already runs inside a Transition, and none of it is
navigation.** There are ~30 `useTransition`/`startTransition` sites, and every one wraps a
*server action* — favorite toggles, outcome toggles, skin publishing, admin edits, image
uploads, generation enqueues. Examples: `components/OutcomeToggle.tsx`,
`components/AppearanceSkinPublisher.tsx:70`, `components/AdminExerciseImage.tsx:79`,
`components/ShareSessionControl.tsx:29`. Each of those is a real React Transition that
mutates the DOM on revalidation.

- **P1 —** the consequence: **any bare `<ViewTransition>` added to this app will cross-fade
  on every one of those ~30 server-action revalidations.** Toggling a favorite would fade
  the page. `default="none"` is not a stylistic preference in this codebase; it is
  mandatory on every page-level and named boundary, with the animation opted into
  explicitly per trigger. Only keyed list items and deliberately-displaced siblings should
  be left bare (§6).

---

## 3. Route inventory

35 page components. `app/exercises/[id]/progress/page.tsx` is a pure `redirect()` (the view
was folded into the Exercise Detail HISTORY tab) and needs no VT decision, leaving 34.

Grouped by VT treatment:

- **Hierarchical (list → detail), 9 routes** — `/sessions` → `/sessions/[id]` →
  `/sessions/[id]/{live,log}`; `/history` → `/history/[id]` → `/history/[id]/{edit,capture}`;
  `/protocols/[id]` → `/protocols/[id]/edit`; `/analytics` → `/analytics/strength`,
  `/analytics` → `/metrics`; `/exercises` → `/exercises/[id]`; `/profile` →
  `/profile/{edit,achievements}`; `/admin/exercises` → `/admin/exercises/[id]`.
- **Lateral (tab-to-tab), 4 tab roots** — `/dashboard`, `/train`, `/analytics`, `/profile`
  via `lib/tab-nav.ts`, rendered by `tab-bar.tsx` (mobile) and `sidebar.tsx` (desktop).
- **Ordered sequence, 1** — `/analytics/strength?offset=N` (`← Newer` / `Older →`,
  `app/analytics/strength/page.tsx:190,196`).
- **Same-route query swap, 2** — `/analytics?range=X` (`app/analytics/page.tsx:322`),
  `/exercises/[id]?tab=X` (`components/exercise/exercise-tabs.tsx:46`).
- **Chrome-less / excluded, 6** — `/`, `/onboarding`, `/offline`, `/shared/[token]`,
  `/sign-in`, `/sign-up`. These are `TAB_LESS_ROUTES` (`lib/tab-nav.ts:50`), outside the
  shell's orientation model; animating into them communicates nothing.
- **Form destinations, 7** — `/sessions/new`, `/sessions/build`, `/sessions/log`,
  `/logs/new`, `/protocols/new`, `/profile/edit`, `/history/[id]/edit`. Reached forward from
  many origins, left by a server-action redirect. Treat as hierarchical forward, but see §8.

---

## 4. Navigation map

The Step 1 deliverable. "Pattern" is what I'd implement; "fires today" assumes the Step 4
type-keyed page wrapper and §1's config flag are in place.

| From | To | Direction | Pattern | Notes |
|---|---|---|---|---|
| `/dashboard` | `/sessions/[id]` | forward | slide + **sigil morph** | via `session-hero.tsx:85`. Pair forms — both sides render the sigil. |
| `/dashboard` | `/sessions/[id]/live` | forward | slide, `exit` only | `session-hero.tsx:78`. **No pair** — Live renders no sigil (§5). |
| `/dashboard` | `/exercises/[id]` | forward | slide | `app/dashboard/page.tsx:198` (latest-PR card). |
| `/train` | `/sessions/[id]` | forward | slide + **sigil morph** | via `SessionCard` in `SessionLibraryRow`. **Name collision risk** (§5). |
| `/train` | `/sessions/[id]/live` | forward | slide, `exit` only | `RecentSessions` → SessionCard's Start. No pair. |
| `/sessions` | `/sessions/[id]` | forward | slide + **sigil morph** | Pair forms. |
| `/sessions/[id]` | `/sessions/[id]/live` | forward | slide | Same dynamic segment family, different route. |
| `/sessions/[id]` | `/sessions/[id]/log` | forward | slide | |
| `/history` | `/history/[id]` | forward | slide | `HistoryBrowser.tsx:277`. No shared visual — see §5. |
| `/history/[id]` | `/history/[id]/{edit,capture}` | forward | slide | `app/history/[id]/page.tsx:66,119`. |
| `/protocols/[id]` | `/sessions/[id]` | forward | slide | `app/protocols/[id]/page.tsx:173,229`. |
| `/protocols/[id]` | `/protocols/[id]/edit` | forward | slide | |
| `/analytics` | `/analytics/strength`, `/metrics` | forward | slide | `app/analytics/page.tsx:168,181`. |
| `/exercises` | `/exercises/[id]` | forward | slide | Via the **drawer**, not a row — see §5. |
| `/exercises/[id]` | `/exercises/[id]` (related) | lateral | crossfade | `specs-panel.tsx:312`, `catalog-detail.tsx:211`. Same route, different id. |
| any | `?from=` origin | **back** | slide (reversed) | **One seam:** `back-link.tsx:19`. 28 call sites. |
| tab | tab | lateral | bare crossfade or none | `tab-bar.tsx:44`, `sidebar.tsx:59`. **No directional slide** — there is no depth between HOME and STATS. |
| `/analytics/strength?offset=N` | `offset=N±` | **sequential** | directional slide | The one genuine ordered sequence: `Older →` should come from the right. |
| `/analytics?range=X` | `range=Y` | lateral | crossfade on the content only | Same route; page VT stays mounted (§7). |
| `/exercises/[id]?tab=X` | `?tab=Y` | lateral | crossfade on the panel only | Same route; page VT stays mounted (§7). |
| (Suspense / `loading.tsx`) | content | — | reveal | 7 route fallbacks + 2 inline boundaries (§6). |

---

## 5. Shared visual elements

### 5.1 The Workout Signature sigil — the one real shared element, and it is a good one

`components/pulse/workout-sigil.tsx` renders a geometric medallion that is **deterministic
in the Session id**, documented as "identical across surfaces (Home hero, My Sessions,
Train, Session detail)". It is rendered at three sizes on three surfaces:

| Surface | File | Size |
|---|---|---|
| Home hero | `components/pulse/session-hero.tsx:44` | 60px |
| Session card (Train + My Sessions) | `components/SessionCard.tsx:45` | 44px |
| Session detail | `app/sessions/[id]/page.tsx:134` | 48px |

This is a shared-element morph that the design has *already argued for* in prose — the
continuity it would communicate ("same plan, going deeper") is the exact continuity the
component exists to assert. Of everything in this report, `name={`session-sigil-${id}`}`
with `share="morph"` is the single highest-value change. The three sizes differing is a
feature, not a problem: the morph interpolates the geometry.

- **P1 — the name will collide on `/train`.** `app/train/page.tsx` renders `RecentSessions`
  (`components/RecentSessions.tsx:27`) **and** `SessionsLibrary` (My Sessions rows) on the
  same page, both through the same `SessionCard`. A recently-performed standalone Session is
  by definition *also* in the user's library, so the same Session id renders two sigils
  simultaneously. Two mounted `<ViewTransition>`s with one `name` break the morph outright.
  This is precisely the reusable-component trap the skill warns about, and it is live here.
  Fix by making the name conditional via a `SessionCard` prop (only the library row claims
  the name) rather than putting the named VT inside `SessionCard`.
- **P2 — `/train`'s Recent panel has no morph target.** Its `SessionCard` heading is plain
  text, not a link (`SessionCard.tsx:39–40`: "on Train it is plain text (its lone navigation
  is Start)"). Start goes to `/sessions/[id]/live`, which renders no sigil. So no
  pair forms on that path and `exit` fires instead. Either accept the slide, or add the
  sigil to the Live header — which would also fix the Home-hero → Live path in §4.

### 5.2 No image shared elements exist

Worth stating because it's the pattern people reach for first. The only content image in
the app is the Exercise Image (`components/exercise/specs-panel.tsx:110`, a plain `<img>`
behind the `/api/exercises/[id]/image` proxy), and it appears **only** on the exercise
detail page. It is never a list thumbnail. `RelatedList` rows are text + chevron
(`specs-panel.tsx:311–320`). There is no list→detail image morph to build.

### 5.3 History has no shared visual, by design

`/history` → `/history/[id]` is the app's other main list→detail hop, but the record card
(`HistoryBrowser.tsx:223`, `LoggedSessionCard`) carries no sigil and no image — a Logged
Session is a record, not a plan, and the sigil is keyed to plans. **P3:** don't invent one.
A directional slide is the honest animation here. Resist the temptation to morph the card
title; an authored `h2` morphing into an `h1` across a font-size change reads as a glitch.

### 5.4 The Catalog detail is a drawer, not a route

`/exercises` renders `ExerciseCatalogTaxonomy`, whose row tap opens an in-page drawer
(`ExerciseCatalogTaxonomy.tsx:459`) with its own hand-rolled `transition-transform`
open/close. `/exercises/[id]` is reached from *elsewhere* (related lists, dashboard PR card,
analytics tiles). **P3:** leave the drawer alone. It already has a working reduced-motion
opt-out, and it is not a navigation. Converting it to a VT would be a rewrite of a modal,
which is a separate piece of work with its own focus-management findings already open in
`docs/ui-ux-audit.md`.

---

## 6. Suspense boundaries and loading fallbacks

### 6.1 Seven route-level `loading.tsx` — all seven duplicate their `PageHeader`

`app/{dashboard,history,metrics,profile,analytics,analytics/strength,profile/achievements}/loading.tsx`.
Each is a layout-matched skeleton per ADR-0028 and each renders the real `PageHeader` with
the real overline and title, e.g. `app/dashboard/loading.tsx:12` and
`app/analytics/strength/loading.tsx:9`.

- **P2 —** this is exactly the skeleton/content control pair the skill's Step 1 asks for and
  its Step 5 rule warns about: the same element rendered in *both* the fallback and the
  content flickers on reveal as an opacity dip. Today there is no VT so nothing dips, but
  the moment a reveal animation is added, all seven headers will. Two options, and the
  second is better here: give the header a matching `viewTransitionName` in both so it
  morphs in place, **or** wrap only the data region in the reveal VT and leave the header
  out of it. The second matches what these files already do structurally — the comment in
  `app/dashboard/loading.tsx:5` says the header "is static, so it paints immediately; only
  the data region below is skeletonized". Honour that existing intent.
- **P3 —** these fallbacks are a genuinely good fit for the reveal pattern precisely
  *because* they're layout-matched and CLS-free. A vertical `slide-up` on content /
  `slide-down` on skeleton will read cleanly. Use plain string props, not type maps —
  Suspense resolves are separate transitions with no type.

### 6.2 Two inline boundaries, both `fallback={null}`

`app/history/page.tsx:80` and `app/sessions/page.tsx:67`, both wrapping a client component
that reads `useSearchParams` to restore a filtered view.

- **P3 —** these exist to satisfy the App Router contract, not to show a loading state. A
  `null` fallback means there is nothing to reveal *from*, so an `enter` on the content
  animates content in from nothing — which reads as a page-load flash layered on top of the
  route transition that just ran. **Leave both alone.** Not every `<Suspense>` wants a
  reveal, and these are the counterexample.

---

## 7. What will and will not fire — trigger audit

- **P2 — client-side list filtering will not animate, and can't without a change.**
  `HistoryBrowser.apply()` (`components/HistoryBrowser.tsx:66`) calls plain `setFilters` and
  then `window.history.replaceState`, deliberately avoiding a router navigation so a
  keystroke never re-runs the Server Component. `SessionsLibrary` does the same. Plain
  `setState` is not a Transition, so per-item keyed VTs on those lists
  (`HistoryBrowser.tsx:203`, `<li key={entry.id}>`) would never fire. Making them fire means
  wrapping `apply()` in `startTransition` — cheap, and it's the correct pattern for a
  filter over already-fetched data anyway. **But** note that these lists grow and shrink by
  many rows at once; a filter that drops 40 of 50 records is not a reorder, and animating it
  is likely worse than not. My recommendation: **skip list identity on History and My
  Sessions.** It's pattern 3 on the skill's priority list, and the skill says implement every
  pattern that fits — this one doesn't fit a filter that changes cardinality wholesale.
  Document the skip rather than leaving it looking forgotten.
- **P2 — the navigation guard drops transition types.**
  `components/NavigationGuardProvider.tsx:146` resolves a discard confirmation with a bare
  `router.push(destination)`, outside `startTransition` and with no `transitionTypes`. Every
  guarded navigation (any dirty form: the builder, the correction forms, the profile form)
  would therefore animate to `default` while the same link clicked on a clean form animates
  directionally. Fix by threading the intercepted anchor's intended type through to the push.
  It's a small change in a load-bearing file — treat it as its own commit.
- **P3 — same-route query swaps keep the page VT mounted.** `/analytics?range=X` and
  `/exercises/[id]?tab=Y` navigate within one route, so a page-level VT never unmounts and
  `enter`/`exit` never fire. Animating these needs a `key`ed VT around the *content region*
  (`key={range}` / `key={tab}`), not the page. Both are lateral, so a crossfade — not a
  slide. Low value; do it last or not at all.
- **P1 — `/analytics/strength`'s pager is the one place a directional slide is unambiguously
  correct** and it is currently indistinguishable from any other link. `← Newer` /
  `Older →` (`app/analytics/strength/page.tsx:190,196`) is an ordered sequence where
  direction carries position. If only one directional transition ships, ship this one.

---

## 8. Persistent elements needing `viewTransitionName` isolation

Four, all in the always-mounted shell. Without isolation each will be captured in the page
snapshot and slide with the content.

| Element | File | Complication |
|---|---|---|
| Top header | `app/layout.tsx:196` | `sticky` + **`backdrop-blur`** |
| Mobile tab bar | `components/pulse/tab-bar.tsx:32` | `fixed` + `bg-surface/95` + **`backdrop-blur`** |
| Desktop sidebar | `components/pulse/sidebar.tsx:49` | `sticky h-screen` |
| Sync toast | `components/SyncStatusBanner.tsx:65` | `fixed`, `backdrop-blur`, mounts/unmounts on sync state |

- **P1 —** three of the four use `backdrop-blur`. The skill's plain persistent-element
  isolation recipe is wrong for those; they need the backdrop-blur workaround, or the blur
  will be baked into a snapshot and visibly detach from what's scrolling behind it.
- **P2 —** the sync toast is not merely persistent, it is *conditionally* mounted on sync
  state. Isolating it is necessary but not sufficient: it will also want its own
  `enter`/`exit` so it doesn't pop. Note that `app/layout.tsx:265` mounts it inside
  `<SignedIn>`, so it also enters on sign-in.
- **P3 —** `components/pulse/resume-session-banner.tsx:57` is a fourth conditional mount
  (`if (slot === null) return null`, set from a `useEffect` reading local storage). It
  appears *after* hydration on `/dashboard`, which today is a hard pop. A bare
  `enter`/`exit` pair here is a genuine improvement independent of any navigation work.

---

## 9. Governance — the reduced-motion blind spot (read this before writing any CSS)

This is the finding with the longest tail, and it is specific to this repo.

ADR-0082 states that no animation may move anything once `prefers-reduced-motion: reduce`
is set, that the preference is read **in CSS, never in JavaScript**, and that the opt-out
must be **co-located in the same class string** as the movement it guards. Enforcement is
`apps/web/lib/motion-policy.ts`, swept by `motion-policy.test.ts`, which parses **`.tsx`
files under `components/` and `app/`** (`motion-policy.test.ts:17`) looking for Tailwind
`animate-*` and motion-bearing `transition-*` tokens in `className` attributes and class
builders. `MOTION_EXEMPTIONS` ships empty and unknown `animate-*` utilities fail closed.

View transition animations are `@keyframes` plus `::view-transition-old/new/group/image-pair`
rules in `app/globals.css`. They are **not** Tailwind utilities, they are **not** in a
`.tsx` file, and they are **not** in a `className`.

- **P1 —** every motion guard in this repo is structurally blind to them. ADR-0082's own
  Consequences section says "the guard is the only enforcement for transitions." A VT
  adoption would therefore introduce the first movement in the app that no guard covers,
  in the one file (`app/globals.css`, 909 lines, currently one `@keyframes` at :873 and
  **zero** `prefers-reduced-motion` blocks) that nothing sweeps. The reduced-motion CSS the
  skill supplies is not optional polish here; without it this work regresses an accepted
  ADR on its first commit, silently, with CI green.
- **P1 —** this needs an ADR of its own, not a comment. The decision to record: movement
  declared in global CSS is guarded by a `@media (prefers-reduced-motion: reduce)` block
  that disables `::view-transition-*` animations wholesale, **and** the guard is extended to
  assert that block exists — a CSS-side check, since the existing TypeScript-parser approach
  cannot reach it. The repo's own precedent is strong here: every one of ADR-0081 through
  ADR-0088 pairs an invariant with an executable guard that fails closed, and CLAUDE.md's
  "Where to make a change" list is written in exactly that shape. A VT adoption that ships
  without one would be the first visual invariant in this codebase resting on reviewer
  attention alone.
- **P2 —** the skill also notes that `reactStrictMode` is on (`next.config.js:3`). Double
  rendering in development interacts awkwardly with VT snapshot timing; expect dev-only
  weirdness and verify in a production build before concluding an animation is broken.
- **P3 —** `reflow-policy.ts` flattens Tailwind variants by design, which is why ADR-0088
  forbids bracket track syntax in `lg:` variants. VT CSS classes are not Tailwind utilities
  so they won't trip it, but `accent-tint-policy.ts` *does* check that every colour named by
  a `bg-`/`border-`/`ring-`/`text-` utility is Skin-declared and fails closed. Any VT work
  that adds a tinted overlay through a utility must extend that registry (ADR-0086).

---

## 10. Recommended order

The skill's priority list is shared element → Suspense reveal → list identity → state change
→ route change. Adapted to what this audit actually found, and sequenced so each step is
independently shippable:

0. **`experimental.viewTransition: true`** + whatever type shim `@types/react` needs. Nothing
   works before this (§1).
1. **Reduced-motion CSS + its ADR + a guard that fails closed** (§9). First, not last. Every
   later step lands inside a guarded surface instead of widening an unguarded one.
2. **Persistent-element isolation** for the four shell surfaces, backdrop-blur variant for
   the three that need it (§8). Purely defensive; prevents every later step from looking
   broken.
3. **The sigil morph** — `session-sigil-${id}` across the three surfaces, with the
   `/train` collision fixed by a `SessionCard` prop (§5.1). Highest value in the report.
4. **Directional page transitions** via one `DirectionalTransition` wrapper, `nav-forward` /
   `nav-back`, with `default="none"` throughout. `transitionTypes={['nav-back']}` goes in
   `back-link.tsx` once (§2); forward tagging is per-link. Fix
   `NavigationGuardProvider.tsx:146` in the same pass (§7).
5. **The strength pager** as a genuine sequential slide (§7).
6. **Suspense reveals** on the seven `loading.tsx` routes, header kept outside the reveal
   (§6.1). Skip the two `fallback={null}` boundaries.
7. **Conditional-mount enter/exit** for the resume banner and sync toast (§8).

Deliberately **not** recommended, with reasons, so a later reader doesn't read these as
oversights: list-identity VTs on History / My Sessions (§7 — cardinality-changing filter,
not a reorder); a shared element on History's record cards (§5.3 — no shared visual exists,
and the plan/record split says there shouldn't be); converting the Catalog drawer (§5.4);
tab-to-tab directional slides (§4 — lateral navigation, no depth to communicate);
same-route query-swap animation (§7 — low value, do last or never).

---

## 11. Verification gap

Steps 2–7 above all change rendered visual behaviour, and this repo verifies rendered
behaviour with offline Playwright sweeps: `audit/reflow.mjs` (320px and 200% text),
`audit/wide.mjs` (1440px), `audit/charts.mjs` (per-point parity). None of them drive a
navigation, so **none of them can observe a view transition.** ADR-0088's lesson — "a page
no journey renders is unverified however many guards are green" — applies directly: adding
`home` as a journey surfaced three pre-existing defects in components it had always
rendered.

`audit/resilience-navigation.mjs` is the nearest thing, and on inspection it is not close
enough to extend. Despite the name it drives *filter inputs* on three pages, not route
navigations (`audit/resilience-navigation.mjs:18–21`), and it is not part of the offline
suite at all: it requires `UI_REAL_APP_URL` plus a disposable account's Playwright storage
state and refuses anything but loopback (`:7–11`). So it cannot run in the `web` CI job the
other sweeps run in.

That makes VT verification a new harness, not an extension — a sweep that drives real
route navigations and asserts a transition ran (the `::view-transition-*` computed
`animation-name` probe ADR-0082 already describes for animations is the available
mechanism; it is structurally blind to transitions, which is the same limitation recorded
there). Decide this **before** step 3, not after step 7: shipping seven animations with no
journey that drives a navigation would leave this work in exactly the unverified state
ADR-0088 was written about.
