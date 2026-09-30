# 0090 — A chart is reached only through a dynamic import

[ADR-0088](0088-the-shell-has-two-widths.md) measured what a statically-imported
Recharts costs a route and wrote the remedy down: a dynamic import, because a
static one puts the library in the client chunk graph whether or not the
component ever renders. That clause was written about a *desktop-only block* —
the case that prompted it — and so it read as a rule about `hidden lg:block`.

It is not. It is a rule about static imports, and three routes were already
paying it on a surface with no desktop-only block in sight:

| Route | Client JS (gzipped) | of which charting |
|---|---|---|
| `/analytics` | 221.4 KB | 144.4 KB |
| `/analytics/strength` | 180.0 KB | 103.0 KB |
| `/exercises/[id]` | 180.0 KB | 103.0 KB |
| `/dashboard` (already dynamic) | 81.7 KB | 0 KB |

Measured from `.next/server/app/<route>/page_client-reference-manifest.js`, the
procedure ADR-0088 already prescribes.

So the rule is restated at the level it actually holds: **a module that imports
`recharts` may be reached only through `next/dynamic`.** Not "when it is behind a
media query", not "when the block is desktop-only" — always.

## The gate is data, not width

`volume-chart-wide.tsx` pairs its dynamic import with a **mount gate**
(`useWideViewport`), and that pairing is specific to its case: a block that exists
only above 64rem, where `hidden lg:flex` would still render and hydrate. The three
routes here are different — these charts are genuinely visible on a phone, so a
viewport gate would be wrong.

Their gate is *data presence*, and it was already there. `SpecsPanel`'s
`TopSetTrend` returns `null` for an empty series, so a bodyweight or never-logged
Exercise draws nothing; `StrengthTrajectories` returns `null` for a user with no
qualifying lifts; Weekly Distance renders only when `has_distance`. Every one of
those early returns was already correct and already useless, because a static
import is unconditional: the bytes arrived before the branch was evaluated.

`/exercises/[id]` is the sharpest case. It is a browse surface reached from six
origins on a mobile-first PWA, and the chart appears on one of its three tabs, for
some of its exercises. It shipped 103 KB gzipped of charting library to every
visit of every tab regardless.

After the change all three routes carry **0 KB** of charting in their route
graph, and the chunk is fetched when — and only when — a chart mounts:

| Route | Before | After |
|---|---|---|
| `/analytics` | 221.4 KB | 114.4 KB |
| `/analytics/strength` | 180.0 KB | 77.7 KB |
| `/exercises/[id]` | 180.0 KB | 77.7 KB |

`/dashboard` is unchanged at 81.8 KB, which is the point of measuring it: the
wide-column path was refactored to share the same lazy wrapper and did not regress.

## The boundary is declared once per chart, not once per call site

Each chart gets one `*-lazy.tsx` wrapper holding the single `dynamic()` call, and
every surface — including `volume-chart-wide.tsx`, which now composes
`VolumeChartLazy` and keeps only its mount gate — goes through it. A second call
site declaring its own boundary is how two surfaces end up disagreeing about
`ssr` or about what the placeholder looks like.

The placeholder is a `Skeleton` at the plot's own height, so the plot body holds
its box across the swap (ADR-0028). It does not reserve the `ChartValues`
disclosure below it — one mono summary line and a margin — so that much still
shifts. That forced one small decision: `next/dynamic`'s
`loading` is a component, not a function of props, so it cannot read a
`heightClass`. The Top-Set Trend renders at two declared heights (`h-48` on
Exercise Detail, `h-28` for the Strength Analytics miniature), and a single fixed
skeleton would shift the miniature by 20 rows' worth on arrival, in a grid of
them. The lazy wrapper
therefore holds one entry per declared height, with `heightClass` narrowed from a
free string to that closed set. Both entries name the same specifier, so the
bundler still emits one shared chunk.

## ADR-0084 is preserved, not traded away

