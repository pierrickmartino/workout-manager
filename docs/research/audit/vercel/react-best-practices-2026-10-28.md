# Vercel React best-practices audit: `apps/web`, 28 October 2026

**Audit date:** 28 October 2026. **Reviewed main:** `1bd31f4`. **Scope:** the Next.js
PWA under `apps/web` (Next 16.3.8, React 19.3.0), checked against the 70 rules of the
`vercel-react-best-practices` skill (`.claude/skills/vercel-react-best-practices/`),
most impactful first: waterfalls, bundle size, server, client fetching, re-renders,
rendering, JS, advanced.

This is a follow-up to the 10 October audit (`fb20d29`, removed from the tree in
`9f869de`; read it with `git show 9f869de^:docs/research/audit/vercel/react-best-practices-2026-10-10.md`).
That audit's V-1, V-2 and V-4 to V-9 are fixed. **V-3 is still open** and is carried here,
re-measured. New findings are numbered from V-10, so the IDs never collide.

**Method.**
- Read every `app/**/page.tsx` that has more than one `await`, the root layout, and the
  `loading.tsx` tree.
- Ran targeted sweeps for the rule patterns: sequential `await`s, `"use server"` modules
  called from client components, `useEffect` bodies that set state, module-level `let`,
  `<script>` tags, storage keys and schema versions, nested lookups (`.find` inside
  `.map`), inline component definitions, `&&` on counts.
- Ran a production `next build` (dummy Clerk keys, Turbopack): 45 routes, exit 0.
- Measured per-route client JS from each `page_client-reference-manifest.js`: the union of
  `entryJSFiles` and the `clientModules` chunks, deduplicated, each file `gzip -9`.
  Identified the large chunks by their string literals.

Not done: no signed-in browser run, no backend, no real-user timings, no render profiling,
no RSC payload capture. Each finding is labelled **measured** (build output) or **source**
(read from code).

## Summary

The guards added since the first audit hold: there are no new waterfalls in the pages
that make several reads, no barrel or icon leaks, no un-gated `recharts`, and no new
module state. What is left is mostly about **perceived latency on navigation** and one
**bundle** item carried over:

| ID | Finding | Rule | Impact | Evidence | Effort |
| --- | --- | --- | --- | --- | --- |
| V-3 | *(carried)* The `/analytics` client bundle still ships every atlas figure's path data, almost all of it at 3+ decimal places: a 36.3 KB gz chunk | `bundle-conditional`, `rendering-svg-precision`, `server-serialization` | **Medium** | measured + source | XS → M |
| V-10 | 14 dynamic routes have no loading boundary of their own, among them `/sessions/[id]`, `/sessions`, `/protocols` and `/exercises`. A tap shows nothing until the server finishes; three `/history/[id]/*` routes inherit the History *list* skeleton | `async-suspense-boundaries` | **Medium** | source | S |
| V-11 | Four client-side reads go through server actions. Next dispatches server actions one at a time, so they queue behind each other, and nothing is cached: reopening the same catalog drawer reads again | `client-swr-dedup` | Medium-low | source | XS → M |
| V-12 | Home's empty state reads the Curated Protocols *after* the main settle: a second serial round trip for exactly the users with no Current Protocol (new users) | `async-suspense-boundaries`, `async-defer-await` | Low-medium | source | XS |
| V-13 | History detail holds the whole page until the source plan is read, which only the AI Hand-off needs | `async-suspense-boundaries` | Low-medium | source | S |
| V-14 | Capture page reads the Profile and appearance after the record (the V-4 shape again) | `async-parallel` | Low | source | XS |
| V-15 | The Exercise image proxy buffers the whole upstream image before it responds | `async-api-routes` (streaming) | Low | source | XS |

## What is already right (no action)

Checked and met; most are enforced by a guard, so they will stay met:

