# 0084 — Every plotted datum is retrievable as text

A Recharts plot hands its values to the eye and to the pointer, and to nobody
else. The rendered SVG carries no per-point text, and the tooltip that carries
the numbers opens on hover, so it has no keyboard equivalent. Volume, Weekly
Distance and Top-Set Trend each drew a correct chart whose values no reader
without a pointer could retrieve.

So a component that plots a series owes its reader the same series as text. The
plot and the text read **one array**, and
[`chart-values-policy.ts`](../../apps/web/lib/chart-values-policy.ts) enforces the
pairing in the existing `web` CI job. It reproduced all three CH-F1 violations
before the fix and reports none after.

## The values are visible, not hidden

The obvious implementation is a visually-hidden table. It is the wrong one. The
barrier [CH-F4 and CH-F1](../development/chart-accessibility-validation.md)
measured is **pointer** access, and a keyboard user with working eyes is affected
exactly as much as a screen-reader user: across 88 non-empty Recharts cases, zero
chart surfaces were reachable by Tab and no recorded SVG carried a role or
tabindex. An `sr-only` table serves the second reader and abandons the first.

The disclosure is therefore a native `<details>`, rendered for everyone and
collapsed by default. Native, because a disclosure built from a button and state
has to re-earn keyboard operability, expanded state and the open/close semantics
that `<summary>` already has. Collapsed, because a 150-row table is not what
someone came to the Analytics screen to read — and collapsing it is what lets the
table be uncapped, which is what keeps it from reintroducing horizontal scrolling
at 320px.

## Parity is structural, not tested

The table is rendered **inside** each chart component, from the same `rows` array
the component hands Recharts. A caller cannot forget it, a second projection
cannot drift from the first, and the Strength Analytics miniature cannot disagree
with the canonical Exercise Detail chart it links to — which is the whole of CH-F4.

Formatting moved with it. The rounding (`Math.round`) and the unit label used to
live in the components, so "displayed precision" was defined twice per chart —
once for the tooltip, once for anything else. It now lives in the `lib/`
view-models as a preformatted `valueText`, with the date as `dateText`/`weekText`,
and both the tooltip and the table render the same string. The plot keeps the raw
unrounded number, because the line and the bars must stay proportional; that is
the one place where the plotted value and the retrievable value legitimately
differ, and it is now a visible, tested difference rather than an implicit one.

## A value carries its year

CH-F2 recorded accessible names reading "Week of Dec 29" and "Week of Jan 5" with
nothing to order them. The year was missing from the three chart view-models and
from Muscle Balance, because each had forked the same `MONTHS` table and the same
`formatDayLabel`, and every copy omitted it. They are now one module,
[`chart-date-label.ts`](../../apps/web/lib/chart-date-label.ts).

The year goes wherever a datum is meant to be **retrieved**: the values tables,
the three pointer tooltips, and Muscle Balance's accessible name. It does not go
on axis ticks. An axis is a scale read with its neighbours either side, where
horizontal room is the binding constraint; a tooltip and a table row are read
alone. Fixing only the accessible copy would have left the pointer path ambiguous
while declaring CH-F2 closed.

## The caption carries the projection's meaning

These series are sparse on purpose. `volume-view` invents no zeros, and the API's
`top_set_series` omits a session with no qualifying set. A bare pair of columns
cannot tell a reader whether a missing date was a rest day or a dropped record, so
each table's `<caption>` says what one row means and what an absent row means.

The Distance caption states something narrower than it first appears:
`distance_series` buckets only the weeks a distance set landed in, so an **absent**
week logged no distance, while a **`0 km`** row logged distance work that covered
none. Those are different facts. Gap-filling the window would have made them one
fact and fabricated rest days — the same zero-padding both projections already
refuse.

## What the guard proves, and what it does not

It proves a values table is **rendered** beside every plot. It cannot prove the
table's rows *are* the plotted series: that is a runtime property. Per-point
parity is established instead by `audit/charts.mjs`, which expands each disclosure
by keyboard and compares every row's date and value text against the fixture's own
input rows, and by the view-model unit tests. A green guard is not evidence of
equivalence, and it is recorded here rather than left for someone to assume.

