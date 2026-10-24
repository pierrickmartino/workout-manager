---
status: accepted
---

# 0140 — History is Month view alone; the List / Month switch is retired

ADR-0138 gave History a **List / Month view** switch, with List as the default. ADR-0139 then
put the facet rail beside the results in both views, and Month view already shows that month's
History cards beside its grid. So the List and Month view showed the same cards behind the same
filters. The only difference was that the List covered every month at once. The owner found
the switch had no value: "I only need the Monthly View without switch."

**History has one layout: Month view.** The day grid and the month's cards sit beside the facet
rail. There is no switch and no newest-first List. Everything else in ADR-0138 still holds:
the guardrails (no today, no missed days, no chain, no intensity shading), the projection in
`projectHistoryMonth`, and opening on the newest *matching* month. A facet change still pins
the month on screen, even when it empties that month. The empty state ("No matching sessions in
March 2026") explains why it is empty.

## Consequences

- **No all-time scroll.** A filter shows its matches one month at a time; older matches are
  reached with the month arrows. The facet rail's counts still cover the whole record
  (ADR-0139), so the reader can see how many matches exist beyond the month on screen.
- **The address loses `view`.** `parseHistoryFilters` reads `month` and `day` with no
  `view=month` gate, and `historyFiltersToQuery` never writes `view`. An old `?view=list` or
  `?view=month` link is ignored, not rejected, and opens Month view.
- **The page always resolves the first window against the index** (ADR-0128). The List's
  unfiltered shortcut read the newest records alongside the index. That shortcut is gone, as
  is the `fetchRecentHistory` client read. The backend's `GET /api/logs?limit=` is unchanged.
- `HistoryViewToggle` and the `HistoryView` type are deleted. The `history` audit journey now
  renders Month view on its newest month.

## Considered options

- **Keep the switch and default it to Month view.** Rejected: the switch would offer a second
  layout with the same cards and filters, which is what the owner asked to remove.
- **Keep List alone.** Rejected: the owner uses the month grid, and List adds nothing beside it.
