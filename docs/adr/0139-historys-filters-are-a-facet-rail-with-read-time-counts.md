---
status: accepted
---

# 0139 — History's filters are a facet rail with read-time counts

History filters the record by exercise and Training Type (ADR-0031, ADR-0128). The filters were
a card above the results: a free-text exercise field with a datalist, and a row of type chips.
That card said nothing about the record. A reader could not see which types they actually log,
or how often they trained a movement, before picking it. Picking a type was a guess that could
come back empty.

Five designs were prototyped on the real route: the current card, a sticky toolbar, a single
omnibox with tokens, a filter written as a sentence, and a facet rail with counts. They were
judged on a synthetic year of records, and **the facet rail** was chosen. The prototype is kept
in this branch's history as commit `4e83ebd` and is not on main.

**Every option shows how many Logged Sessions picking it would show.** The rail lists every
Training Type in the curated set and every exercise the user has logged, each with its count.
So the filter also shows what the record holds.

## How it is built

- **Counts are a read-time projection over the History index**, like everything else on the
  screen (ADR-0128, and the stance of ADR-0018/0019). Nothing is stored. One pure seam,
  `projectHistoryFacets` in `lib/history-facets.ts`, returns everything the rail renders.
- **Each facet's counts honour the other facet and ignore their own.** A type's count is the
  sessions of that type with the chosen exercise. Types OR together (ADR-0031 Q7), so an
  unselected type's count is what adding it brings in. An exercise's count is the sessions that
  performed it, of the chosen types, which is exactly what picking it shows.
- **Exercises are listed most-logged first** (ties alphabetical). The rail shows six before
  "Show all", and a finder field narrows the list. The finder's text and "Show all" are local
  state. They narrow the rail, not the record, so they are not part of the address (ADR-0100).
- **The picked exercise always stays on screen**, even past the preview, outside the finder's
  query, or from a shared link naming a movement this record never performed. That way it can
  always be seen and cleared.
- **The exercise is now picked, not typed.** The field could hold any exact name before; the
  rail offers only movements in the record (ADR-0031 Q5 already limited the options to those).
  The URL contract is unchanged: `exercise=` and repeated `type=`, parsed as before.
- **Colour is never the only carrier.** Each type row has the Workout Signature's accent dot
  and a hairline bar sized against the largest type (`trainingTypeFillClass`, as in Month
  view), beside its name and count. Each count reads as "n sessions" to a screen reader.

## Layout

- **History opts into the wide column in both views** (ADR-0088). This supersedes ADR-0138's
  "the List does not". From `lg:` the rail is a 16rem column beside the results; in Month view
  the results are `HistoryColumns` (grid beside cards) as before. Flex, no bracket tracks.
- **Below `lg:` the rail folds behind a "Filters · n" disclosure**, with the List / Month
  switch kept above it. When the rail is closed, the active facets stay on screen as removable
  tokens. There is one rail in the DOM, and CSS alone moves it, so no id or heading is
  rendered twice.
- The rail adds no action. Every row calls the setters the screen already had.
- `history-filtered` (two facets picked) joins `audit/reflow.mjs` and `audit/wide.mjs`; the
  `history` journey is now a wide-column page.

## Considered options

- **Sticky toolbar.** Compact, but at 320px the type chips scrolled sideways out of view, and
  it showed nothing about the record.
- **Omnibox with tokens.** One field for both facets hid the Training Types until the reader
  typed, and a combobox is a large accessibility surface to own for two facets.
- **Filter as a sentence.** Charming, but it scaled poorly to a long exercise list and wrapped
  badly on a phone.