- **Waterfalls:** every page that makes several independent reads starts them in one
  `Promise.all` (24 pages plus the layout). The remaining serial reads are real
  dependencies (the History first window depends on the index, ADR-0138; the Curated
  preview depends on finding the Protocol) or are listed below. `/train`, the Session
  detail prescriptions and the Exercise history tab stream behind `<Suspense>`.
- **Admin gate:** `resolveIsAdmin` reads the verified session claims, with no network
  call, so awaiting it before an admin read costs nothing.
- **Bundle:** `recharts` only through `next/dynamic` (`recharts-import-policy.ts`), icons
  through `pulse/icons`, no barrels, no third-party scripts, no `<script>` tags. Only the
  default Skin's fonts are preloaded (`font-preload-policy.ts`).
- **Server:** `lib/api.ts` is `server-only`; every server action writes through
  `apiSend` (Clerk token or `MissingAuthError`). `resolveAppearance`, `resolveActiveSkin`,
  `resolveAvatarUniverse` and `resolveUserMode` use `React.cache`, so the layout,
  `generateViewport` and the page share each round trip. No module reads static files at
  request time.
- **Client:** storage is versioned or schema-guarded (`form-draft-storage.ts` has a
  `version`, `live-session-storage.ts` validates every field, the outbox uses IndexedDB
  versioning). The Live Session slot is written on state changes, not on the clock tick.
- **Re-renders:** no components are defined inside components; the per-second tick stays
  in its leaf (ADR-0091); V-7 to V-9's effect fixes hold.
- **JS:** no `.find`/`.includes` inside `.map` over growing data; the largest `.find`
  count in any `lib/` module is 3, over fixed-size lists.

---

## Findings

### V-3 (carried): the atlas ships every figure's path data to the client (Medium)

**Status:** open since 10 October; tracked in `TASKS.md` §12.

**Measured (28 Oct):**
- `/analytics` has one route-specific chunk of **36.3 KB gz** (88.9 KB raw). It opens
  with `{male:{front:"-51 -1…`, so it is the atlas path data, and it is the largest
  chunk that only one route loads.
- `lib/atlas/reference/reference-data.ts` is 78.9 KB of source. **8,417 of its 9,083
  decimal coordinates have 3 or more decimal places**, in a viewBox about 320 units wide.

**Where it leaks in:** `components/analytics/muscle-region-atlas.tsx` (`"use client"`)
imports `static-atlas-figure.tsx`, which imports the `REFERENCE_PATHS` *value* from
`reference-data.ts`. `reference-atlas-figure.tsx` now imports only a type, so
`static-atlas-figure.tsx` is the one route in.

**Fix, in order of cost:**
1. **XS:** round to 1 decimal place in `scripts/generate-reference-atlas.mts` and
   regenerate (`rendering-svg-precision`). Re-run `atlas-assets.test.ts` and
   `atlas-render.test.ts`.
2. **M:** send only what is drawn. The page already resolves the figure on the server
   (`resolveFigure`). Either pass the resolved gender's paths as props, or render the
   static silhouette in a Server Component and keep only the interactive overlay as client
   code. Splitting `reference-data.ts` by gender keeps a client import from pulling in
   both.

**Check:** the `/analytics` chunk sum from the client reference manifest, before and
after (method above).

### V-10: dynamic routes with no loading boundary (Medium)

**Where:** every route is dynamic (`ƒ` in the build output), so a client navigation waits
for the server render. Without a `loading.tsx` on the route or above it, the router has no
shell to show or prefetch, and the tap gives **no feedback** until every awaited read
returns. ADR-0123 already defines the pattern (`SkeletonPage`, header outside, data region
dissolves).

Routes with **no** boundary at any level:
- **High traffic:** `/sessions/[id]` (awaits `fetchSession` before its own
  prescriptions `<Suspense>` can show), `/sessions`, `/protocols`, `/exercises`.
- **Authoring:** `/sessions/build`, `/sessions/log`, `/sessions/[id]/edit`,
  `/sessions/new`, `/logs/new`, `/protocols/new`, `/protocols/new/curated`,
  `/protocols/new/curated/[identifier]` (awaits a preview generation before render).