ADR-0084's guarantee is that every **plotted** datum is retrievable as text, and
`ChartValues` ships *inside* each chart component, over the same rows the plot is
handed. So wherever the plot mounts the table mounts beside it, and where neither
mounts there is no plotted datum to make retrievable. Deferring *when* the module
loads cannot separate the two, because they are the same module.

The one call site that suppresses the table — the Strength Analytics teaser's
`showValues={false}` — is unaffected by how the module is loaded, and keeps its
registered reason in `chart-values-policy.ts`.

**What does change, and this record will not pretend otherwise:** `ssr: false`
takes the values table out of the *server HTML*, where on these three routes it
previously shipped. The invariant survives, because it is a conditional — no plot
renders in that HTML either, so there is no plotted datum going unretrievable —
but a reader who lands before the chunk arrives now has neither, where before they
had the table without a working plot. ADR-0088 already made that trade on
`/dashboard` and this extends it to three more routes.

It is the right trade here: these routes are behind Clerk and built from Client
Components throughout, so a session with no JavaScript has no screen to read the
table on. It would stop being the right trade the moment a chart appears on a
public, server-rendered surface, and this paragraph is where to come back to.

## The guard

[`recharts-import-policy.ts`](../../apps/web/lib/recharts-import-policy.ts)
sweeps `components/` and `app/` — the same two roots `chart-values-policy` and
`motion-policy` use — and fails on any static `import` declaration naming a module
that itself imports `recharts`. A `dynamic(() => import("./chart"))` is a call
expression, not an import declaration, so the sanctioned pattern passes by
construction rather than by allowlist. It reads the AST, so a module path in a
comment or a string never counts. It reproduced all four violations before the fix
and reports none after.

Two carve-outs, both by rule rather than by registry:

- **A type-only import is erased** before the bundler sees it, so `import type`
  from a chart module costs nothing and is allowed.
- **`audit/` is out of scope**, as it is for the other sweeps. It is the browser
  harness, not a product surface, and `audit/charts.mjs` *must* import the chart
  components statically to mount them for the per-point parity assertion.

The exemption registry is empty. An entry asserts that a route may carry ~102 KB
gzipped of charting library it might never draw with, so the reason is a required
field.

**What it proves, and what it does not.** It proves no product module statically
names a chart. It cannot prove the resulting chunk is under budget — that is a
build property, and reading the per-route client-reference manifest is still the
procedure. A green sweep is not a measurement, and this record does not let it
imply one. ADR-0088's suggestion of a per-route gzipped budget assertion in CI
remains open; this guard catches the specific regression, not the general one.

## What the audit harness covers, and what it does not

`audit/` keeps importing the chart components directly — the guard exempts it by
rule — because `audit/charts.mjs` must mount them to assert per-point parity, and
that assertion is about the chart, not about how it was loaded.

The dynamic path is still exercised there, but incidentally: the `miniature`
surface mounts `StrengthTrajectories`, which now goes through
`TopSetTrendChartLazy`, so `next/dynamic` runs under the Vite harness and the
plot and its rows render as before. The `volume`, `distance` and `top` surfaces
mount the chart components directly and do not exercise it.

So the skeleton→chart swap itself — the thing this change introduces — has no
journey of its own. ADR-0088's lesson applies ("a page no journey renders is
unverified however many guards are green"), and this is the honest statement of
where that coverage stops.

## Consequences

- Three new wrapper modules, and one more hop between a page and the chart it
  renders. The alternative — a comment asking people to remember — is what
  produced the four violations this record is about.
- A chart now arrives a frame or two after the rest of the page, behind a
  skeleton, where before it was hydrated with everything else. On the routes in
  question that trades a visible placeholder for ~102 KB the reader may never
  have needed, on a mobile-first PWA. It is the right trade and it is not free.
- `TopSetTrendChart`'s own `heightClass` prop stays a free string; only the lazy
  wrapper narrows it. The inner component is what `audit/` mounts, and widening
  the audit harness's contract to serve a bundling concern would be the wrong
  direction.
