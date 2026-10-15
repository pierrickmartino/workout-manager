# 0134 — One Session card for Train and My Sessions

Train's "Pick up again" panel and My Sessions both rendered `SessionCard`, but each fed it
different fields, so it showed as two cards. Train had the last trained date and an exercise
preview, with no way to open the Session or favorite it. My Sessions linked the title to the
detail and had the ⋯ menu, but showed neither the date nor the preview. The list payload did not
carry them, and the Train panel got them by reading History plus one Session detail per row.

## Decision

**One card, one row shape, on both surfaces.**

- **The list row carries the card's facts.** `GET /api/sessions` adds `last_performed_on` (the
  newest `performed_on` against the plan, or `null`) and `preview_exercises` (the plan's first
  three Exercise names, in prescription order). The date is a read-time projection over the
  record, read for the whole library in one grouped query, like the Logged Count (ADR-0018,
  ADR-0063). The preview is read from the *plan*, in one joined query over the returned page.
- **One mapper.** `sessionCardModel(summary)` replaces `recentSessionCardModel` and
  `sessionSummaryCardModel`. The Training Type badge is coloured per type on both surfaces;
  Train's fixed cyan badge is gone.
- **The layout.** The title shares its line with Start only. Under it are the type badge and, on
  an adopted plan, the byline. Then "Last trained <date>" (or "Not trained yet") on a line of
  its own, then the exercise preview. Last comes a bottom row: "N exercises" on the left; "Trained
  N×" and the ⋯ on the right. There is no divider above the bottom row.
- **The whole card opens the Session.** The title link's `::after` covers the card. Start and the
  ⋯ sit above it, so no link nests in another and each control keeps its own name.
- **One row component.** `SessionLibraryRow` is now `SessionCardRow` and renders on both
  surfaces: the ⋯ sheet with Favorite and, on a never-performed plan, Delete; press-and-hold to
  favorite; the Glow Edge. A Recent Session has always been performed, so Delete never shows on
  Train. Favorite revalidates `/train` as well as `/sessions`.
- **The Train panel reads only History and the list.** The per-plan detail reads are gone, along
  with `toRecentSessionRows`, the rule that dropped a row whose detail read failed.

The layout came from a prototype of three variants on both pages, kept on the branch
`prototype/session-card-unify`, not in main. Variant A won, with the ⋯ moved from beside Start
to the bottom row and the divider above that row removed.

## Considered options

- **A dense row** (no card chrome, one meta line, an icon-only Start). The most compact, but
  "Last trained" was the first thing cut off when the line ran out.
- **A stat tile** (a three-column strip of last trained, exercises and trained ×N, and a
  full-width Start). It gave the title the most room but was the tallest card.
- **The ⋯ beside Start.** Two controls beside the title squeezed long names into a narrow
  column. On the bottom row the ⋯ costs no title width.
- **Keep the per-plan detail reads and add them to My Sessions.** That is one request per
  Session on a library page of up to 100 rows.

## Consequences

- **ADR-0120's note that Train's panel doesn't claim the sigil morph no longer holds.** Every
  card now links to the detail, and the Train page shows each Session once, so both surfaces
  claim it.
- **The title wraps instead of truncating** (ADR-0085). Start is the only control beside it.
- **GLOSSARY: My Sessions and Recent Sessions** now describe the shared card, the last trained
  date and the preview on a My Sessions row.
