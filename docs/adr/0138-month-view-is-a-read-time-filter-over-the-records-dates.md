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
- **Month view opts History into the wide column; the List does not** (ADR-0088). On a phone
  the seven-column grid sits above the cards. From `lg:` it is a sticky column at the narrow
  shell's width beside them (`HistoryColumns`, flex, no bracket tracks), so a reader changes
  day or month without scrolling back up. It adds no action, only the same grid in a place
  that stays on screen. The List keeps its 26rem column at every width, so switching views at
  a desk widens the page — the honest cost of not converting a layout nobody redesigned.
  `history-month` is a journey in both `audit/reflow.mjs` and `audit/wide.mjs`. *(Superseded
  in part by ADR-0139: the List now opts in too, its facet rail beside the results.)*

## Considered options

- **A server-side month query.** Rejected: the client already holds the whole index, so a month
  is a filter over data on screen, and the page's first window is resolved against the same
  index (ADR-0128).
- **Opening on the current month.** Rejected: that is a "today", and after a break it opens on
  an empty month.
- **Naming it "Calendar".** Rejected: GLOSSARY already lists "calendar" under _Avoid_, because the
  domain has no calendar binding.

## Amendment — day cells mark each Logged Session by Training Type

The first grid gave a day with matching Logged Sessions one neutral dot, so a month told the
reader *that* they trained but not *what*. Four designs were prototyped on the real route
(the current grid; Type tiles; a ribbon of every month on record; a week agenda). They were
judged on a synthetic year of records, and **Type tiles** was chosen. The prototype is kept in
this branch's history as commit `c7506b3` and is not on main.

- **A day with matching Logged Sessions is a raised tile carrying one mark per session**, in
  its Training Type's colour. These are the Workout Signature's accents, through
  `trainingTypeFillClass` in `lib/training-type-accent.ts`, so the two can never disagree.
  Marks are grouped most frequent type first. A cell shows at most three (`MAX_DAY_MARKS`) and
  counts the rest as "+n", so it still fits a 320px column (ADR-0085).
- **Colour is never the only carrier.** Each day's accessible name names the types ("14
  October 2026, 3 sessions: 2 strength, 1 yoga"). A legend under the grid names every type in
  the month with its count (`typeTally`), for the whole month even when a day is selected. The
  legend is read-only: the Training Type chips above remain the filter.
- **The guardrails above still hold.** A mark is one equal-sized sign per Logged Session, not a
  shade graded by volume, load or effort, so there is still no intensity shading. A day with
  nothing logged stays a plain number, never styled as missed. Nothing marks a "today".
- Both new fields come from `projectHistoryMonth`, in the same projection as the rest of the
  view.

Rejected alternatives: the **month ribbon** gave a good year overview, but it replaced the
arrows and made day selection a second step. The **week agenda** duplicated the cards beside
it on wide screens and grew long on a phone.
