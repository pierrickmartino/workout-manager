# Workout Manager — React and Next.js performance audit

**Audit date:** 30 September 2026 (Europe/Zurich)  
**Reviewed commit:** `a0f1ec33239335101b170f360362ecbb55b5f8b1`  
**Scope:** `apps/web`, reviewed against the repository's `vercel-react-best-practices` skill (waterfalls, bundle size, server work, client fetching, re-renders, rendering, JavaScript hot paths, and advanced React patterns).  
**Method:** static source review, production build, generated client-reference manifests, raw/gzip chunk measurement, and the existing frontend test suite. No production tracing, authenticated browser session, or field Core Web Vitals were available.

## Executive summary

The frontend has a strong baseline: Server Components own most reads, several multi-read pages already use `Promise.all`, request-local preference/admin reads use `React.cache`, the dashboard's desktop-only Recharts block is both dynamically imported and viewport-gated, state initialization is commonly lazy, and the production build succeeds. The full frontend suite passes **1,410/1,410 tests**.

The highest-return work is concentrated in three areas:

1. Recharts is statically included on three chart-bearing routes, adding roughly **101–143 KB gzipped** over the measured dashboard entry graph.
2. Several server routes and two server actions serialize independent network work, adding avoidable round trips.
3. The Live Session's one-second clock updates the state of its 801-line parent, causing the entire workout screen and set list to re-render every second.

No application source was changed by this audit.

## Verification results

| Check | Result |
| --- | --- |
| `npm test` | Pass: 1,410 tests, 0 failures, 23.3 s |
| `npm run build` | Pass: Next.js 16.2.12 production build and TypeScript check |
| `npm run lint` | Fail before linting: the script still runs removed `next lint`; Next interprets `lint` as a project directory |
| Git worktree before report | Clean |

The test runner repeatedly warns that `package.json` has no `"type": "module"`, so Node reparses TypeScript test modules as ESM. That is test-process overhead, not shipped browser overhead.

## Measured client entry JavaScript

These totals are the unique files listed for each route's final `entryJSFiles` graph in the production client-reference manifest. They are useful comparative evidence, not a lab measurement of bytes transferred on every navigation; shared cache state and dynamic chunks affect actual transfer.

| Route | Raw | Gzipped | Interpretation |
| --- | ---: | ---: | --- |
| `/dashboard` | 282.5 KB | 83.5 KB | Reference route; its wide-only chart is deferred |
| `/analytics` | 761.9 KB | 226.6 KB | Largest measured entry graph; Recharts is eager |
| `/analytics/strength` | 659.8 KB | 184.2 KB | Recharts is eager even when trajectories are absent |
| `/exercises/[id]` | 659.8 KB | 184.2 KB | Recharts is eager even when no top-set series renders |
| `/protocols/[id]/edit` | 398.0 KB | 120.3 KB | Large interactive builder plus drag-and-drop |
| `/sessions/build` | 376.8 KB | 114.4 KB | Large interactive authoring form |
| `/sessions/[id]/live` | 306.1 KB | 89.7 KB | Moderate entry size; runtime re-render cost is the larger concern |

The generated Recharts library chunk is **387.7 KB raw / 104.3 KB gzipped**. Small chart-specific chunks add roughly another 5 KB gzipped. This agrees with the repository's own dashboard comment documenting about 110 KB gzipped before that route was fixed.

## Ranked findings

### P1 — Dynamically load Recharts on all chart-bearing routes

**Rules:** `bundle-dynamic-imports`, `bundle-conditional`  
**Evidence:** `apps/web/app/analytics/page.tsx:19-21` statically imports both charts; `apps/web/components/pulse/volume-chart.tsx:3-11`, `distance-chart.tsx:3-11`, and `components/exercise/top-set-trend-chart.tsx:3-12` statically import Recharts. The chart components are conditional at render time, but static imports keep the library in the route graph even for empty data. `/analytics` measures 226.6 KB gzipped, while `/dashboard`—whose chart uses `next/dynamic` plus a mount gate in `components/pulse/volume-chart-wide.tsx:26-38`—measures 83.5 KB.

**Impact:** critical bundle cost on Analytics, Strength Analytics, and Exercise Detail. The user pays for the charting library before interacting and even when there is no chart data.

**Recommendation:** add client wrappers that dynamically import `VolumeChart`, `DistanceChart`, and `TopSetTrendChart` with stable, correctly sized skeletons. Keep the text-value disclosure in the same lazy boundary so plot and values remain coupled under ADR-0084. For below-the-fold charts, optionally mount on intersection; for above-the-fold Analytics charts, dynamic import alone removes the library from the route's entry graph while preserving immediate loading.

