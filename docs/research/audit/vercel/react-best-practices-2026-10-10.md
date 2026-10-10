# Vercel React best-practices audit: `apps/web`, 10 October 2026

**Audit date:** 10 October 2026. **Reviewed main:** `0ec56f0`. **Scope:** the Next.js
PWA under `apps/web` (Next 16.3.8, React 19.3.0), checked against the 70 rules of the
`vercel-react-best-practices` skill (`.claude/skills/vercel-react-best-practices/`),
most impactful first: waterfalls, bundle size, server, client fetching, re-renders,
rendering, JS, advanced.

**Method.**
- Read every `app/**/page.tsx` and the root layout.
- Ran targeted sweeps for the rule patterns: sequential `await`s, `use client`
  boundaries, `next/dynamic`, effects, listeners, storage, module state, `.sort`,
  nested lookups.
- Read the large client components.
- Ran a production `next build` (dummy Clerk keys, Turbopack).
- Measured from the build output: preloaded fonts from
  `.next/server/next-font-manifest.json`, per-route client chunks from each
  `page_client-reference-manifest.js` (gzip -9 sizes).

Not done: no signed-in browser run, no real-user timings, no profiling of renders. Each
finding is labelled **measured** (build output) or **source** (read from code).

## Summary

The app already follows most of the high-impact rules, often enforced by a policy guard.
The audit found **3 worthwhile fixes**, **3 smaller ones** and **3 nits**:

| ID | Finding | Rule | Impact | Evidence | Effort |
| --- | --- | --- | --- | --- | --- |
| V-1 | History sends every Logged Session (with all its sets) to a client component and renders every card at once, so it grows with the user's whole record | `server-serialization`, `rendering-content-visibility` | **High** (grows over time) | source | S → M |
| V-2 | Fonts for all three Skins are preloaded on every route: 9 files, 235,096 bytes | `rendering-resource-hints`, `server-hoist-static-io` | **Medium-high** | measured | S |
| V-3 | The muscle atlas puts every figure's path data (both genders, front and back, up to 4 decimal places) in the `/analytics` client bundle: a 36.4 KB gz chunk | `bundle-conditional`, `rendering-svg-precision`, `server-serialization` | **Medium** | measured + source | M |
| V-4 | Protocol edit page fetches the Protocol, then the Profile and appearance one after the other | `async-parallel` | Low-medium | source | XS |
| V-5 | Session detail makes one HTTP call per prescription for harder-variation offers (a 12-way fan-out, each with its own token lookup) | `server-parallel-nested-fetching` (API shape) | Medium (server cost) | source | M (API + web) |
| V-6 | Strength analytics awaits appearance after its main fetch | `async-parallel` | Low | source | XS |
| V-7 | `ProtocolBuilder` clears the preview in an effect after every draft change | `rerender-derived-state-no-effect` | Low | source | XS |
| V-8 | `ExerciseLibrary` resets search state in an effect when the query changes | `rerender-move-effect-to-event` | Low | source | XS |
| V-9 | `useWideViewport` / `useChartTheme` start from a fallback and correct it in an effect | `rerender-*`, `client-event-listeners` | Low | source | S |

## What is already right (no action)

These rules were checked and are met. Most are enforced by a guard, so they will stay
met:

- **Waterfalls:**
  - 20 of 37 pages (and the root layout) already use `Promise.all` for independent
    reads. The rest make a single read.
  - `resolveAppearance`, `resolveIsAdmin` and `resolveActiveSkin` are wrapped in
    `React.cache`, so the layout and the page share each round-trip
    (`server-cache-react`).
  - The slow harder-variation fan-out streams behind `<Suspense>`, so it no longer
    holds back the header (`async-suspense-boundaries`).
- **Bundle:**
  - `recharts` can only be imported through `next/dynamic`, enforced by
    `lib/recharts-import-policy.ts`.
  - Icons go through `components/pulse/icons` (`lib/icon-import-policy.ts`).
  - There are no barrel files.
  - `lib/client-boundary-policy.ts` and `lib/clerk-import-policy.ts` keep client
    boundaries small.
  - There is no third-party analytics script to defer.
