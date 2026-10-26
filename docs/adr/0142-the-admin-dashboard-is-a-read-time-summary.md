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
Catalog Completeness breakdown (Total, % Enriched, Stubs) and the admin catalog rows (Retired).
% Enriched is the completeness readout's own share (`summarizeCompletenessBreakdown`), never a
second calculation that could disagree with it. The AI tiles (#769) follow the same rule over
the Generation Call log's 3-day window (ADR-0135). A number that would need a stored ledger to
compute does not belong on this page.

## Tiles are links, and the wide layout adds no actions

Each tile is one link whose accessible name is its label and value. It goes to the list behind
its number, filtered where the number is a filter: Stubs to `completeness=stub`, Retired to
`status=retired`, Total and % Enriched to the whole catalog. The hrefs are built with the list
page's own serializer (`adminFiltersToQuery`, ADR-0100), and a test checks they round-trip
through its parser. A tile cannot link to a URL the catalog would read differently.

The wide layout adds read-time projections and forward navigation only (ADR-0071). The
publishers are relocated, not changed, and the dashboard has no new control. Triggering the
enrichment backfill from a tile, for example, stays out: that action lives in the exercise area
beside the readout it acts on.

## Each tile group fails on its own

The dashboard is a list of tile groups (catalog now, AI with #769). Each group has its own
`ready`, `empty` or `failed` state, computed only from that group's own reads, in the pure
view-model `lib/admin-dashboard-view.ts`. The page reads every input in parallel after the
admin gate. Each read has its own `.catch`, because `apiGet` rejects on a transport failure
instead of returning an envelope. A rejection, a refused envelope and a successful envelope
with no payload all fail the group. A failed group shows an inline `Alert` with the backend's
reason, and the other group, the publishers and the nav rows render as usual. A metric that
cannot load must never block publishing.

Within a group, either read failing fails the whole group. A Retired count shown beside a
missing breakdown would be a half-truth.

An **empty** group is not a failed one. When the catalog has no Exercises the tiles still
render, each reading "—", with copy that says there is nothing to summarize. A 0% Enriched
would read as a measured failure.

## The phone page does not change

The tile row is `hidden lg:flex`. It is server-rendered markup with no client JS, so hiding it
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
- The Retired count costs the admin catalog read (one bounded page of rows). If the catalog
  outgrows that page, the count belongs in a backend summary, still computed at read time.
