# Skin text tokens must clear WCAG AA against every surface, enforced by a contrast guard

Every Skin defines a three-rung **Text Ramp** — `text-primary` / `text-secondary`
/ `text-muted` — and the quiet **muted** rung carries the app's structure: the
uppercase mono micro-labels (stat captions, `DISPLAY NAME` / `GENDER` rows,
`LAST TRAINED`, `data-list` metadata) rendered via `.label-mono` at 9–11px. A review
flagged Aurora's light muted (`#6f7d9c`) at ≈3.9:1 on white — under the WCAG AA floor
of 4.5:1 for normal-size text — and proposed hand-fixing that one value.

Auditing the actual token layer told a wider story. `muted` fails AA against at least
one surface in **all six** Skin×Mode combinations, including PULSE, the default — the
binding surface is always `elevated`:

| Skin × Mode  | old muted | worst (vs elevated) | new muted | new worst |
|--------------|-----------|---------------------|-----------|-----------|
| pulse dark   | `#71717a` | 3.08                | `#8f8f97` | 4.64      |
| pulse light  | `#71717a` | 4.40                | `#6d6d76` | 4.66      |
| aurora dark  | `#6f7d9c` | 3.75                | `#818da8` | 4.64      |
| aurora light | `#6f7d9c` | 3.68                | `#606d8b` | 4.61      |
| vercel dark  | `#6e6e6e` | 3.55                | `#818181` | 4.65      |
| vercel light | `#8f8f8f` | 2.89                | `#6d6d6d` | 4.62      |

`primary` and `secondary` already clear AA everywhere (secondary's worst is 5.13), so
the defect is entirely the muted rung — and it is universal, not Aurora-specific.
A Skin is published app-wide by an **admin** with no code review of its palette
(ADR-0048), so an accessibility floor left to human review regresses the next time a
Skin is added. We therefore retune every failing `muted` value to clear ~4.6:1
worst-case (a hair above the 4.5 floor, so rounding and future nudges don't teeter on
the line) **and** establish the AA floor as a mechanized invariant — the **Contrast
Floor** — enforced by a guard test (`apps/web/lib/skin-contrast.test.ts`) that parses
the token source and fails CI on any regression. This is the colour analogue of the
backend's `terminology_guard`.

## Considered options

- **Hand-fix Aurora's one value (rejected).** The finding's proposal. It patches one
  of six holes and leaves Vercel light — the *worst* offender at 2.89:1 — shipping.
  No guard means the next published Skin re-opens the same defect.
- **Promote the labels to the `secondary` token (rejected).** Also proposed. There is
  no "label colour" token — `.label-mono` sets type only; colour is `text-muted` at
  ~210 call sites. Promoting flattens the deliberate three-step ramp (quiet metadata
  vs. supporting copy) across the whole UI, not just the broken labels, and recolours
  overlines that were never broken (they are `text-cyan`, which passes).
- **Floor the label font size at ~11px (rejected as a contrast fix).** WCAG's 4.5:1
  threshold is identical for every size below the "large text" cutoff (24px / 18.66px
  bold); none of these 7–11px labels qualify for the 3:1 large-text break, so a size
  floor changes nothing about compliance. Legibility of tiny type is a separate design
  question, not this accessibility defect.
- **Retune the `muted` values and mechanize the AA floor (chosen).** Fixes all six
  Skins at the token layer — one place, ramp semantics preserved — and makes the floor
  un-regressable by guarding the token source itself.

## Consequences

- **`muted` moves toward `secondary`, app-wide.** Forcing AA against the lightest
  surface pushes muted lighter (dark modes) / darker (light modes), so it reads as a
  distinct-but-closer rung rather than a barely-there whisper. This is the honest cost
  of a legible quiet rung.
- **Vercel light is the one two-token exception.** Its Geist `secondary` (`#666666`,
  5.13:1) leaves no room for an AA-passing muted to sit *below* it — the only
  AA-clearing muted collides perceptually with secondary. So Vercel light also darkens
  `secondary` to `#525252` (6.98:1), reopening a ~27-level gap. This is the palette
  being too tight, fixed in that Skin rather than exempted. No other Skin needed it.
- **The guard is AA-only, by choice.** It asserts each rung ≥ 4.5:1 against every
  surface, in both variants — the objective WCAG contract. It deliberately does **not**
  assert perceptual separation between rungs: "distinct step" has no crisp threshold,
  and any number risks false failures. **Residual risk:** a future Skin could keep all
  rungs AA-passing yet collapse `muted` onto `secondary` (exactly the Vercel-light
  case) and stay green. That single case is left to human design review; the guard
  catches the illegibility failure, not the flatness one.
- **The guard lives on the frontend, over the CSS.** Token *values* live in
  `globals.css`, not in the backend `app/domain/skin.py` (which owns the value-free
  structural contract — which tokens must exist). The guard parses `globals.css`
  directly, so there is no second copy of the palette to drift. Parsing every
  colour-defining leaf block also covers the System-Mode `@media` duplicates — and in
  fact first caught a real drift there, where the explicit and `@media` light blocks
  had diverged.
- **The dead `Gauge` component is removed.** The finding's most extreme evidence,
  `text-[7px]` in `gauge.tsx`, was in a component nothing imports or renders. It is
  deleted rather than fixed or frozen.
- **Terminology.** `CONTEXT.md` gains **Text Ramp** (the ordered primary/secondary/
  muted rung set) and **Contrast Floor** (this invariant), and the **Skin** entry
  gains the well-formedness clause that every rung clears the Floor in both variants.
  No term is retired, so the terminology guard is unchanged.
