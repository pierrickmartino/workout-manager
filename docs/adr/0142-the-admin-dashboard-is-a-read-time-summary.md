---
status: accepted
---

# 0142 — The admin dashboard is a read-time summary

On a laptop the admin home was a 26rem column of two publishers and two nav rows. It said
nothing about the system until you opened each area: whether the catalog needed an enrichment
backfill meant opening the exercise area and reading the completeness readout. Spec #767 makes
the admin home a dashboard at `lg:`. It opts into the wide shell (ADR-0088), and a row of
summary tiles sits over two columns: **Publishing** (the Active Skin and Avatar Universe
publishers) and **Operations** (the nav rows into the exercise catalog and the AI audit log).
This ADR records the rules every dashboard number follows, so the next tile is built the same way.

## Every number is computed when the page is read

A tile is a read-time projection over data that already exists, the same rule as XP, Streak
and Personal Records (ADR-0018/0019). There is no metrics table, no counter column, no cache
and no write hook. The catalog tiles come from two reads the admin area already serves: the
Catalog Completeness breakdown (Total, % Enriched, Stubs) and the admin catalog endpoint
filtered to `retired=true` at `limit=1`, whose `meta.total` is the exact Retired count. The home
never reads the catalog rows themselves.
% Enriched is the completeness readout's own share (`summarizeCompletenessBreakdown`), never a
second calculation that could disagree with it. The AI tiles (#769) follow the same rule over
the Generation Call log's 3-day window (ADR-0135). A number that would need a stored ledger to
compute does not belong on this page.

## The AI summary endpoint

The AI tiles (Calls, Error rate, Tokens, Median latency) and the calls-by-Generator-Kind
list in Operations read one admin-only endpoint, `GET /api/admin/generation-calls/summary`. It
sits behind `require_admin` and fails closed (ADR-0046), and it returns the standard envelope
with no `meta`. The route reads `GenerationCallRepository.summarize_recent`, which aggregates
the rows inside the same retention cutoff the list applies. There is no table, migration or
counter. The payload is `total_calls`, `by_outcome`, `by_generator_kind`, `input_tokens`,
`output_tokens`, `unreported_usage_calls`, `median_latency_ms` and `window_days`. It holds counts
and sums only, with no prompt, output, error text or per-user figure, so it never widens access
to the log's health data. The route is declared before `/{call_id}`, and a test checks that
`summary` is never read as a call id.

- **Every key is present.** `by_outcome` carries every Generation Outcome and
  `by_generator_kind` every Generator Kind, in the enum's order, each zero when there were no
  calls. A missing key would read as "unknown", not as "none".
- **Null usage is excluded, then counted.** A call whose provider reported no usage adds nothing
  to `input_tokens` or `output_tokens` (a guessed 0 would be the same), and
  `unreported_usage_calls` counts it. The sums are therefore a floor, and the Tokens tile says
  so with an "N unreported" footnote whenever N > 0. The tile's value is the in + out total
  (compact, so it fits a tile), and the footnote splits it into in and out.
- **The median latency covers every call.** Successes and errors both count, because a failed
  call kept a user waiting too. It is `null` when the window holds no call, and the median is
  taken in Python over the window's latencies, which keeps it the same on SQLite and Postgres.
- **The window is not hard-coded twice.** `window_days` comes from the retention constant, and
  the UI's "Last 3 days" and empty copy are built from it.

Error rate is derived in the view-model from `by_outcome.error / total_calls`, shown to one
decimal at most so one failure in a thousand reads as 0.1%, not 0%. When the window holds no
call, every AI tile reads "—" with copy saying there is nothing to summarize, because a 0%
error rate over no calls is not a measurement. The Generator Kind list is different: a count of
0 is honest, so an empty window lists every kind at 0.

## Tiles are links, and the wide layout adds no actions

Each tile is one link whose accessible name is its label and value. It goes to the list behind
its number, filtered where the number is a filter: Stubs to `completeness=stub`, Retired to
`status=retired`, Total and % Enriched to the whole catalog. The hrefs are built with the list
page's own serializer (`adminFiltersToQuery`, ADR-0100), and a test checks they round-trip
through its parser. A tile cannot link to a URL the catalog would read differently. The AI
tiles follow the same rule with the audit log's serializer (`auditLogHref`): Error rate goes to
`outcome=error`, each Generator Kind in the Operations list to `kind=<kind>`, and Calls, Tokens
and Median latency to the whole log.

The wide layout adds read-time projections and forward navigation only (ADR-0071). The
publishers are relocated, not changed, and the dashboard has no new control. Triggering the
enrichment backfill from a tile, for example, stays out: that action lives in the exercise area
beside the readout it acts on.

## Each tile group fails on its own

The dashboard is a list of tile groups: catalog and AI. Each group has its own
`ready`, `empty` or `failed` state, computed only from that group's own reads, in the pure
view-model `lib/admin-dashboard-view.ts`. The page reads every input in parallel after the
admin gate. Each read has its own `.catch`, because `apiGet` rejects on a transport failure
instead of returning an envelope; the catch logs the error server-side and turns it into a
failed read whose reason says the API could not be reached. A rejection, a refused envelope and
a successful envelope with no payload (or a Retired page with no `meta.total`) all fail the
group. A failed group shows an inline `Alert` with the backend's reason, or with what was
missing when the backend gave none, and the other group, the publishers and the nav rows render as usual. A metric that
cannot load must never block publishing. A failed AI summary also drops the Generator Kind
list, since it reads the same summary; the AI group's `Alert` already says why.

Within a group, either read failing fails the whole group. A Retired count shown beside a
missing breakdown would be a half-truth.

An **empty** group is not a failed one. When the catalog has no Exercises the tiles still
render, each reading "—", with copy that says there is nothing to summarize. A 0% Enriched
would read as a measured failure.

## The phone page does not change

The tile row and the Generator Kind list are `hidden lg:flex`. They are server-rendered markup with no client JS, so hiding them
costs nothing. Below `lg:` the page shows the same sections in the same order as before. The
columns keep that source order (Publishing, then Operations) left to right instead of
reordering with CSS, so focus order and reading order match what is drawn. The grid lives in
`components/pulse/admin-dashboard-columns.tsx`, which the page, its `loading.tsx` and the
`admin-home` audit journey all mount, so `audit/wide.mjs` and `audit/reflow.mjs` measure the
real layout. `wide.mjs` also fails if a converted page (`home`, `admin-home`) loses its
`data-shell="wide"` opt-in, which would otherwise pass every other check by shrinking back to
26rem.

## Consequences

- Adding a tile group means one more builder in `adminDashboardView` and one more input read
  in `lib/admin-dashboard.ts`. Existing groups do not change.
- The Retired count is exact at any catalog size: it is the retired-filtered page's
  `meta.total`, one count query plus a one-row page (and that row's reference count). It is no
  longer bounded by the 500-row page the catalog list reads.
