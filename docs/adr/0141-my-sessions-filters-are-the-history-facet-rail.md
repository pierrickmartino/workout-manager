---
status: accepted
---

# 0141 — My Sessions' filters are History's facet rail

My Sessions filtered the library with a search box and one row of single-select chips: All,
Favorites, or one Training Type (GLOSSARY: My Sessions). Picking a type dropped Favorites, and
the reverse. No chip said how many Sessions it held, and the row offered no way to find a plan by
the movements it prescribes. History already solved the same problem with a facet rail that
counts every option (ADR-0139). This ADR puts the same rail on My Sessions and adds the facet
History has no use for: **Favorite**.

## The facets

The rail has four sections, combined with AND:

1. **Name**: the search, kept as a facet of its own. Matching is unchanged: case-insensitive
   over Session Name, the derived `training_type · date` label and Training Type, in parity with
   `GET /api/sessions`. It is the only way to find a plan by name.
2. **Favorites**: one toggle row with a count. Shown even when the library has no Favorite, at
   0, because it is how the reader finds the filter once they star something.
3. **Training type**: any number, OR'd together, as on History. Unlike History, only the types
   present in the library are listed (in curated order, an uncurated type appended), plus any
   picked type the library does not hold, so a pick from a shared link can always be cleared. A
   type row in a library the user built themselves is never a dead "Yoga · 0".
4. **Exercise**: one exact name, picked from a finder with six rows before "Show all", the pick
   always on screen, as on History. It matches the *plan*: every Exercise the Session
   prescribes, never what was performed. Plan and record stay separate.

**Each facet's counts honour every other facet, the search included, and ignore their own.**
This is ADR-0139's rule with four facets instead of two. The counts are a read-time projection
over the already-fetched library (`projectSessionFacets` in `lib/sessions-facets.ts`), never
stored (ADR-0018).

## How it is built

- **The rail's pieces are shared; each screen keeps its own projection.** The frame (phone
  disclosure, removable tokens, rail beside results), sections, rows, tokens, finder and
  Exercise section live in `components/pulse/facet-rail.tsx`. The row-building rules (type
  shares, exercise preview and pinning) live in `lib/facet-rail.ts`. `history-facets` and
  `sessions-facets` each decide which rows they count and which facets they honour. A shared
  facet model was rejected, because History's rows are records and these are plans, and only
  plans have a Favorite.
- **The list row gains `exercise_names`**: the distinct Exercise names the plan prescribes,
  alphabetical. It comes from the same page-scoped joined query that builds the three-name
  `preview_exercises`, which keeps its prescription-order meaning for the shared Session card.
- **The URL takes History's shape** (ADR-0100): `query`, `favorite=1`, a repeated `type` and
  one `exercise`. A type is not validated against a fixed set, since the facet is drawn from
  the library. A pre-rail `chip=favorites` / `chip=type:<t>` link is still read when neither
  `favorite` nor `type` is present, so old bookmarks open their view. It is never written.
- **The search stays urgent and the re-filter follows it.** The controls read the live facets;
  the list, the counts and the badge read `useDeferredValue` of them (ADR-0097).

## Layout

- **My Sessions opts into the wide column** (ADR-0088), so from `lg:` the rail is a 16rem
  column beside the Session cards. Below `lg:` it folds behind "Filters · n", with the active
  facets as tokens (the search as a quoted one).
- `sessions-filtered` (one facet of each kind picked) joins `audit/reflow.mjs` and
  `audit/wide.mjs`; the `sessions` journey is now a wide-column page.

## Considered options

- **Keep the chips and add an Exercise chip row.** It would have been a third filter idiom
  beside History's rail and the catalog's taxonomy, still without counts.
- **One generic facet model for both screens.** Rejected above.
- **Search outside the rail, above the results.** Rejected in favour of a Name facet, so every
  narrowing control lives in one place and shows up as a token on a phone.