- **Other:** `/onboarding`, `/shared/[token]`.

Routes that inherit the **wrong** skeleton: `/history/[id]`, `/history/[id]/edit` and
`/history/[id]/capture` fall under `app/history/loading.tsx`, so they flash the History
list layout before the detail renders (and `RouteTransition` animates from that wrong
shape). `/exercises/[id]/progress` and `/profile/edit` inherit from their parents too;
check whether those shapes are close enough.

`/train` needs nothing: its one read already streams behind `<Suspense>`.

**Fix:**
- Add a `loading.tsx` returning `SkeletonPage` to the four high-traffic routes first, then
  to the History detail routes (their own shape), then the authoring routes.
  `skeleton-reveal-policy.ts` already checks the shape.
- For `/sessions/[id]`, also consider awaiting only the Session in the page and
  streaming the rest, so the header paints with the first read.
- Add one navigation to an `audit/` journey (Session list → Session detail) so the
  skeleton is rendered, not only declared. This overlaps the open §11 View Transitions
  item ("no CI journey drives a navigation yet").

**Check:** in a throttled (Slow 4G) signed-in run, time from tap to first paint of the
new route's header, before and after.

### V-11: client reads through server actions queue and do not cache (Medium-low)

**Where:** four `"use server"` functions are called from client components as **reads**:

| Action | Caller | When |
| --- | --- | --- |
| `fetchCatalogPage` (`app/exercises/actions.ts`) | catalog list | paging |
| `fetchCatalogTaxonomyForFilters` (`app/exercises/actions.ts`) | `ExerciseCatalogTaxonomy.tsx:103` | each debounced filter change |
| `fetchCatalogEntryDetail` (`app/exercises/catalog-detail-action.ts`) | `exercise/catalog-detail.tsx:45` | each drawer open |
| `fetchHistoryCards` (`app/history/history-cards-action.ts`) | `HistoryBrowser.tsx:90` | each History month window |

**Why it matters:**
- **Queueing:** React and Next dispatch server actions **one at a time** per client. On
  the catalog, opening a drawer while a filter read is in flight waits for that read to
  finish first, and a write (a favorite, for example) waits behind both. Next's docs
  recommend Route Handlers or Server Components for reads for this reason.
- **No dedup:** `CatalogDetail` clears `detail` and reads again every time the drawer
  opens, including for the row the user just closed. The same applies to going back to a
  History month already loaded.
- The effect in `CatalogDetail` also calls `setDetail(null)` on an id change. Keying the
  component by `exercise.id` resets it without the extra render
  (`rerender-derived-state-no-effect`).

**Fix, in order of cost:**
1. **XS:** keep a small per-session `Map` of catalog details by Exercise id (module
   level is safe here: client-only and keyed by id; cap it, like an LRU, at about 50), and
   render from it on reopen. Key `CatalogDetail` by `exercise.id`.
2. **M:** move the four reads to `GET` Route Handlers that call `apiGet` on the server,
   the way `/api/exercises/[id]/image` already does. The JWT still never reaches the
   browser (ADR-0022). Reads then run in parallel with writes and with each other, and
   can send `Cache-Control: private, max-age=…`. Needs a line in ADR-0022 on which
   transport client reads use.

**Check:** in DevTools, open a catalog drawer while a filter change is in flight. Today
the detail request starts only after the taxonomy response. After fix 2 they overlap.

### V-12: Home's empty state reads Curated Protocols after the main settle (Low-medium)

**Where:** `app/dashboard/page.tsx:99-102` awaits `fetchCuratedProtocols()` only once
`fetchHome()` has shown there is no Current Protocol. Users with a Current Protocol pay
nothing, but a **new user**, on their first Home view, pays two serial round trips
before anything renders.

**Fix:** move the protocol-choices block into its own async Server Component behind
`<Suspense>` (fallback `null` or `SkeletonReveal`, per ADR-0123), and render it only in
the empty state. The rest of Home paints after one round trip. Don't start the read
speculatively in the main `Promise.all`: most views have a Current Protocol and would
waste it.