The guard keys on a classified `recharts` import, and an **unclassified** one
fails closed. The failure mode this exists for is the fourth chart someone adds
later, so a fixed list of known plot types is precisely the wrong shape; a filename
convention (`*-chart.tsx`) would be defeated by a rename, and a `ResponsiveContainer`
check both over- and under-fires. Discharge is an AST-matched `<ChartValues>`
element, not a text match, so a comment promising a table does not satisfy it.

## The one exemption is a defect avoided, not a value withheld

The Strength Analytics miniature renders `TopSetTrendChart` inside `<div aria-hidden>`
inside a `<Link>`. Rendering the disclosure there would put a focusable `<summary>`
inside `aria-hidden` — a real accessibility defect — and nest a `<details>` inside
an `<a>`, which is invalid markup whose click the anchor would take. It is a teaser
under ADR-0024, and CH-F4 accepts the link precisely because its destination now
carries the full series.

So `showValues` defaults to **true** and exactly one call site opts out, registered
with its reason in `CHART_VALUES_EXEMPTIONS`. Unlike ADR-0082's and ADR-0083's
registries, this one ships non-empty — which is better evidence the mechanism works
than an empty array is.

## Equal-date Top-Set rows stay ambiguous, deliberately

The app is calendar-free, so two Logged Sessions can be performed on one date, and
`top_set_series` yields one point per qualifying session sorted on `performed_on`
alone. Same-date points are therefore possible, and `TopSetPoint` carries no
session identity — the frontend cannot tell them apart.

Two such rows read honestly alike. The row key became the series **index**, which
fixes a real duplicate-React-key bug that would have dropped a bar, but it is not
shown to the reader: an ordinal like "1 of 2" would present the repository's
incidental return order as a fact about the training. Naming those sessions needs
the session from the API, which is tracked separately.

## Consequences

- A new chart must render `ChartValues` from the rows it plots, or name itself in
  the exemption registry with a reason. CI decides, not review.
- A new `recharts` import must be classified as a plot root or a plot part.
- Displayed precision and date text belong to the `lib/` view-model, not the
  component. A component that formats a value for a tooltip has put the rule in
  the wrong place.
- `audit/charts.mjs` gained `UI_CHART_VIEWPORT` and per-engine executable
  overrides, so the matrix can be re-run at 320px and in a container whose browser
  build differs from the pinned one.

## Alternatives considered

- **A visually-hidden table.** Serves screen readers and abandons the keyboard
  user who also cannot hover, who is the larger half of the measured barrier.
- **Make the SVG focusable with arrow-key point traversal.** The richest answer,
  and the one Recharts fights: it would mean owning focus management, a roving
  tabindex and live-region announcements per chart type, for a result a native
  `<details>` delivers with no custom focus code. Worth revisiting only if the
  table proves insufficient in a real screen-reader pass.
- **Render the table in the callers.** Keeps chart components purely visual, but
  re-derives the rows and lets a caller forget — trading a structural guarantee for
  a reviewable habit.
- **Reuse the `DataList` `<dl>`.** Its grammar is per-entity metadata: no columns,
  no caption, no row count. A series is tabular, and a reader navigating it wants
  column context and the size up front.
- **An always-visible table.** Discoverable without a keystroke, but it puts 150
  rows of tonnage under a chart nobody asked to read, and the compactness argument
  for capping the height returns with a focusable scroll container attached.
- **Cap the height with `overflow-y-auto`.** Adds a focus stop that needs an
  accessible name, to solve a compactness problem the collapsed disclosure already
  solves.
- **Fill sparse gaps with "no session logged" rows.** Makes absence legible by
  fabricating records, which both projections refuse for good reason. The caption
  says it instead.
- **Ordinal disambiguation for same-date Top Sets.** Looks helpful, asserts an
  order the domain does not.
- **Skip the ADR since ADR-0024 already governs teasers.** ADR-0024 says what a
  teaser may be, not whether a plotted datum must have a text equivalent. Without
  this record, the guard's reason for existing is discoverable only by reading the
  guard.
