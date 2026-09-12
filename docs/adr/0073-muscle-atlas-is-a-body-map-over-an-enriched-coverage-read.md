# The Muscle Atlas is a body map over an enriched Coverage read, on a distinct-six palette

Muscle Group Coverage (ADR-0025) shipped as a six-row checklist: each real Muscle Group
trained / not-trained over a fixed, range-independent 8-week window, plus a neutral
disclosure of any off-map work. It answered *whether* a group had appeared, but not *how
much* or *from what*, and it read as an anonymous list of labels. Task #9 replaces that
checklist on the Stats screen with a **Muscle Atlas**: a front + back body silhouette whose
regions are the six real groups, heat-shaded by recent volume, where selecting a region — on
the body or in the list beneath — opens a bottom drawer naming its mapped sets and the
exercises behind them. A text list of all six groups (and any off-map work) stays visible
beneath the map, so the section is fully legible without the illustration.

The atlas is a **presentation of the same read-time Coverage signal**, not a new stored one.
It stays **descriptive only** (ADR-0025): an untrained region is a neutral faint outline,
never a red "train this" nudge; heat is a description of what was done, never a quota fill;
nothing is ranked. It stays **calendar-free** (ADR-0001): the window is the same fixed 8-week
slice, independent of the range toggle. Unclassified stays honest leftovers — disclosed in
the list and a footnote, never a body region and never a target.

To feed the drawer, `recent_coverage` is **enriched** rather than joined by a second read:
each `GroupCoverage` now carries its in-window `sets` count and its ranked
`contributing_exercises`, and `RecentCoverage` carries the `unclassified_sets` count behind
the footnote. Set counts are **one per distinct group a set trains** — a compound bench press
counts one toward Chest, Shoulders, and Arms — so per-group counts intentionally need not sum
to the total. This is a **presence/volume** read, deliberately distinct from the even-split,
sum-to-100 `distribution` behind the Muscle Split, which answers a different question
(proportion of training) over a different (range-scoped) window. The two surfaces coexist:
proportion (Split) beside presence + volume (Atlas).

A body map forces a **palette fix**. The shipped `GROUP_COLOR` reused hues — Legs and Arms
were both cyan, Chest and Core both violet — which is invisible on stacked bars (never
adjacent by color) but fatal on a silhouette, where two regions would render identically. So
the muscle palette becomes a **distinct six**: cyan / magenta / blue / amber / violet /
green, one per real group, with `amber` and `green` added as real theme tokens (tuned per
Mode for the default PULSE skin; the other skins inherit the mid-tone base values). The same
palette now backs the Split and Balance surfaces too — the "same colors mean the same group
everywhere" payoff the atlas direction was chosen for.

## Considered options

- **Add a second endpoint / read for the per-region detail** — rejected: coverage already
  replays the same in-window history; computing sets and contributing exercises in the same
  pass is cheaper and keeps the map and its detail from ever disagreeing. One read, enriched.
- **Even-split the per-group set counts (as `distribution` does)** — rejected for this
  surface: "3.5 chest sets" is a poor headline, and a lifter reads "how many sets hit my
  chest" as counting a compound once for chest. Even-split is right for a proportion that must
  sum to 100 (the Split); per-distinct-group counting is right for a presence/volume read.
  The two conventions are documented so the surfaces stay legible side by side.
- **Store per-group set counts / an atlas projection** — rejected: it violates the
  read-time-projection invariant (ADR-0018/0019) and buys nothing over replaying the history,
  which coverage already does. No column, no migration, no write hook.
- **Keep the four-hue accent palette and reuse colors on the body** — rejected: the whole
  point of the atlas is that a region's color identifies its group; two identical regions
  defeat it. Distinct-six is a prerequisite, not a polish.
- **Introduce a dedicated muscle palette decoupled from the theme accents** — rejected as
  scope creep: reusing the existing accent tokens (plus two new ones) keeps muscle colors
  re-theming with each Skin exactly as they do today, with no new token family to maintain.
- **A 3D body model** — rejected: out of scope and unnecessary. A custom accessible SVG with
  a curated region→group mapping is the whole mechanism; the figure is stylized and the
  illustration can deepen later without touching the mapping.

## Consequences

- **No data-model change**: `recent_coverage` is enriched in place; the API envelope's
  `coverage.groups[]` gains `sets` and `contributing_exercises`, and `coverage` gains
  `unclassified_sets`. `covered` is retained and equals `sets > 0`.
- The Muscle Coverage checklist (`muscle-coverage.tsx`, `muscle-coverage-view.ts`) is retired
  from the Stats screen and replaced by the Muscle Atlas (`muscle-atlas.tsx` +
  `atlas-body.tsx`, `muscle-atlas-view.ts`). The Muscle Split is unchanged.
- The shared muscle palette becomes a **distinct six** (`muscle-colors.ts`); `amber` and
  `green` are added as theme tokens (`globals.css`). Muscle Split and Muscle Balance gain
  distinct hues for free — a strict improvement (no more Legs/Arms or Chest/Core collision).
- Accessibility is preserved end to end: every region and list row is a real control with a
  composed `aria-label` naming group, state, window, and volume, so nothing rides on color;
  the drawer is a labeled dialog, dismissible by scrim or Escape, inert when closed.
- Introduces **one new surface term, Muscle Atlas** (see `CONTEXT.md`), a presentation of
  Muscle Group Coverage — not a new domain concept.
