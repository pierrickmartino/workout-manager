# React/Next.js performance audit — `apps/web`

Audited against the Vercel React Best Practices ruleset (70 rules, 8 categories).
Scope: `apps/web` only (35 routes, 64 Client Components, ~17.8k lines of components).
Date: 2026-09-30.

**Measurement caveat:** `apps/web/node_modules` is not installed in this environment, so
no production build was run. Every bundle number below is either quoted from the repo's own
prior measurement (ADR-0088 / #576 review, recorded in `components/pulse/volume-chart-wide.tsx`)
or derived from static import-graph reachability. Findings B1 and B2 should be confirmed with
`.next/server/app/<route>/page_client-reference-manifest.js` before and after any fix, per the
procedure CLAUDE.md already prescribes.

**Update (B1, B2 — fixed):** that confirmation has since been run. B1's reachability estimate
held and the measured before/after numbers are in its section below; B2's zero-reference claim
held too. The rest of this document is unrevised and still carries the caveat above.

---

## Summary

The codebase is, on the whole, unusually disciplined. Nearly every rule in the *Server-Side
Performance*, *JavaScript Performance*, and *Rendering Performance* categories is already
satisfied, in several cases deliberately and with an ADR explaining why. `React.cache()` wraps
the per-request resolvers, `Promise.all` is the default idiom in Server Components, sorts are
on copies, conditional rendering uses ternaries throughout, and third-party registration is
deferred past `load`.

The findings that remain concentrate in two places:

1. **A per-second full re-render of the Live Session screen** — the most performance-sensitive
   surface in the app (a phone, mid-workout, with the screen held awake). This is the single
   highest-impact finding.
2. ~~**Recharts reaching three routes through static imports**~~, when the project has already
   built and documented the pattern for avoiding exactly that on a fourth. **Fixed** — see B1.

Everything else is minor.

| ID | Severity | Category | Finding |
|----|----------|----------|---------|
| R1 | **High** | Re-render | 1 Hz `setNow` re-renders all of `LiveSessionScreen` + the full set table |
| B1 | ~~High~~ **Fixed** | Bundle | ~~Recharts statically imported on `/exercises/[id]`, `/analytics`, `/analytics/strength`~~ — ADR-0090 |
| A1 | **High** | Waterfall | `/exercises/[id]` serializes 4–5 round trips |
| A2 | Medium | Waterfall | `/admin/exercises/[id]` serializes 4 round trips |
| A3 | Medium | Waterfall | `/sessions/[id]/live` serializes 3 round trips |
| A4 | Medium | Waterfall | `/train` blocks all paint on a 2-stage fetch chain; no Suspense, no `loading.tsx` |
| R2 | Medium | Re-render | No `React.memo` anywhere; unstable props defeat any future memoization |
| R3 | Low-Med | Re-render | Rest-timer effect re-runs every second to test a derived condition |
| B2 | ~~Low~~ **Fixed** | Bundle | ~~`@tanstack/react-query` is a dependency with zero source references~~ |
| C1 | Low | Client data | Live Session `localStorage` slot carries no schema version |

---

## 1. Eliminating Waterfalls (CRITICAL)

### A1 — `/exercises/[id]` serializes four to five round trips · **High**

`app/exercises/[id]/page.tsx:49-76`

```
await fetchExercise(exerciseId)        // line 49
await fetchExerciseRecords(exerciseId) // line 60
await fetchHome()                      // line 66
await resolveAppearance()              // line 76
```

Four sequential `await`s, none of which depends on the previous one. `fetchExerciseRecords`,
`fetchHome` and `resolveAppearance` all take only `exerciseId` or nothing — they are
independent by inspection. On the HISTORY tab a fifth read (`fetchExerciseProgress`, line 137)
is nested inside the `HistoryTab` child component and so serializes *after* all four.

The page's own comments acknowledge each read is best-effort and non-blocking ("A failed read
simply omits the header", "simply leaves the control a disabled seam") — which is precisely the
argument for settling them together rather than in sequence.

Rule: `async-parallel`. Fix:

```ts
const { id } = await params;
const exerciseId = Number(id);
if (!Number.isInteger(exerciseId)) notFound();

const [envelope, recordsEnvelope, homeEnvelope, appearance] = await Promise.all([
  fetchExercise(exerciseId),
  fetchExerciseRecords(exerciseId),
  fetchHome(),
  resolveAppearance(),
]);
if (!envelope.success || !envelope.data) notFound();
```

Note `apiGet` **rejects** on a transport failure rather than returning an unsuccessful envelope
— the same trap `app/dashboard/page.tsx:54` documents. The three best-effort reads therefore
need `.catch(() => null)` (and a null check at the use site) so a flaky records read cannot take
down a page that is designed to render without it. Only `fetchExercise` should be allowed to
reject.

For the HISTORY tab, either hoist `fetchExerciseProgress` into the same `Promise.all` when
`tab === "history"`, or wrap `<HistoryTab>` in `<Suspense>` so the shell streams while it
resolves (`async-suspense-boundaries`). The latter is better: it keeps the fetch off the
critical path for the other two tabs entirely.

Expected effect: 4–5 serial RTTs collapse to 1. At a 50 ms backend RTT that is ~200 ms off TTFB;
at 150 ms it is ~600 ms.

### A2 — `/admin/exercises/[id]` serializes four round trips · **Medium**

`app/admin/exercises/[id]/page.tsx:36-59`

```
await resolveIsAdmin()                        // line 36
await fetchAdminExercise(exerciseId)          // line 43
await fetchAdminExerciseAudit(exerciseId)     // line 49
await fetchAdminExerciseRelationships(...)    // line 55
```

`resolveIsAdmin` is a legitimate sequential gate — it reads session claims and must pass before
anything admin-only is fetched, and it is `React.cache()`d so the layout's call already warmed
it. The other three are independent and both the audit and relationships reads are explicitly
commented as best-effort:

```ts
const [envelope, auditEnvelope, relationshipsEnvelope] = await Promise.all([
  fetchAdminExercise(exerciseId),
  fetchAdminExerciseAudit(exerciseId).catch(() => null),
  fetchAdminExerciseRelationships(exerciseId).catch(() => null),
]);
```

Admin-only, so user-facing impact is low — but it is the same one-line fix.

### A3 — `/sessions/[id]/live` serializes three round trips · **Medium**

`app/sessions/[id]/live/page.tsx:22-41`

```
await fetchLiveSession(sessionId)  // line 22
await fetchProfile()               // line 30
await resolveAppearance()          // line 40
```

All three independent. This one matters more than its size suggests: it is the entry point to
the workout screen, the user has just tapped "Start", and they are standing in a gym on mobile
data. `fetchProfile` and `resolveAppearance` are both documented as never blocking the workout
("a failed/empty profile read simply leaves it null"), so both belong in the `Promise.all` with
a `.catch()`, with only `fetchLiveSession` able to reject into `notFound()`.

### A4 — `/train` blocks all paint on a two-stage chain · **Medium**

`app/train/page.tsx:23-62`

`loadRecentSessions()` is internally well-built — `fetchHistory` + `fetchSessions` in parallel,
then a genuinely dependent per-item fan-out via `Promise.all` (`server-parallel-nested-fetching`,
correctly applied). The problem is at the page level: `TrainPage` awaits the whole chain at
line 62 before returning *any* JSX, and everything above the Recent Sessions panel — the page
header, the descriptive paragraph, `GenerateTrainingLaunchpad` — is fully static.

There is no `app/train/loading.tsx` and no Suspense boundary, so the user sees nothing for the
duration of two sequential RTTs plus an N-way fan-out.

Rule: `async-suspense-boundaries`. Fix — move the fetch into the leaf and stream it:

```tsx
export default function TrainPage() {
  return (
    <section className="flex flex-col gap-6">
      <PageHeader overline="PULSE // TRAIN" title="Start new training" />
      {/* …static launchpad renders immediately… */}
      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <RecentSessionsPanel />
      </Suspense>
    </section>
  );
}
```

`RecentSessionsPanel` becomes the `async` component that calls `loadRecentSessions()`.

**Related:** `loading.tsx` exists for 7 of 35 routes (`dashboard`, `analytics`,
`analytics/strength`, `history`, `metrics`, `profile`, `profile/achievements`). The data-heavy
routes missing one include `/train`, `/exercises/[id]`, `/sessions/[id]`, `/protocols/[id]` and
the admin pages. Adding `loading.tsx` to each is cheap and turns a blank wait into a streamed
shell.

### Also noted — per-prescription fan-out

`app/sessions/[id]/page.tsx:116-118` issues one `fetchHarderVariation` call per prescription
inside a `Promise.all`. This is the correct shape (parallel, not serial) and is exactly what
`server-parallel-nested-fetching` prescribes, so it is **not** a finding. It is worth knowing
that a 12-exercise session fires 12 concurrent backend calls; if that shows up in backend
latency, a batch endpoint is the structural fix, not a frontend change.

---

## 2. Bundle Size Optimization (CRITICAL)

### B1 — Recharts statically imported on three routes · ~~**High**~~ · **Fixed**

> **Resolved** — [ADR-0090](../../../adr/0090-a-chart-is-reached-only-through-a-dynamic-import.md).
> Each chart now has one `*-lazy.tsx` `next/dynamic` wrapper and every surface goes through
> it (`volume-chart-wide.tsx` included, which keeps only its mount gate). Measured from the
> per-route client-reference manifests, before → after, gzipped client JS:
>
> | Route | Before | of which charting | After | of which charting |
> |---|---|---|---|---|
> | `/analytics` | 221.4 KB | 144.4 KB | **114.4 KB** | 0 KB |
> | `/analytics/strength` | 180.0 KB | 103.0 KB | **77.7 KB** | 0 KB |
> | `/exercises/[id]` | 180.0 KB | 103.0 KB | **77.7 KB** | 0 KB |
> | `/dashboard` (control) | 81.7 KB | 0 KB | 81.8 KB | 0 KB |
>
> The guardrail this section's closing note asked for landed with it:
> `apps/web/lib/recharts-import-policy.ts` fails on any static import of a chart module,
> with an empty exemption registry. It reproduced all four violations before the fix.

The original finding follows.


The project has already measured this cost and written it down. From
`components/pulse/volume-chart-wide.tsx:13-16`:

> Measured on `/dashboard`: 2 chunks, 402 KB raw / **110 KB gzipped**, against the ~10 KB
> budget ADR-0088 sets — 11× over.

That component solves it properly — `next/dynamic` with `ssr: false` plus a `useWideViewport`
mount gate, because (as its comment correctly notes) `hidden lg:flex` still renders and
hydrates. It is the only `next/dynamic` call site in the codebase.

The same library reaches three other routes through plain static imports:

| Importer | Route(s) | Visible? |
|---|---|---|
| `components/pulse/volume-chart.tsx:3` | `/analytics` (`app/analytics/page.tsx:19`) | Yes |
| `components/pulse/distance-chart.tsx` | `/analytics` (`app/analytics/page.tsx:21`) | Conditionally |
| `components/exercise/top-set-trend-chart.tsx` | `/exercises/[id]` via `specs-panel.tsx:22` | **Conditionally** |
| `components/exercise/top-set-trend-chart.tsx` | `/analytics/strength` via `strength-trajectories.tsx:6` | Conditionally |

`/exercises/[id]` is the sharpest case. `SpecsPanel`'s `TopSetTrend` returns `null` when
`trend.rows.length === 0` (`components/exercise/specs-panel.tsx:123`) — a bodyweight or
never-logged exercise renders no chart at all. It also renders nothing on the HISTORY and
RECORDS tabs. But because the import is static, ~110 KB gzipped is in the route's client chunk
graph for **every** visit to **every** tab, including the many that draw no chart. Same story
for `strength-trajectories.tsx`, which returns `null` for a user with no qualifying lifts
(line 25).

This is a mobile-first PWA. `/exercises/[id]` is a browse surface users reach from six
different origins, per the page's own `?from=` comment.

Rules: `bundle-dynamic-imports`, `bundle-conditional`. Fix — apply the pattern
`volume-chart-wide.tsx` already establishes, minus the viewport gate (these charts are genuinely
visible on mobile, so the gate is *data* presence, not width):

```tsx
// components/exercise/top-set-trend-chart-lazy.tsx
"use client";
import dynamic from "next/dynamic";

const TopSetTrendChart = dynamic(
  () => import("./top-set-trend-chart").then((m) => m.TopSetTrendChart),
  { ssr: false, loading: () => <Skeleton className="h-40 w-full" /> },
);
```

Then have `specs-panel.tsx` and `strength-trajectories.tsx` import the lazy wrapper. Because
both already early-return `null` when there are no rows, the chunk is never requested for users
with no data, and for users with data it loads in parallel with the rest of hydration instead of
blocking it.

Apply the same to `/analytics` for `VolumeChart` and `DistanceChart`. `DistanceChart` in
particular is conditional (cardio series only), so the same reasoning applies.

**Verify the claim before and after**, per CLAUDE.md's own instruction: inspect
`.next/server/app/exercises/[id]/page_client-reference-manifest.js` for the recharts chunks.

**ADR-0084 is preserved** by this change, exactly as `volume-chart-wide.tsx` argues for its own
case: `ChartValues` ships *inside* each chart component from the same rows, so wherever the plot
mounts the text table mounts beside it, and where neither mounts there is no plotted datum to
make retrievable. Worth restating in the ADR trail if you make the change.

### B2 — `@tanstack/react-query` is an unused dependency · ~~**Low**~~ · **Fixed**

> **Resolved** — removed from `apps/web/package.json` and `package-lock.json`
> (`@tanstack/react-query` and its `@tanstack/query-core` transitive). `npm ci` and both
> suites pass without it, confirming the zero-reference finding.

The original finding follows.


`apps/web/package.json:20` declares `@tanstack/react-query@^5.59.0`. A repo-wide search across
`.ts`, `.tsx`, `.mjs` and `.js` (excluding `node_modules`/`.next`) finds **zero** references.

The architecture explains why: all reads go through `lib/api.ts` server-side (`import
"server-only"`, so the JWT never reaches the browser), and writes go through Server Actions.
There is no client-side data fetching to deduplicate. The dependency appears to be a leftover.

It is tree-shaken out of the client bundle since nothing imports it, so the runtime cost is
zero — but it is install weight, a supply-chain surface, and a misleading signal to the next
reader about how this app fetches data. Remove it.

(For the same reason, the entire *Client-Side Data Fetching* rule `client-swr-dedup` is
**N/A** here by design, not by omission. That is a good architecture, not a gap.)

### Acknowledged, not a finding — seven font families

`app/layout.tsx:1-80` loads Space Grotesk, JetBrains Mono, Bricolage Grotesque, Inter, IBM Plex
Mono, Geist and Geist Mono eagerly via `next/font/google`. The layout comment names this as the
deliberate fixed-catalog trade-off of ADR-0050: bundling all Skins' typefaces up front is what
lets an admin publish a Skin and have it apply on the next visit with no runtime fetch.

`next/font` self-hosts at build time with `display: "swap"`, so this is correctly implemented
(`server-hoist-static-io` satisfied) and costs no render-blocking network request. Flagged only
so the cost is visible: if the Skin catalog grows, subsetting per-Skin or lazily loading
non-active Skins' fonts becomes worth revisiting.

### Barrel imports — clean

65 `lucide-react` import sites, all named imports (`import { Zap } from "lucide-react"`).
Next.js 16 ships `lucide-react` in its default `optimizePackageImports` list, so these are
rewritten to direct paths automatically and `bundle-barrel-imports` is satisfied without config.
`next.config.js` is minimal and needs no change for this. `@dnd-kit` is confined to two builder
components (`components/builder/prescription-rows.tsx`,
`components/builder/session-composition-strip.tsx`) and so only reaches the builder routes —
correct scoping.

---

## 3. Server-Side Performance (HIGH) — largely clean

This category is in good shape.

- **`server-cache-react` — satisfied.** `React.cache()` wraps every repeated per-request
  resolver: `resolveActiveSkin` (`lib/active-skin.ts:41`), `resolveIsAdmin`
  (`lib/admin.ts:28`), `resolveAppearance` (`lib/appearance.ts:73`), `resolveUserMode`
  (`lib/appearance.ts:88`). The root layout and individual pages both call these, and the cache
  is what stops that being a duplicate fetch on every render. `lib/admin.ts:26` documents the
  intent explicitly.
- **`server-parallel-fetching` — mostly satisfied.** 17 of 35 routes use `Promise.all`,
  including the root layout (`app/layout.tsx:147`). The exceptions are A1–A3 above.
- **`server-no-shared-module-state` — satisfied.** No module-level mutable request state; the
  only module-level values in `lib/api.ts` are the frozen `API_URL` and constants.
- **`server-hoist-static-io` — satisfied.** Fonts are hoisted to module scope in the layout.
- **`server-serialization`** — Server Components hand view-models (already projected in
  `lib/*`) to thin Client Components rather than raw envelopes, which is the shape this rule
  asks for.

One thing to consider, not a defect: `lib/api.ts:66-69` calls `authHeaders()` — and therefore
`await auth()` + `await getToken()` — on every single `apiGet`/`apiSend`. Inside a `Promise.all`
these run concurrently so they add no waterfall, and Clerk caches the resolved session per
request. If a profiler ever shows `getToken()` as hot, wrapping `authHeaders` in `React.cache()`
is the one-line answer, consistent with how the rest of the file's collaborators are handled.

---

## 4. Client-Side Data Fetching (MEDIUM-HIGH)

### C1 — Live Session `localStorage` slot carries no schema version · **Low**

`lib/live-session-storage.ts:15` writes the whole engine state to one key
(`workout-manager.live-session`) as raw `JSON.stringify(state)`, with no version field.

`lib/form-draft-storage.ts:8` does this correctly — `FORM_DRAFTS_VERSION = 1`, stored in the
payload, checked on read (`line 60`), and a version mismatch discards the collection.

The Live Session slot instead relies on structural validation (`isLiveSessionState`) plus
ad-hoc migration: `lib/live-session-storage.ts:42-46` already carries a hand-rolled shim for
"a slot written before #412 (no finish key)". That shim is the smell — it is the first of the
migrations a version field exists to make unnecessary, and it works only because the change was
additive-and-nullable. A future field that is *not* nullable, or a changed meaning for an
existing field, will pass `isLiveSessionState` and resume a workout into a subtly wrong state.

Rule: `client-localstorage-schema`. Fix: add `version: LIVE_SESSION_VERSION` to the written
payload and reject a mismatch on read, exactly as `form-draft-storage.ts` does. Bump it when
`LiveSessionState` changes shape, and the `?? null` shim at line 45 can eventually retire.

Severity is low because the current validation genuinely does prevent a crash — a corrupt slot
deserializes to `null` and the user starts fresh. This is about the next shape change, not
today's.

### Clean in this category

- **`client-passive-event-listeners` — N/A.** There are no `scroll`, `touchmove` or `wheel`
  listeners anywhere. All 15 `addEventListener` call sites are on discrete events (`online`,
  `offline`, `visibilitychange`, `pagehide`, `focusin`, `keydown`, `change`, `load`,
  `beforeunload`, one capture-phase `click`), none of which benefits from `{ passive: true }`.
- **`client-event-listeners` — satisfied.** Global listeners are registered once in app-scope
  registrars mounted from the root layout (`OutboxSyncRegistrar`, `NavigationGuardProvider`,
  `ServiceWorkerRegistrar`), not per-component.

---

## 5. Re-render Optimization (MEDIUM)

### R1 — 1 Hz timer re-renders the entire Live Session screen · **High**

`components/LiveSessionScreen.tsx:225-228`

```ts
useEffect(() => {
  const interval = setInterval(() => setNow(Date.now()), 1000);
  return () => clearInterval(interval);
}, []);
```

`now` is component state, and it feeds two values consumed in the main render body:

- `const restRemaining = restRemainingSeconds(restEndAt, now);` (line 323)
- `const elapsed = formatElapsed(elapsedSeconds(state.startedAt, now));` (line 352)

So once per second, the whole 830-line component re-renders. The component has **zero**
`useMemo` and **zero** `useCallback` (verified by grep), which means every one of these is
recomputed on every tick:

```ts
const percent      = progressPercent(state);       // line 335
const unit         = currentUnit(state);           // line 336
const superset     = currentSuperset(state);       // line 337
const onDeck       = onDeckExercise(state);        // line 341
const following    = nextExercise(state);          // line 342
const units        = groupUnits(state);            // line 343
const completedCount = state.sets.filter(...)      // line 351
const advisory     = finishAdvisory(state);        // line 356
```

`groupUnits` (`lib/live-session.ts:664-694`) is the expensive one: it allocates a `Map`, an
order array, a fresh `LiveUnit[]`, and a fresh `sets` array plus a computed `summary` string per
unit — and it returns **entirely new object identities every second** for data that has not
changed.

That fresh `units` array is then passed straight to `<LiveSessionSets units={units} …>`
(line 638-647), along with an inline arrow `onSkipSet={() => dispatch({ type: "ADVANCE" })}`
(line 644) that is a new function identity each tick. `LiveSessionSets`
(`components/live-session-sets.tsx`, 369 lines) is not memoized, so every set row — each with
its own `useState` for reps/load/RPE, its `Select`, its `Input`s — re-renders once per second.

Context matters here: this is a phone, mid-workout, with a Screen Wake Lock deliberately held
(`useWakeLock`, line 235) so the display never sleeps. It is the one screen in the app where
sustained wasted work costs real battery, and the one where input responsiveness matters most —
the user is tapping reps and load between sets.

Rules: `rerender-memo`, `rerender-use-ref-transient-values`, `rerender-derived-state`.

**Fix — isolate the tick into leaf components that actually display time.** This is the cleanest
option and removes the problem rather than damping it. `now` should not live in the parent at
all:

```tsx
// components/pulse/elapsed-clock.tsx
"use client";
export function ElapsedClock({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return <>{formatElapsed(elapsedSeconds(startedAt, now))}</>;
}
```

and a sibling `RestCountdown({ endAt, onElapsed })`. `LiveSessionScreen` then drops `now`
entirely and re-renders only when the workout state actually changes — a set completed, a
pointer moved. The two clocks re-render once a second each, and they render a string.

This also fixes R3 below for free: the countdown owns its own "hit zero" transition and calls
`onElapsed` once, rather than the parent re-testing the condition every tick.

**If you prefer a smaller diff**, the damping fix is: `useMemo` the eight derived values on
`[state]`, `useCallback` the handlers, and wrap `LiveSessionSets` in `React.memo`. That stops
the cascade into the set rows but still re-renders the shell every second. The leaf-component
fix is strictly better and roughly the same amount of code.

### R2 — No `React.memo` anywhere in the codebase · **Medium**

A repo-wide grep for `React.memo` / `memo(` (excluding `useMemo`) across `components/` and
`lib/` returns **nothing**. 64 Client Components, none memoized.

For most of them this is fine and arguably correct — they are shallow, render once, and memo
would be noise (`rerender-simple-expression-in-memo` warns against exactly that). It becomes a
finding only where a frequently-re-rendering parent feeds a heavy child, which today means R1.

The reason to raise it separately: the codebase also has no `useCallback` discipline in its
large client components, so **memoization would not work if someone added it**. A `React.memo`
on `LiveSessionSets` today would be defeated on every render by the fresh `units` array and the
inline `onSkipSet` arrow. Rule `rerender-memo` depends on prop stability; the two fixes have to
land together.

Candidates worth the treatment once R1's pattern is established — all large client components
with list children:

- `components/builder/prescription-rows.tsx` (1197 lines)
- `components/HandAuthoredSessionForm.tsx` (1101 lines)
- `components/ProtocolBuilder.tsx` (748 lines)
- `components/CorrectLogForm.tsx` (641 lines)

None of these has a timer driving it, so they re-render only on user input — much lower
priority than R1. Worth a profile before changing anything.

### R3 — Rest-timer effect re-runs every second to test a derived condition · **Low-Medium**

`components/LiveSessionScreen.tsx:329-333`

```ts
useEffect(() => {
  if (restEndAt !== null && restRemainingSeconds(restEndAt, now) === 0) {
    setRestEndAt(null);
  }
}, [restEndAt, now]);
```

Because `now` is a dependency and changes every second, this effect's cleanup-and-re-run cycle
fires 60 times a minute to evaluate a condition that is true at most once per rest period. It is
also a state update *in* an effect responding to a value derivable during render —
`rerender-derived-state-no-effect`.

Subsumed by the R1 leaf-component fix: a `RestCountdown` component knows when it reaches zero
and fires `onElapsed` once. If R1 is deferred, this can stand alone — derive
`isRestOver` during render and clear on the transition.

### Clean in this category

- **`rerender-no-inline-components` — satisfied.** Helper components (`AddToProtocol`,
  `TopSetTrend`, `TrajectoryTile`, `HistoryTab`, `CoverageList`) are all declared at module
  scope, never inside another component's body.
- **`rerender-lazy-state-init` — satisfied.** Every non-lazy `useState` initializer found takes
  a cheap primitive (`String(set.reps)`, `exercise.provenance`, `today`). The one place a
  collection is built, `useState<ReadonlySet<number>>(() => new Set())`
  (`LiveSessionScreen.tsx:152`), correctly uses the lazy form.
- **`rerender-functional-setstate` — satisfied.** `adjustRest` (line 428) and `CoverageList`'s
  `toggle` (`muscle-region-atlas.tsx:159`) both use the functional form.

---

## 6. Rendering Performance (MEDIUM) — clean

- **`rendering-conditional-render` — fully satisfied.** A grep for JSX `&&` conditionals returns
  nothing. The codebase uses `cond ? <X /> : null` without exception, which avoids the
  `0`-renders-as-text class of bug this rule targets.
- **`rendering-hydration-no-flicker` — satisfied, and reasoned about.** `lib/use-wide-viewport.ts`
  starts `false` and resolves on mount, with a comment (lines 12-14) explaining that guessing
  during render would be a hydration mismatch and that one late frame is the right trade for a
  secondary block. `lib/use-chart-theme.ts` follows the same shape. The server-rendered theme
  comes from `resolveTheme` in the layout, not from a client guess.
- **`rendering-script-defer-async` / `bundle-defer-third-party` — satisfied.**
  `components/ServiceWorkerRegistrar.tsx:25` registers only after `load`, with an explicit
  comment that it must never compete with first-paint work, and correctly removes its listener.
- **Motion** — `motion-reduce:*` discipline is enforced mechanically by
  `lib/motion-policy.ts` (ADR-0082), which is stronger than this ruleset asks for.

Not evaluated: `rendering-content-visibility` for long lists. `HistoryBrowser` (305 lines) and
`ExerciseLibrary` render paginated/filtered lists rather than unbounded ones, so this is
unlikely to pay off. Worth a look only if a list is measured rendering hundreds of rows.

---

## 7. JavaScript Performance (LOW-MEDIUM) — clean

This category is genuinely well-served, largely as a side effect of the repo's immutability
rule.

- **`js-tosorted-immutable` — satisfied.** Every `.sort()` call site was checked. All nine
  operate on a fresh or explicitly copied array: `[...rows]`
  (`lib/admin-exercises-view.ts:131`), `[...byColumn.entries()]` and `[...cells]`
  (`lib/heatmap-view.ts:75,80`), `.slice().sort()` (`lib/home-view.ts:119`,
  `lib/protocol-builder.ts:1059`), `Array.from(names)` (`lib/history-filter.ts:38`),
  `[...byWeek.keys()]` (`lib/protocol-builder.ts:1055`), and post-`.filter()` /post-`.map()`
  chains (`lib/session-move.ts:24`, `lib/heatmap-view.ts:85`). No in-place sort of a shared
  array anywhere.
- **`js-index-maps` / `js-set-map-lookups` — satisfied.** `groupUnits`
  (`lib/live-session.ts:666`), `heatmap-view`, and `protocol-builder` all build a `Map` for
  grouping rather than repeated `.find()`. `BODYWEIGHT_LABELS` is a `Set`
  (`components/exercise/equipment-symbol.tsx:47`).
- **`js-flatmap-filter` — applied.** `app/train/page.tsx:48` and
  `lib/exercise-detail-view.ts` use `flatMap` to map-and-drop in one pass.

The few remaining linear `.find()`s run over fixed tiny collections — six muscle groups
(`components/analytics/muscle-region-atlas.tsx:153`), ~15 equipment icons
(`components/exercise/equipment-symbol.tsx:64`), the gender options list. Converting these to
`Map` lookups would add indirection for no measurable gain; leave them.

---

## 8. Advanced Patterns (LOW) — no findings

`advanced-init-once` is satisfied by the app-scope registrars. `advanced-use-latest` /
`advanced-event-handler-refs` would be relevant if handlers were being re-registered on
listeners each render; they are not — the listener effects have stable or empty dependency
arrays.

---

## Recommended order of work

1. **R1** — the Live Session tick. Highest user-visible impact, on the most sensitive screen,
   and the fix (two small clock components) is self-contained. Fixes R3 as a byproduct.
2. **A1** — `/exercises/[id]` parallelization. One-line-shaped change, 4–5 RTTs → 1, on a
   frequently-reached browse surface. Remember the `.catch()` on the best-effort reads.
3. ~~**B1**~~ — **done** (ADR-0090): the three remaining Recharts call sites are behind
   `next/dynamic`, reusing the pattern `volume-chart-wide.tsx` proved, measured before and
   after.
4. **A3, A2** — the remaining two waterfalls; same shape as A1.
5. **A4 + `loading.tsx` coverage** — stream `/train`, then backfill `loading.tsx` on the
   data-heavy routes that lack one.
6. **C1**, ~~**B2**~~ — the storage version field; the unused dependency is **removed**.
7. **R2** — revisit memoization on the large builder/form components only after profiling.

## Guardrail suggestions

This repo's habit is to make invariants executable (`terminology_guard.py`, `motion-policy.ts`,
`reflow-policy.ts`, `chart-values-policy.ts`, `accent-tint-policy.ts`). Two findings here fit
that mould and would stay fixed:

- ~~**A Recharts import guard.**~~ **Landed with B1** as
  [`recharts-import-policy.ts`](../../../../apps/web/lib/recharts-import-policy.ts) (ADR-0090):
  a sweep asserting that `recharts` is imported only from a module reached through
  `next/dynamic`, with a written-reason exemption registry that is empty — the same shape as
  `chart-values-policy.ts`. B1 was a regression of a lesson ADR-0088 already paid for once;
  the guard is what stops it being paid a third time.
- **A bundle-budget assertion in `audit/`.** The `#576` review measured the Dashboard client
  manifest by hand. Asserting a per-route gzipped client-chunk budget in CI would have caught
  B1 at the commit that introduced it.
