# 0050 — A Skin is a full visual identity: colour, typography, and shape

We're widening what a **Skin** *is*. Until now a Skin varied **colour only**: ADR-0048
shipped Skins as "named palette families" and deliberately scoped everything else out
("richer skins are out of scope"), so Aurora and Vercel differed from PULSE only in their
`--color-*` tokens while every Skin rendered in the same Space Grotesk / JetBrains Mono at
the same radii. In practice that made the Skins read as near-identical — the same app in a
different accent. A Skin now also varies **typography** (its `--font-*` tokens) and **shape**
(its `--radius-*` tokens, authored as a single "roundness" character), so publishing a Skin
restyles the app as a distinct visual identity, not just a recoloured one. This **supersedes
the colour-only scope of ADR-0048**; everything else in ADR-0048 (fixed curated catalog, one
admin-published Active Skin app-wide, users choose only their Mode) stands unchanged.

## Considered options

- **Keep Skins colour-only (rejected).** The status quo; the reason we're here — the Skins
  are too similar to be worth switching between.
- **User- or AI-authored fonts loaded at runtime (rejected for v1).** Would mean fetching an
  arbitrary typeface per published Skin and re-opens the accessibility/legibility validation
  ADR-0048 already deferred. It also breaks the "applies on next visit, no runtime fetch"
  property. Out of scope while the catalog stays fixed.
- **Add typography + shape to each fixed-catalog Skin, fonts bundled at build time
  (chosen).** `next/font` self-hosts every catalog Skin's typefaces up front and exposes them
  as CSS variables; a Skin's `--font-*` / `--radius-*` tokens select among them. This keeps
  the fixed-catalog trade-off intact — no runtime font fetch — while giving each Skin a real
  identity.

## Consequences

- **Two token groups, split by how they compose with Mode.** Colour is polarity-dependent, so
  it stays authored **per variant** under `[data-skin][data-mode]` (a light and a dark block
  per Skin, as before). Fonts and radii are **Mode-invariant** — a typeface never flips
  between Light and Dark — so each Skin states them **once** under `html[data-skin="…"]` (no
  `data-mode` qualifier; the `html` element carries the specificity to beat the `@theme`
  `:root` defaults). Modelling the Mode-invariance honestly stops a light/dark font or radius
  ever drifting apart by accident.
- **The domain contract gains a shared group.** `app/domain/skin.py` grows a `SHARED_TOKENS`
  set (the three font roles + four radius steps) and a per-Skin `shared` field; a well-formed
  Skin now covers both colour variants **and** the shared group, or `validate_catalog` rejects
  it at import time. `SHARED_TOKENS` is disjoint from `REQUIRED_TOKENS` by construction.
- **Every catalog Skin fully specifies its identity.** Fonts are mandatory and explicit — a
  Skin names its display/sans/mono outright (mono may repeat a default, but it is stated, not
  inherited). PULSE keeps Space Grotesk / JetBrains Mono; Aurora ships Bricolage Grotesque /
  Inter / IBM Plex Mono at a **soft** roundness; Vercel ships Geist / Geist Mono at a **sharp**
  roundness. Each font falls back to a same-category system stack so a font that fails to load
  still renders in the right shape.
- **Charts stop being frozen.** Recharts paints SVG stroke/fill with concrete strings, so the
  analytics charts had hardcoded literal PULSE-dark hex — they ignored the Active Skin **and**
  the user's Mode (a latent Light-mode bug). They now resolve their colours from the live CSS
  variables through a small client seam (`lib/chart-theme.ts` pure + `lib/use-chart-theme.ts`
  hook), so a chart tracks whatever Skin × Mode is stamped on `<html>`, including an admin's
  client-side Skin preview. The top-set trend chart's "earlier" bars move to the token-true
  translucent `--color-cyan-dim` (they previously used an off-token solid teal). First paint
  falls back to the PULSE-dark values, so SSR and the client's first frame agree; the true
  Skin × Mode resolves on mount. Chart tick text already inherits `--font-sans`, so typography
  in charts follows the Skin for free.
- **Terminology.** CONTEXT.md's "Skin" (and "Theme") definitions move from "palette / set of
  colours" to "coordinated visual identity — colour, typography, and shape". No term is
  retired, so the terminology guard is unchanged.
- **Bundle cost.** All catalog typefaces are bundled up front rather than lazily by Active
  Skin. `next/font` still loads only the glyph coverage each face needs, and the fixed catalog
  bounds the count, so the cost is a handful of self-hosted font payloads — an accepted
  trade-off for the "applies on next visit, no runtime fetch" property.
