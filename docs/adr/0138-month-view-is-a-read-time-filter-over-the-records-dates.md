---
status: accepted
---

# 0138 — Month view is a read-time filter over the record's dates, not a calendar

History lists every Logged Session newest first, filterable by exercise and Training Type
(ADR-0031, ADR-0128). A user who remembers *roughly when* they trained ("sometime in March")
could only scroll and read dates. History gains a **List / Month view** switch; List stays the
default and unchanged.

**Month view is a descriptive, read-time filter over the record's `performed_on` dates, and
nothing more.** ADR-0001 made the plan calendar-free: no "today", no dated schedule. Like the
Training Heatmap (ADR-0054), Month view shows dates the *record* already holds, so it does not
reintroduce a calendar for the plan. It keeps every ADR-0054 guardrail:

- **No today.** Nothing marks or opens on the current date. Month view opens on the month of
  the newest Logged Session that matches the active filters, so it never lands on an empty
  month after a break, and it reads no clock at all.
- **No missed days.** A month or day with nothing logged reads as "No matching sessions in
  March 2026", never as missed. UI copy never says "Calendar" or "missed".
- **No chain or streak.** It derives no run of days; the weekly Streak stays the only
  consecutiveness metric.
- **No intensity shading.** Grading days by how much was done is the Heatmap's job.

It applies only to History. My Sessions holds plans, which carry no performed date, and dating a
plan is what ADR-0001 forbids.

## How it is built

- **No backend change.** The History index already has one row per Logged Session with its
  `performed_on` calendar date. Month view is projected over that index on the client, like
  the existing facets (ADR-0128), and its matches feed the same windowed card loader.
- **The month combines with the facets (AND).** Exercise and Training Type narrow the record
  first, then the month narrows the result.
- **The view and month are part of the address** (ADR-0100): `view=month` and `month=YYYY-MM`,
  round-tripped by `parseHistoryFilters` / `historyFiltersToQuery` and written with
  `replaceFilterQuery`. A malformed month is dropped. A month without `view=month` is ignored.
  List writes no `view`, and switching to List drops the month but keeps the facets.
- **Calendar dates stay calendar dates** (ADR-0096). Months are `YYYY-MM` strings, sliced off
  `performed_on` and named by `formatMonthYear` in `lib/date-format.ts`, never built from a
  `Date`.
- One pure seam, `projectHistoryMonth` in `lib/history-month.ts`, returns everything Month view
  renders (the month, its matches newest first, the heading and the count or empty copy). The
  day grid and month navigation grow from it.

## Considered options

- **A server-side month query.** Rejected: the client already holds the whole index, so a month
  is a filter over data on screen, and the page's first window is resolved against the same
  index (ADR-0128).
- **Opening on the current month.** Rejected: that is a "today", and after a break it opens on
  an empty month.
- **Naming it "Calendar".** Rejected: GLOSSARY already lists "calendar" under _Avoid_, because the
  domain has no calendar binding.