### V-13: History detail waits on the plan for the AI Hand-off (Low-medium)

**Where:** `app/history/[id]/page.tsx:53-56` awaits `fetchSession(record.session_id)`
after the record. The plan feeds only `aiHandoff(...)` (ADR-0132), but the header, the set
tables and everything else wait for it. Every plan-backed record (most of them) pays a
second serial round trip.

**Fix:** move the hand-off into an async child behind `<Suspense>` that reads the plan
itself. The record renders after one round trip. The hand-off stays best-effort, as it is
now.

### V-14: Capture page waterfall (Low)

**Where:** `app/history/[id]/capture/page.tsx:26-39` awaits `fetchLog`, checks
`notFound` and redirect, then starts `fetchProfile()` and `resolveAppearance()`.
Neither depends on the record.

**Fix:** start all three in one `Promise.all` and run the `notFound` and redirect checks
after it, the same fix as V-4. A 404 or a plan-backed redirect wastes one cheap Profile
read.

### V-15: the image proxy buffers instead of streaming (Low)

**Where:** `app/api/exercises/[id]/image/route.ts` reads `await upstream.arrayBuffer()`
and then responds. The whole image is held in server memory and the first byte waits for
the last.

**Fix:** pass `upstream.body` straight to `new Response(...)` and copy
`content-length` when present. Keep the status and `Cache-Control` handling as they are.

---

## Considered and not recommended

- **A web-side cache for the layout's global reads** (`/api/active-skin`,
  `/api/avatar-universe`), `server-cache-lru`: they run on every render, but in parallel
  with the page's own reads. The backend already caches them with a short TTL
  (ADR-0048), so a web-side cache would save server load, not latency, and would make an
  admin's publish slower to appear. Revisit if the API's request rate becomes a measured
  problem.
- **Lazy-loading `@dnd-kit`:** still about 19 KB gz on 5 builder routes (measured).
  Dragging is the main interaction on those screens; the same conclusion as 10 October.
- **The every-route shell chunk** (about 17 KB gz): it holds the tab bar, sidebar,
  outbox sync, service-worker registrar, sync banner, navigation guard and confirm
  dialog. All of them are needed on every signed-in page.
- **`CorrectLogForm`'s serialize-after-rows effect:** it reads the *committed* DOM (the
  new inputs exist only after commit), so moving it into the `addRow` handler would read
  stale markup.
- **`ProtocolsIndexScreen` reading the live slot in an effect:** this is the
  hydration-safe way to read per-device storage that depends on the Clerk user. An inline
  script would have to know the account before hydration.
- **Module-level row counters** (`AdhocLogForm.tsx:63`, `hand-authored-draft.ts:99`):
  unchanged from 10 October. The keys never reach the DOM.

## Route client-JS reference (measured, gzip -9, all of a route's client chunks)

| Route | Client JS (gz) | Notes |
| --- | --- | --- |
| `/protocols/[id]/edit` | 120.9 KB | dnd-kit ~19 KB |
| `/analytics` | 115.0 KB | atlas data 36.3 KB (V-3) |
| `/sessions/log`, `/sessions/[id]/edit`, `/history/[id]/capture`, `/sessions/build` | 113.9–114.9 KB | dnd-kit ~19 KB |
| `/sessions/[id]` | 98.4 KB | |
| `/sessions/[id]/live` | 93.0 KB | |
| `/history` | 88.0 KB | |
| `/dashboard` | 85.4 KB | |
| static-ish routes (`/`, `/offline`, sign-in) | 76.3 KB | shell + Clerk floor |

The floor every route pays is about 76 KB gz (Clerk, the shell, React and Next). The
10 October table counted only route-specific chunks, so compare the ranking, not the
absolute numbers. These sizes come from a build with dummy keys: treat them as relative,
not as production transfer sizes. The 300 KB `script` budget in `budgets.json` is met on
every route.
