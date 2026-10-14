# 0133 — The Session detail's Favorite lives in its action sheet

ADR-0113 put the Session detail's rare actions behind a `⋯` trigger "on a line the page already
has — beside Favorite". So the detail spent a whole line under its header on two controls: a
`☆ Favorite` ghost button and the `⋯` beside it. The line was owned by neither the header nor the
plan, and it pushed the PROTOCOL list down by its own height.

## Decision

**Favorite is the first row of the detail's action sheet**, and **the `⋯` sits in the header's
top-right corner, on the overline's line.**

- **One row, shared.** `FavoriteSheetItem` is the Favorite row of both sheets that offer it: a My
  Sessions row and the detail. It reads "Favorite session" or "Unfavorite session" and says what
  the marker does, "Show it under Favorites in My Sessions". It is a one-tap action that leaves
  the page as it was, so it closes its own sheet (ADR-0113).
- **The toggle's state lives outside the sheet.** The sheet unmounts its rows on close, so a
  failure held by the row would vanish with it. `SessionActionsSheet` holds the favorite action's
  state and shows an error under the trigger.
- **The header shows the state.** With the star button gone, a favorited Session says so in the
  same language a favorited My Sessions row uses: its sigil wears the **Glow Edge**, and a
  `FAVORITE` chip leads the meta line under the title. An un-favorited Session shows neither.
- **The `⋯` rides the overline's line.** `PageHeader` gained a `menu` slot for an icon-only
  control pinned top right. With a menu, the title column spans the header, and negative margins
  keep the 40px tap target from making the overline's line taller. The Training Type and duration
  badges and the byline move to a meta line under the title.

The choice came from a prototype of three variants on the real page, kept on the branch
`prototype/session-header-actions`, not in main.

## Considered options

- **No marker outside the sheet.** This was the plainest variant: the favorited state shows only
  in the sheet's row label. It hides a stored preference the reader set on purpose, and My
  Sessions already shows the same state on its row's face.
- **A star pip on the `⋯` trigger.** The cheapest marker, but it puts the state on a control. At
  12px it is easy to miss, and it reads as a notification badge.
- **The `⋯` in a column beside the title.** The first cut of each variant pinned it with the
  header's own `action` slot or a side column. `PageHeader` wraps its action under a title that
  fills the line, so the `⋯` fell to the left. A column kept it in the corner but held 44px of
  every title line: at 390px "Upper push — heavy day" broke onto two lines. On the overline's
  line it fits on one.

## Consequences

- **ADR-0113's "beside Favorite" no longer holds on the detail.** The trigger now sits on the
  overline's line. Everything else in that ADR is unchanged.
- **The header is its own component.** `SessionDetailHeader` renders it, so the audit harness
  can mount the real header rather than a copy. The page is a Server Component, and no journey
  rendered it before. The `session-header` journey joins `audit/reflow.mjs` and `audit/wide.mjs`,
  favorited and with a byline, under a 120-character authored name. The `sheet` journey gains
  the Favorite row. The first run of the new journey found the title overflowing: a 120-character
  unbroken name pushed the page to 2598px at 390px, because nothing let it break. That was true
  before this change too, but unseen. The name now wraps (`break-words`, ADR-0085).
- **`FavoriteSessionControl` is gone.** Favorite has no standalone control on the detail any
  more.
- **A Protocol member is unchanged in what it offers.** The server withholds the marker, so the
  sheet has no Favorite row there, and the header has no glow or chip.

## What this does not claim

- **At 320px a short title can still wrap.** The 48px sigil holds its width. Shrinking it at
  narrow widths was offered and not taken.
- **No motion on the toggle.** The glow and chip appear on revalidation, without a transition.