**Acceptance:** production manifests no longer list the Recharts chunk in the three route entry graphs; empty-state renders never request it; chart/value parity audits and 320px reflow checks remain green.

### P1 — Remove server-render and server-action waterfalls

**Rules:** `async-parallel`, `async-api-routes`, `async-dependencies`  
**Evidence:** independent reads are awaited serially in:

- `apps/web/app/exercises/[id]/page.tsx:49-76`: exercise → records → home → appearance.
- `apps/web/app/admin/exercises/[id]/page.tsx:41-55`: detail → audit → relationships; the final two are explicitly best-effort and independent.
- `apps/web/app/sessions/[id]/live/page.tsx:22-39`: live session → profile → appearance.
- `apps/web/app/protocols/[id]/edit/page.tsx:25-37`: protocol → profile/appearance.
- `apps/web/app/analytics/strength/page.tsx:48-63`: analytics → appearance.
- `apps/web/app/logs/new/actions.ts:34-49` and `app/history/[id]/edit/actions.ts:133-159`: each added movement resolves one after another, then appearance starts only after all resolutions finish.

**Impact:** high. Each independent await adds a full backend/auth round trip. Ad-hoc logging and correction scale linearly with the number of new movements.

**Recommendation:** start promises as soon as validated identifiers/form rows are available and await them together. Where avoiding optional work on a 404 is important, fetch the required detail first, then parallelize every independent follow-up rather than chaining them. Start `resolveAppearance()` before per-row resolutions because it is independent. For row resolution, prefer a batch backend operation: `resolveExercise` can create catalog entries, so a naive `Promise.all` can change side-effect and duplicate-name behavior. If the existing endpoint is kept, deduplicate names first and explicitly preserve ordered error semantics.

**Acceptance:** no listed route contains serial independent reads; an instrumented delayed-fetch test demonstrates one latency window per parallel group; action error messages still identify the first invalid row in form order.

### P1 — Stream the dashboard's optional review data

**Rules:** `async-suspense-boundaries`, `async-defer-await`  
**Evidence:** `apps/web/app/dashboard/page.tsx:46-57` includes the optional analytics read in the page's top-level `Promise.all`. The resulting volume and record blocks are described as a wide-only “bonus” at lines 140-178, yet their backend latency delays the entire dashboard response on every viewport. Catching failures protects availability but does not remove the wait.

**Impact:** high on the application's primary route. A slow analytics projection delays the current workout, readiness, and quick actions that do not depend on it. Mobile waits for data whose markup is hidden and whose chart never mounts.

**Recommendation:** keep profile/home/appearance on the critical path, move review loading into an async Server Component behind a `Suspense` boundary, and render a wide-only skeleton or nothing as the fallback. If product requirements allow, consider a separate client request mounted only at the wide breakpoint to avoid the mobile analytics read entirely; that is a larger architecture choice than streaming.

**Acceptance:** an artificial delay on `fetchAnalytics` does not delay the main dashboard shell/current-session content; analytics failure still leaves the primary dashboard intact; mobile behavior is explicitly measured.

### P1 — Isolate the one-second Live Session clock

**Rules:** `rerender-memo`, `rerender-split-combined-hooks`, `rerender-use-ref-transient-values`  
**Evidence:** `apps/web/components/LiveSessionScreen.tsx:139-147` stores the wall clock in parent state; lines 224-227 update it every second. Every tick recomputes progress, current unit, grouped units, completed counts, and look-ahead data at lines 322-351 and re-renders the full Live Session subtree. The component is 801 lines and can render many exercise/set editors.

**Impact:** medium-high sustained CPU/battery cost on the longest-running, phone-centric screen. Cost grows with workout size and continues even outside the live phase because the interval is unconditional.

**Recommendation:** split elapsed and rest countdowns into small timer components/hooks whose state updates locally. Notify the parent only once when rest reaches zero. Start the interval only while the relevant phase/countdown is active. Keep the timestamp-based model so background/lock correctness is unchanged.

**Acceptance:** React Profiler shows set rows do not render on idle clock ticks; no interval runs during deciding/blocked/summary phases; existing timer, resume, rest, and finish tests remain green.

### P2 — Make the Live Session storage schema versioned and exception-safe

**Rule:** `client-localstorage-schema`  
**Evidence:** `apps/web/lib/live-session-storage.ts:15` uses an unversioned key. `saveLiveSession` and the initial `getItem` in `loadLiveSession` at lines 25-40 are outside `try/catch`; `browserStorage` at lines 132-134 also accesses `window.localStorage` without a guard. Restricted storage, quota errors, or browser privacy modes can therefore throw through start, resume, persistence, or sign-out. The form-draft store already demonstrates the desired versioned, guarded pattern.

