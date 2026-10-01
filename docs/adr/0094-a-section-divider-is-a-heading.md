# 0094 — A section divider is a heading

[`SectionHeader`](../../apps/web/components/pulse/section-header.tsx) is the app's
section divider — the `▸ WEEK CYCLE ————— 04/05` rule used in **29 files**, and the
only thing that says where one block of a page ends and the next begins. It emitted
a `<div>` wrapping a `<span>`.

The effect was an app with no outline. App-wide there were 3 `<h1>` and 10 `<h2>`,
so Dashboard, Analytics, Profile, Sessions, Exercises and History each exposed
exactly one heading — the `PageHeader` `<h1>` — and nothing under it. Heading
navigation is the primary way a screen-reader user skims a page; on those pages it
landed nowhere, on a surface whose whole visual design is built around section
dividers.

So the label is a real heading: an `<h2>` by default, carrying the classes the
`<span>` carried.

## It is additive, not a restyle

Tailwind's preflight resets a heading's font size, weight and margins, and the
label already states its own (`label-mono text-[11px] font-semibold`). The row is a
flex container, so a block-level child is blockified exactly as the inline one was.
The marker stays `aria-hidden` and the meta counter stays a sibling, so the
accessible name is the section's name and nothing else — not "▸ SCHEDULE 04 / 05".

Nothing about the rendered page changes, and that was checked rather than reasoned
about: `audit/reflow.mjs` (0 of 660 cases overflow at 320px, at 100% **and** 200%
text) and `audit/wide.mjs` (0 of 660 at 1440px) both still pass, and
`section-heading.test.ts` asserts the row's classes, the rule element and the
accessible name directly.

## A level, for the nesting that does not exist yet

`level` takes 2 or 3. Every current call site is a top-level section, so every one
of them is an `<h2>`; the prop exists so that a divider nested inside a section
another divider opened can take the next rank instead of claiming a sibling's. With
only two ranks there is no way to spell a skip.

## The eyebrow is a divider too

Train does not use the ▸ rule. It labels each group with a `TRAIN // …` eyebrow — a
`label-mono` span, visually nothing like a `SectionHeader`, but structurally the same
thing: the text that says where a group starts. Three of them
(`RecentSessions`, and My Library / Explore on `app/train/page.tsx`) are `<h2>` now.

That mattered more once the card titles under them became headings. Promoting
`SessionCard` while leaving the eyebrow a `<span>` would have put the *items* in the
outline and not the group holding them — a reader skimming Train would hear three
session names and never hear that they are the sessions to pick up again. So
`SessionCard` takes a `level`, and the cards in that panel are `<h3>` under their
panel's `<h2>`.

The `TRAIN // START SOMETHING NEW` eyebrow on `PageHeader` is deliberately not one:
it sits above the page's `<h1>` and labels the page, not a section.

## The level skip it exposed

Making the divider an `<h2>` left one real `<h3>` stranded.
[`SessionCard`](../../apps/web/components/SessionCard.tsx) titles its list item with
an `<h3>`, and My Sessions heads its list with nothing but the page's `<h1>`, so the
card went straight from `<h1>` to `<h3>`. It is an `<h2>` by default now, which is
also what `HistoryBrowser.tsx:259` already used for the same list-item role, and an
`<h3>` where its group carries a heading of its own (above).

`CardTitle` in [`ui/card.tsx`](../../apps/web/components/ui/card.tsx) is the other
`<h3>` the audit flagged. It has **no call site** anywhere in the app, so it skips
nothing on any rendered page and is left as it is.

Measured across all 11 journeys the audit harness mounts: **0 level skips**, down
from 1.

## The guard

There is no sweep for "every page has an outline" — a page's outline is a property
of what it renders, and the harness that could judge it needs a browser.

What is mechanized is narrower and is the thing that would actually rot: a test
asserts that **no component outside `section-header.tsx` renders the `▸` marker**, so
a second, hand-rolled divider cannot reappear next to the real one. The outline holds
only while every divider comes from the one component.

"Renders", not "contains": the sweep reads the marker out of JSX text and string
literals through the TypeScript AST, so a comment explaining the rule is not a
violation of it. The byte-level first draft failed on the sentence in
`RecentSessions.tsx` that explains why its eyebrow is a divider. It also asserts
positively that the marker *is* found in `section-header.tsx`, so a detector that
stopped detecting cannot pass as a clean sweep.

The eyebrow form has no such guard, because `label-mono text-[11px]` is also how the
app styles stat labels and chart ticks — there is no signature to key on. That is a
known gap, not an oversight.

## Consequences

- Heading navigation now reaches every section on every page, which is the whole
  point.
- A divider is no longer free to use as decoration. A `▸ …` rule that does not open
  a section would now be a lie in the outline, so it should not be a
  `SectionHeader`.
- `SessionCard`'s title rank is tied to it having no divider above it. If a list
  that renders it ever gains one, the card takes a level prop rather than the
  section losing its heading.