- **Server:**
  - Every server action (21 modules) writes through `apiSend`. It attaches the Clerk
    token or throws `MissingAuthError`, and the backend checks ownership and the admin
    role (`server-auth-actions`).
  - `lib/api.ts` is `server-only`.
  - The image optimizer is off (ADR-0095).
- **Client:**
  - There are no scroll or touch listeners, so `client-passive-event-listeners` does
    not apply.
  - The global listeners (online, visibility, beforeunload) are each registered once.
- **Rendering:**
  - The admin catalog uses the `.list-row-defer` class (`content-visibility: auto`,
    ADR-0097).
  - The Live Session clock tick is isolated (#587).
  - `muscle-figure.tsx` on the exercise page is a Server Component, so its SVG costs no
    client JS.
- **Module state:** the only module-level mutable values are the row-key counters in
  `AdhocLogForm` and `HandAuthoredSessionForm`. They are client components, and the keys
  never reach the DOM, so sharing the counter during SSR is harmless. Move them to
  `useRef`/`useId` if a counter ever feeds an `id` or `name` attribute.

---

## Findings

### V-1: History sends and renders the whole record (High, grows over time)

**Status:** fixed by [ADR-0128](../../../adr/0128-history-is-a-full-index-over-windowed-records.md)
(fix 3 together with fixes 1 and 2). For a seeded 300 × 15-set history, the History props go
from 1,303 KB to 183 KB raw (20.1 KB to 4.7 KB gz) and first-load cards from 300 to 30
(`node apps/web/audit/history-payload.mjs`; serialized props, not a live RSC capture).

**Where:**
- `app/history/page.tsx` → `fetchHistory()` → `GET /api/logs`
  (`apps/api/app/routes/logs.py:488`) has no limit and returns every Logged Session
  with all its Logged Sets.
- The whole array is passed as a prop to `HistoryBrowser` (`"use client"`), which
  renders a `LoggedSessionCard` with a full `LoggedSetTable` for every record
  (`components/HistoryBrowser.tsx:195`, `:303`).

**Why it matters:**
- **RSC payload:** the props are serialized into the RSC payload and kept in client
  memory, so the payload grows linearly with the user's training history. A user with
  two years of 3×/week training has about 300 sessions and several thousand set rows.
- **Rendering:** the list has no `content-visibility`, so every card is styled, laid
  out and painted on first load.
- **Client-side filtering:** filtering is client-side by design (Q4/Q8: a filter change
  must not re-run the fetch), so the cost is also paid on every filter change.

**Fix, in order of cost:**
1. **XS:** add the existing `.list-row-defer` utility (or a variant with an intrinsic
   size tuned to the card) to each `<li>`. This saves rendering work for off-screen
   cards. The rows stay in the DOM and the accessibility tree (ADR-0097).
2. **S:**
   - Map records to a slim history-row view-model on the server, in `lib/`, with a
     test. Keep only what the card shows and drop the rest of each wire record.
   - Consider rendering each set table collapsed (`<details>`) so the set rows are
     not laid out until opened.
3. **M:**
   - Window the list: send the newest N records plus a total, and add "show more".
   - The deletability verdicts are still computed on the server over the full history
     (ADR-0034), so the gate does not change.
   - The trade-off is with client-side filtering across all records. Either filter on
     the server for older pages, or keep a light index of the filterable fields.
     Needs a short ADR.

**Check:** record the RSC payload size of `/history` for a seeded user with 300
sessions, before and after.

### V-2: Every Skin's fonts are preloaded on every route (Medium-high, measured)

**Where:**
- `app/layout.tsx:44-104` sets up seven `next/font/google` families: PULSE (Space
  Grotesk, JetBrains Mono), Aurora (Bricolage Grotesque, Inter, IBM Plex Mono ×3
  weights) and Vercel (Geist, Geist Mono).
- They use the default `preload: true`.

**Measured:**
- Every one of the 38 app entries in `next-font-manifest.json` lists the same **9
  woff2 files, 235,096 bytes in total**.
- Each is emitted as a `<link rel="preload">`, so the browser downloads all of them at
  high priority on first visit, competing with the critical CSS and JS.
- Only the active Skin's 2–3 families are ever used.
- The layout comment ("Unused handles cost only their font payload, which next/font
  lazy-loads per glyph coverage") is wrong about preloading. `unicode-range` only stops
  the download when there is *no* preload.

**Fix:**
- Set `preload: false` on the Aurora and Vercel families and keep the default PULSE
  families preloaded.
- A published non-default Skin then loads its fonts with `display: swap` on first
  paint instead of preloading them. The trade-off is a brief font swap for those
  Skins.
- Better, if worth it: emit `<link rel="preload">` only for the *active* Skin's files
  from the layout, which already resolves `activeSkin`. Use React DOM's `preload()`
  (`rendering-resource-hints`) with the hashed URLs from the build.
- Fix the comment, and add a note to ADR-0050 (the fixed-catalog font decision).

**Check:** re-read `next-font-manifest.json` after the change. The expected result is
the PULSE files only.

### V-3: The atlas ships every figure's path data to the client (Medium)

**Where:**
- `components/analytics/muscle-region-atlas.tsx` (`"use client"`) imports
  `reference-atlas-figure.tsx`.
- That imports `REFERENCE_PATHS` from `lib/atlas/reference/reference-data.ts`: 78.8 KB
  of source with male *and* female, front *and* back paths.
- The file has 1,407 coordinates with 4 or more decimal places, in a viewBox about
  320 units wide.

**Measured:** the `/analytics` client graph contains one 36.4 KB gz chunk that is almost
all this path data. It is the largest route-specific chunk on that page. For comparison,
#586 moved the chart bundles off this route.

**Fix:**
- **Precision (XS):** round coordinates to 1 decimal place when generating
  `reference-data.ts` (`rendering-svg-precision`). A 0.1-unit error is invisible at
  this viewBox. Re-run `atlas-assets.test.ts` / `atlas-render.test.ts`.
- **Send only what is drawn (M):**
  - The page already resolves the figure on the server (`resolveFigure` in
    `app/analytics/page.tsx`).
  - Pass only the resolved gender's paths as props, or render the static base
    silhouette in a Server Component and keep only the interactive overlay as client
    code (`server-serialization`).
  - Split `reference-data.ts` by gender, so a client import cannot pull in both.

**Check:** sum the `/analytics` chunks in `page_client-reference-manifest.js` before
and after (CLAUDE.md: "a green guard is not a measurement").

### V-4: Protocol edit page waterfall (Low-medium)

**Where:**
- In `app/protocols/[id]/edit/page.tsx:25-38`, `fetchProtocol` is awaited first.
- Only then does `Promise.all([fetchProfile(), resolveAppearance()])` start.
- The Profile and appearance reads don't depend on the Protocol. The only reason for
  the order is the early `notFound()`.

**Fix:**
- Start all three together:
  `const [envelope, profileEnvelope, appearance] = await Promise.all([...])`.
- Then call `notFound()`.
- Await `searchParams` alongside them too.
- The cost is one wasted Profile read on a 404, which is rare and cheap.

### V-5: Harder-variation N-way fan-out (Medium, server cost)

**Where:**
- `app/sessions/[id]/page.tsx:302` calls `fetchHarderVariation` once per prescription
  in parallel.
- Each call goes through `apiGet`, so each runs `auth()` + `getToken()` and makes its
  own HTTP round-trip.
- A 12-exercise Session makes 12 backend requests per view. Most return `null` (the
  code's own comment).

Streaming already stops this from blocking the header, so the remaining cost is server
load and time until the cards appear.

**Fix:**
- Add a batch read, for example `GET /api/sessions/{id}/harder-variations`, that
  returns the offers by position. It goes through a repository, like any other
  endpoint, and returns the envelope.
- Call it once from `PrescriptionList`.
- The domain rule (pure-bodyweight rep ceiling) stays in the backend.

### V-6: Strength analytics sequential appearance read (Low)

**Where:** in `app/analytics/strength/page.tsx:50,65`, `resolveAppearance()` is awaited
after `fetchStrengthAnalytics`. It is `React.cache`d and the layout usually has it in
flight already, so the real delay is small.

**Fix:** put both in one `Promise.all`. This keeps the page correct even if the layout
stops reading appearance.

### V-7: `ProtocolBuilder` resets the preview in an effect (Low)

**Where:** `components/ProtocolBuilder.tsx:109` runs
`useEffect(() => { setPreview(null) }, [draft])`. Every draft edit renders once with the
stale preview, then commits a second render to clear it.

**Fix:**
- Store the draft the preview was computed from, and derive it during render:
  `const shownPreview = preview?.draft === draft ? preview.value : null`.
- Or clear it inside the reducer dispatch path.
- This avoids the extra render and the one-frame flash of an outdated preview.

### V-8: `ExerciseLibrary` resets state in an effect (Low)

**Where:** `components/ExerciseLibrary.tsx:49` clears `createError`, `results`, `error`
and `searched` inside the `[query]` effect.

**Fix:**
- Do the synchronous resets in the input's `onChange`, next to `setQuery`.
- Keep only the debounced fetch (and its cleanup) in the effect.
- React then batches the resets with the keystroke instead of rendering again after
  commit.

### V-9: Viewport and chart-theme hooks correct themselves after mount (Low)

**Where:**
- `lib/use-wide-viewport.ts` and `lib/use-chart-theme.ts` start from a fallback
  (`false` / `CHART_THEME_FALLBACK`) and set the real value in an effect.
- On a wide screen or a non-default theme, every mounted chart renders twice, and the
  first frame uses the wrong layout or colours.
- Each mounted chart adds its own `matchMedia` listener (and a `MutationObserver` for
  the theme).

**Fix:**
- Rewrite both hooks on `useSyncExternalStore`, with one module-level subscription
  shared by every consumer (`client-event-listeners`).
- Give `getServerSnapshot` the current fallback, so SSR output is unchanged.
- Only worth it if V-1–V-3 are done; there are only four consumers today.

---

## Considered and not recommended

- **Lazy-loading `@dnd-kit` on the builder routes:**
  - It adds about 19–30 KB gz to `/protocols/[id]/edit`, `/sessions/build`,
    `/sessions/log` and `/history/[id]/capture` (measured).
  - Drag reordering, including its keyboard sensor, is the main interaction on those
    screens, so deferring it would only delay the first drag.
  - Look at it again only if those routes' total JS becomes a measured problem.
- **`toSorted()` sweeps:** every `.sort()` in `lib/` already runs on a fresh copy
  (`[...x].sort` or the result of a chain). Switching is a style change with no
  performance gain.
- **`after()` for non-blocking work:** no route does logging or analytics after
  responding, so there is nothing to defer.

## Route client-JS reference (measured, gzip -9, route-specific chunks)

| Route | Client JS (gz) | Notes |
| --- | --- | --- |
| `/protocols/[id]/edit` | 116.5 KB | dnd-kit ~30 KB |
| `/analytics` | 114.7 KB | atlas data 36.4 KB (V-3) |
| `/sessions/build`, `/sessions/log`, `/history/[id]/capture` | 112.3 KB | dnd-kit ~19 KB |
| `/sessions/[id]` | 94.8 KB | |
| `/sessions/[id]/live` | 92.5 KB | |
| `/dashboard` | 84.7 KB | |

About 64 KB gz of each route is the shared Clerk and shell chunks. These sizes come from
a build with dummy keys, so treat them as relative, not as production transfer sizes.
