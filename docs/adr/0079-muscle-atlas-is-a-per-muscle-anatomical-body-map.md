# The Muscle Atlas is a per-muscle anatomical body map over the enriched per-muscle read

ADR-0073 shipped the Muscle Atlas as a front/back **six-region stylized silhouette**: each
region one of the six real Muscle Groups, heat-shaded by recent volume, over a fixed
range-independent window, with a drawer and a text list beneath. ADR-0078 then stood up the
finer **`Muscle`** vocabulary (~40 individual muscles, each nesting under exactly one group)
and threaded Primary/Secondary emphasis through the read path, as the prefactor for a real
anatomical map. Issues #540–#542 delivered the three pieces that map needs: the per-muscle,
emphasis-weighted **coverage read** (`coverage.muscles`, #540), a pure per-muscle **view-model**
(`muscle-region-atlas-view`, #541), and the original **anatomical SVG artwork** — neutral, male,
and female figures, front + back, ~40 addressable muscle paths each keyed to the canonical
`Muscle` vocabulary, plus a manifest (#542).

This ADR is the consuming step: the Stats screen's Muscle Atlas **replaces the six-region
silhouette with the detailed anatomical body map**, heat-shaded per individual muscle. It
**extends and supersedes ADR-0073's presentation** while keeping every one of ADR-0073's rules
intact — the six-group roll-up is retained (now as the top level of the text list, and as each
muscle's parent), and the atlas stays a *presentation* of the same read-time coverage signal,
not a new stored one.

## Decision

- **Render the anatomical figure, chosen by `Profile.gender`.** The map draws the male figure
  for gender `"M"`, the female for `"F"`, and the **neutral/androgynous** figure for a null,
  unset, or unrecognized value — so the atlas always renders a body. Figure selection is a pure
  function (`resolveFigure`); the profile read failing degrades to neutral rather than hiding
  the section.
- **Draw muscles as interactive nodes from the same geometry the assets are generated from.**
  The committed SVGs (#542) are the license-safe standalone artifact and the contract the tests
  guard, but the screen needs each muscle to be individually addressable, heat-shaded, hoverable,
  and keyboard-activatable. So the client renders `<path>` elements from a pure render model
  (`atlas-render.toFigureRender`) built on the *same* `warpPoint`/`smoothClosedPath` geometry
  and the same `data-muscle-id` = canonical `Muscle` contract, rather than injecting an opaque
  SVG string. In-app map and standalone asset can never disagree because they share one geometry
  source. The silhouette is exposed as structured data (`silhouetteModel`) so the markup builder
  and the React figure compose it from one place, byte-for-byte.
- **Heat stays the group hue at volume-scaled opacity, descriptive only (ADR-0025/0073).** Each
  muscle fills with its parent group's palette hue at an opacity scaled by the view-model's
  emphasis-weighted `intensity` (relative to the busiest muscle). An untrained muscle is a
  **faint neutral dashed outline, no fill** — never a red "train this" alarm. Nothing is ranked;
  the window is the same fixed, range-independent slice (ADR-0001). Retaining the distinct-six
  group palette (rather than a cool→warm heat ramp) keeps "a region's color identifies its
  group" consistent across the atlas, the Muscle Split, and the Muscle Balance — and nothing
  rides on color regardless, since state and volume are carried in text and aria-labels.
- **A two-level group→muscle text list keeps the section legible without the illustration.** The
  six Muscle Groups render as real controls that expand to their muscles; every group header and
  muscle row carries a composed aria-label naming state + volume, and the group of a
  body-selected muscle auto-expands so the list mirrors the map. Selecting a muscle — on the body
  or in the list — opens a **labeled dialog** drawer naming the muscle, its parent group, its
  in-window mapped sets, and the contributing exercises; the drawer is dismissible by scrim or
  Escape and `inert` when closed.
- **Honor `prefers-reduced-motion`.** The only motion is a subtle fill/stroke transition on
  hover/selection and the drawer slide; all are disabled under reduced-motion. There is no
  breathing or ripple animation. Hover highlight applies on fine-pointer devices only; keyboard
  focus drives the same highlight (an SVG `<g>` renders no outline ring).
- **No data-model change.** The atlas is a presentation of the read-time `coverage.muscles`
  projection (#540, ADR-0018/0019/0073): no stored column, no migration, no write hook.

## Considered options

- **Inject the committed SVG string and wire heat via the DOM / `dangerouslySetInnerHTML`.**
  Rejected: attaching per-muscle click/keyboard handlers, heat opacity, and hover state to paths
  inside an injected string means post-mount DOM walking and defeats React's model. Rendering
  from the shared geometry gives real nodes, typed props, and unit-testable render data, with the
  identical `data-muscle-id` contract and viewBox — the asset test still guards the standalone
  files.
- **A cool→warm (blue→red) heat ramp per muscle.** Rejected: it discards ADR-0073's
  "color identifies group" invariant that the Split and Balance now share, and a red "hot"
  muscle reads as an alarm — exactly the prescriptive nudge ADR-0025 forbids. Group hue at
  volume-scaled opacity conveys "more work = more saturated" without ranking or alarming.
- **A front/back toggle instead of showing both.** Rejected: kept as today — both views render
  side by side, so the whole body is legible at a glance and the "front and back" acceptance is
  met without hiding half the map behind an interaction.
- **Split muscles into anatomical heads for finer heat.** Out of scope and already rejected at
  the vocabulary tier (ADR-0078): the map renders exactly the curated `Muscle` set, one control
  per muscle.
- **Keep the six-region silhouette and add the anatomical map beside it.** Rejected: two atlases
  of the same signal is redundant and confusing. The anatomical map is the successor; the
  six-group tier survives where it belongs — as the roll-up level of the text list and each
  muscle's parent group.

## Consequences

- The six-region atlas surface is **retired and replaced**: `muscle-atlas.tsx`, `atlas-body.tsx`,
  and the `muscle-atlas-view` view-model (with its test) are removed; the Stats screen renders
  `muscle-region-atlas.tsx` + `atlas-figure.tsx` over `toMuscleRegionAtlas` (#541) and
  `toFigureRender`. The shared neutral copy (`muscle-atlas-labels.ts`) and the distinct-six
  palette (`muscle-colors.ts`) are unchanged and still shared with the Split and Balance.
- The Analytics page now reads the Fitness Profile (in the same parallel fetch) purely to pick
  the atlas figure; a failed profile read falls back to the neutral figure.
- **Accessibility is preserved end to end**: every muscle path, group header, and muscle row is a
  real control with a composed aria-label naming muscle/group, state, window, and volume, so
  nothing rides on color; the drawer is a labeled, dismissible, inert-when-closed dialog.
- The section **degrades gracefully**: a genuinely empty window shows a neutral figure and a
  teaching empty state; an unclassified-only window reads as all-not-trained muscles plus the
  neutral off-map footnote (ADR-0025/0073), never "nothing logged".
- **No new domain term.** The **Muscle Atlas** surface term (CONTEXT.md) is refined to describe
  the anatomical per-muscle map; `Muscle` and `Muscle Group` are unchanged, so the terminology
  guard needs no new entry.
