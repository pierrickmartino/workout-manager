# Exercise discovery — "Field Guide" UI prototype (THROWAWAY)

> **Prototype, not production.** Written under the `/prototype` skill's constraints
> (no tests, minimal error handling, no abstractions to defend). Do not merge to
> `main` as-is — fold the winning variant into the real code and bin the rest onto
> a throwaway branch. See `.claude/skills/prototype/UI.md`.

## The question

> _"What should exercise discovery look like if it felt like opening a field guide?"_

Screens 05–06: the exercise catalog (`/exercises`), the builder picker, and exercise
detail. Give each exercise a **consistent line illustration**, a **plain-language
muscle summary**, and an **equipment symbol**; opening **Details** reveals
instructions, alternatives, and past performance in a focused panel while the search
and selected filters stay intact behind it.

## Shape

Sub-shape A (adjustment to an existing page). Three variants render on the **existing
`/exercises` route**, gated by `?variant=`:

- `/exercises` (no param) → untouched production browser (`ExerciseCatalogBrowser`).
- `/exercises?variant=A` → **Field Guide Index** — illustrated list rows, morphing
  detail dialog (View Transitions for spatial continuity).
- `/exercises?variant=B` → **Specimen Plates** — illustration-forward gallery grid,
  morphing detail dialog.
- `/exercises?variant=C` → **Taxonomy** — the catalog reorganised into collapsible
  movement-family sections, bottom **Drawer** detail surface (shadcn/ui Drawer idiom).

The floating bottom switcher cycles A/B/C (← / → keys too) and is **hidden in
production builds** (`process.env.NODE_ENV`), so a stray merge can't ship it.

## Shared primitives (the field-guide vocabulary — reused by all three)

Like a shared `<Header>`, these are the consistent field-guide language; each variant
is free to lay them out however it likes.

- `lib/prototype/movement-family.ts` — classifies an exercise into a **broad movement
  family** (squat / hinge / push / pull / carry / locomotion / core) from its name,
  muscles, and equipment. Confident matches (a name keyword) get the family glyph;
  weak matches fall back to a **generic movement** glyph rather than mis-illustrating —
  "an illustrated generic movement only when it accurately represents the exercise."
- `movement-glyph.tsx` — original SVG line illustrations, one per family + a generic.
- `lib/prototype/plain-muscle-summary.ts` — turns the raw muscle list into a plain
  sentence ("Builds your chest, shoulders, and triceps").
- `equipment-symbol.tsx` — maps `required_equipment` strings to Lucide icons.
- `detail-content.tsx` — the shared inner content of the Details surface (illustration
  hero, plain summary, how-to, alternatives, past performance).

## Data

Read-only. Browse results come from the real `fetchCatalogPage` server action (same one
production uses). Details are fetched lazily by `fieldguide-detail-action.ts`, a
read-only wrapper over the existing `fetchExercise` reader — nothing here mutates a plan.
The classification and artwork are the point; the panel content is honest real data.

## What we're trying to learn

1. Do the movement-family illustrations give the library real visual variety without
   107 bespoke drawings? Is the classifier accurate enough to trust the glyph?
2. Which browse structure (list / gallery / taxonomy) makes discovery feel like a
   field guide rather than a database?
3. Does the morphing dialog vs. the bottom drawer feel better for "open Details, keep
   the search behind it"?

_Interesting feedback is usually "I want the rows from A with the family grouping from C"._