**Impact:** medium reliability risk in the core workout flow. A storage failure should degrade to an in-memory session or an honest warning, not crash the screen.

**Recommendation:** use a versioned envelope/key, wrap property access and all storage operations, and return explicit success/failure from writes. Decide how the UI communicates that refresh recovery is unavailable. Apply the same audit to `readLastSynced`, whose `getItem` is also outside its parse `try/catch`.

**Acceptance:** mocked throwing getters/getItem/setItem/removeItem cannot crash the Live Session or sign-out; old schema behavior is explicit; storage failure is surfaced without blocking training.

### P2 — Deduplicate client-side catalog/detail reads

**Rule:** `client-swr-dedup`  
**Evidence:** `components/ExerciseLibrary.tsx:49-69`, `components/ExerciseCatalogTaxonomy.tsx:103-129`, and `components/exercise/catalog-detail.tsx:41-50` implement bespoke effect-driven requests and race handling. Reopening a detail or mounting another consumer has no shared cache. `@tanstack/react-query` is installed but unused.

**Impact:** medium-low today because these surfaces usually have one active instance, but repeated searches/detail reopens generate avoidable requests and maintain three custom request-state mechanisms.

**Recommendation:** standardize on one deduplicating client data layer—prefer the already installed TanStack Query or remove it and use SWR. Preserve debounce, offline behavior, latest-result semantics, and server-action auth boundaries. Do not add a provider globally unless these reads justify its app-wide client cost.

**Acceptance:** identical concurrent keys share one request; reopening a recently read detail hits cache under a documented stale time; stale responses cannot overwrite newer filters; offline/reconnect tests remain green.

### P3 — Avoid effect-driven preview invalidation

**Rules:** `rerender-derived-state-no-effect`, `rerender-move-effect-to-event`  
**Evidence:** `components/ProtocolBuilder.tsx:107-111` clears `preview` in an effect after every draft change. This guarantees an additional render after each edit, even when preview is already null.

**Impact:** low per edit, but it occurs in an already large interactive builder.

**Recommendation:** invalidate the preview in the reducer/dispatch boundary that applies structural draft edits, or derive preview validity from a revision captured at simulation time. The latter prevents stale display without synchronizing state in an effect.

**Acceptance:** a draft edit and preview invalidation commit in one render; a completed simulation can never display against a newer draft.

## Server deduplication opportunity

`apps/web/lib/api.ts:51-63` resolves Clerk auth and a token for every transport call. Multi-read routes issue several `apiGet` calls concurrently, so this seam may repeat token work inside one render. Clerk may internally memoize part of this path, so this is an **opportunity to measure**, not a confirmed latency defect. If traces show repeated work, wrap a no-argument read-only header resolver in `React.cache`; do not cache mutation results or headers across requests.

## What is already done well

- Independent critical reads already use `Promise.all` on Dashboard, Analytics, Protocol Detail, Log Detail, and the root layout.
- `resolveAppearance`, `resolveUserMode`, `resolveActiveSkin`, and `resolveIsAdmin` use request-local `React.cache` correctly.
- The dashboard's desktop-only chart applies both required defenses: `next/dynamic` and a 64rem mount gate.
- Client-only transient objects use lazy state initialization in important paths, including Live Session and Protocol Builder.
- Functional state updates are used where collection state depends on its prior value.
- Long-lived event subscriptions generally clean up correctly; no touch/wheel handlers missing `passive: true` were found.
- Source `.sort()` calls inspected in production logic clone or construct new arrays first; no mutation of React props/state was confirmed.
- Server Actions route authenticated transport through the JWT-attaching API seam, while backend endpoints remain the authorization backstop.
- Chart values are generated from the same rows as the plot, maintaining the accessibility invariant while bundle boundaries change.

## Recommended order of work

1. Add dynamic boundaries for the three eager chart families and remeasure manifests.
2. Parallelize the listed route/action reads; add delayed-fetch timing tests around representative cases.
3. Stream the optional dashboard review block.
4. Isolate Live Session timers and profile re-renders on a long fixture.
5. Harden/version browser storage.
6. Repair the lint script (`eslint .` or the repository's chosen equivalent) so future performance refactors regain a working static gate.
7. Adopt or remove the unused client query dependency after choosing one request-cache pattern.

## Evidence boundaries

Bundle figures come from a local optimized build and gzip compression of generated chunks. They do not include network protocol overhead, CDN compression differences, cache warmth, hydration CPU, or real-device execution. The app could not be served as an authenticated production-like session because Clerk keys were unavailable, so no Lighthouse trace, React Profiler capture, Server-Timing measurement, or Web Vitals field data is claimed. Findings about latency and re-render topology are source-backed; their user-visible magnitude should be confirmed with instrumentation after remediation.
