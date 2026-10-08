---
paths:
  - "apps/web/**"
---
# Frontend rules (apps/web)

One line per rule: trigger → rule (guard or test · ADR). The `lib/*-policy.ts` guards run
under `npm test` and fail closed; each has an exemption registry that is empty unless noted,
and an entry needs a written reason. The ADR holds the why. A static guard proves something
is **declared**, not that it renders right: the `audit/` journeys (`reflow.mjs` at 320px and
200% text, `wide.mjs` at 1440px) render it. A surface no journey renders is unverified.

## Colour and motion

- New Skin colour token or text/fill convention → classify it in `lib/skin-contrast-matrix.ts`;
  every pairing clears 4.6:1 in every Skin and Mode, unknown tokens fail (ADR-0081).
- Accent tint behind text → a declared fill (`bg-cyan-dim`, `bg-cyan`), never a hand-mixed
  `bg-cyan/15`; `-dim` fills sit at the floor, so a hover moves border, ring or text. New
  text-on-fill → `COMPOSITE_PAIRINGS`; a fill with no text → `GRAPHIC_FILLS` with a reason
  (`accent-tint-policy.ts`, ADR-0086).
- Faded text (`text-cyan/80`, `opacity-*`) → don't, unless the rendered result clears 4.6:1 on
  the worst surface in every Skin and Mode; `disabled:` is exempt (`faded-text-policy.ts`, ADR-0083).
- Animation or transform transition → `motion-reduce:animate-none` / `motion-reduce:transition-none`
  in the same class string; colour and opacity transitions are exempt (`motion-policy.ts`, ADR-0082).
- Animation in a stylesheet → on a `::view-transition-*` pseudo-element (the reduced-motion off
  switch in `globals.css` reaches it) or inside `@media (prefers-reduced-motion: no-preference)`;
  never `!important`, never a `<ViewTransition>` `onEnter`/`onExit`/`onUpdate`/`onShare`
  (`view-transition-motion-policy.ts`, ADR-0118).
- Element that stays on screen across a navigation → a `PERSISTENT_ELEMENTS` entry, pinned with
  `style={persistentTransitionStyle(key)}`, never a hand-written `viewTransitionName`; its group
  is frozen in `globals.css`, and a blurred one drops its old snapshot
  (`persistent-transition-policy.ts`, ADR-0119).
- `<ViewTransition>` → literal `default="none"`, `share` on a named one, every class styled in
  `globals.css`; the root stays live. A Session's sigil morphs via `WorkoutSigil morphSessionId`,
  claimed by one surface per page; a morph target renders above any loading boundary
  (`view-transition-boundary-policy.ts`, ADR-0120).
- New Skin or retuned `--color-base` → update `SKIN_BASE_COLORS` in `lib/theme-color.ts` in the
  same change (`theme-color.test.ts`, ADR-0102).

## Layout and reflow

- `<fieldset>` gets `min-w-0`; arbitrary grid tracks are `minmax(0,1fr)`, never bare `1fr`. An
  authored name wraps, never truncates (`reflow-policy.ts`, ADR-0085).
- Row of form fields → `FieldRow` (`pulse/field-row.tsx`) with `FIELD_CELL`/`FIELD_WIDTH` or the
  `WIDE_*` pair, never `grid-cols-[7rem_1fr]`; a truly tabular grid uses `minmax(0,2.5rem)` (ADR-0087).
- Desktop layout → `--spacing-shell` / `--spacing-shell-wide`, switched at `lg:` by CSS only (never
  UA detection, never below `lg:`). A page opts in with `data-shell="wide"` on its root; desktop
  grids use `lg:grid-cols-N` and flex, never bracket tracks; nav renders from `lib/sidebar-nav.ts`
  (ADR-0088).
- Converting a page to wide → put the grid in a mountable component (see `pulse/home-columns.tsx`)
  and add the page as a journey to **both** `audit/wide.mjs` and `audit/reflow.mjs`. What the wide
  layout adds is a read-time projection, never an action (ADR-0088, ADR-0071).
- `font-display` heading → `text-balance` or `text-pretty`, unless it cannot wrap
  (`display-heading-policy.ts`, ADR-0101).
- `<img>` → reserve its box. An Exercise picture renders `pulse/illustration.tsx` (box in
  `lib/illustration-box.ts`); any raw `<img>` declares `width`, `height` and `loading`
  (`image-policy.ts`, `illustration-box.test.ts`, ADR-0095).

## Bundle and rendering cost

- Charts → `recharts` is imported in exactly one module per chart and reached only through its
  `*-lazy.tsx` `next/dynamic` wrapper; `import type` is fine (`recharts-import-policy.ts`, ADR-0090).
- Desktop-only client JS → dynamic import plus a `useWideViewport` mount gate; `hidden lg:block`
  hides markup, not JavaScript. An optional read gets `.catch()`, since `apiGet` rejects on a
  transport failure (ADR-0088).
- Icons → from `@/components/pulse/icons`, never `lucide-react`; keep that file pure re-exports
  (`icon-import-policy.ts`, ADR-0092).
- Per-second tick → in the leaf that renders the figure (`useSecondTick`, `ElapsedClock`,
  `RestCountdown`), never in a screen. `React.memo` only together with `useMemo`'d arrays and
  `useCallback`'d handlers (`live-session-tick.test.ts`, `catalog-list-memo.test.ts`, ADR-0091).
- Filter over an unpaged list → hoist work the filter doesn't affect, filter through
  `useDeferredValue` (not a debounce), `.list-row-defer` on rows, read summary copy off the
  deferred value (`admin-catalog-list.test.ts`, ADR-0097).

## Charts

- New chart or series → render `ChartValues` from the same rows as the plot, with formatting
  (`dateText`, `valueText`) in the `lib/` view-model; the `<caption>` says what an absent row
  means (`chart-values-policy.ts`, `audit/charts.mjs`, ADR-0084).
- Recharts plot root → `accessibilityLayer={false}`; Recharts 3's default makes the SVG an unnamed
  tab stop (`chart-values-policy.ts`, ADR-0084).

## Forms

- Form control → `components/ui/input.tsx`, `select.tsx` or `textarea.tsx`, never native. `Input`
  derives the keypad from `type` + `step` (a decimal needs `step="any"`/`"0.1"`); never force a
  numeric pad on a value with `:`, `-` or letters (`form-input-policy.ts`, `form-affordances.test.ts`,
  ADR-0093).
- No `autoFocus` (`autofocus-policy.ts`). A value field (tempo, duration, Load, authored name)
  declares `spellCheck={false}`; prose keeps the checker (`spellcheck-policy.ts`, ADR-0103).
- Control inside a `Field` → the three primitives claim its ids by rendering; any other control
  spreads `useFieldControl()` from a component of its own. The id is named once, as `htmlFor` on
  the field (`field-control-policy.ts`, `form-accessibility.test.ts`, ADR-0107). A caption over several controls → `FieldGroup`
  (ADR-0108).
- Part of a Logged Set (amount, Load, effort, note) → compose from `pulse/set-entry.tsx`.
  `SetEntry.Load` / `SetEntry.Quantity` are the one place a kind is added (ADR-0010, ADR-0032); `SetEntryProvider` when a
  holder drives the row, `SetEntryFormProvider` under a server action; rows map through a declared
  table (`SetEntryRowMap`, `seededSetEntryValues`) (`set-entry.test.ts`, `set-entry-fields.test.ts`,
  ADR-0106).
- Performed-set row → `LogSetInput` → `buildLoggedSets` / `readPostedSetRows` in `lib/logged-set.ts`,
  never a per-path builder; a path keeps only which posted rows count. Blank skips, garbage errors;
  options are `performedMark` and `defaultLoadKind` only (`logged-set.test.ts`, ADR-0115).
- Live Session per-set field → a cell in the row in `live-session-sets.tsx` from a `SetEntry.*Cell`;
  what doesn't vary per set goes in the card header; the row is a wrapping flex row, not a grid
  (`live-set-table-card.test.ts`, ADR-0114).
- Props-seeded `useState` → only where the prop cannot change. Admin editors overlay *changed*
  fields on the prop (`overlayEditorEdits`, `applyEditorEdit`); `ExerciseCatalogTaxonomy` is the
  documented exception (`admin-editor-props-refresh.test.ts`).
- Client-side filter → mirror it in the URL: `parse*Filters` / `*FiltersToQuery` in `lib/`, seed
  from `useSearchParams` once, write with `replaceFilterQuery` (a `replaceState`, never a router
  push), `Suspense` on the page, `Object.hasOwn` for vocabulary membership (ADR-0100).

## Components and structure

- Guard or harness that walks or transpiles TypeScript → `import ts from "@typescript/typescript6"`;
  `typescript` 7 has no JS API and is only the compiler (`npm run typecheck`, ADR-0116).
- Signed-in / signed-out branch → Clerk's `<Show when="signed-in">`; Core 3 removed `SignedIn`,
  `SignedOut` and `Protect`, which still import but throw on render (`clerk-import-policy.ts`).
- Section divider → `SectionHeader`, a heading (`level={3}` inside another section). Anything that
  opens a group is a heading; don't skip levels (`section-heading.test.ts`, ADR-0094).
- Irreversible action → `pulse/confirm-dialog.tsx`, never `alert`/`confirm`/`prompt`. Copy is a
  question plus what accepting costs; on a `<form action>` keep the submit, `preventDefault` and
  confirm with `requestSubmit()`. Add a new dialog to the `confirm` audit journey
  (`native-dialog-policy.ts`, `destructive-confirm.test.ts`, ADR-0098).
- Rare or destructive page actions → an `ActionSheet` behind a ⋯ whose `aria-label` names whose
  actions they are; rows from `actionSheetItemClass()` (`action-sheet-item.tsx`, server-safe), the
  destructive one last below `ActionSheetSeparator`; an action that leaves the page as it was closes
  via `useActionSheet()` (`action-sheet.test.ts`, `client-boundary-policy.ts`, ADR-0113).
- Interactive surface → a native control or `[role="button"]` (the `touch-action: manipulation` list
  in `globals.css`); another widget role extends that rule; a custom gesture spells `touch-none`
  (`tap-target-policy.ts`, ADR-0099).
- Instant (a moment on the clock) → `pulse/local-instant.tsx`, parsed with `lib/instant.ts`
  (offsetless reads as UTC); never `toLocale*` in a Server Component. Calendar dates →
  `lib/date-format.ts` (`server-locale-policy.ts`, ADR-0096).
- Focusable surface that isn't a DOM control → draw the focus indicator, don't tint (the atlas's
  `.atlas-region-ring`) (`atlas-focus-ring.test.ts`, ADR-0104).
- Optional card or link one caller offers → a `children` slot, never a `show*` flag; a flag for a
  detail inside the component's own rendering is fine (`generate-training-launchpad.test.ts`, ADR-0109).
- State three components away from its control → a context `{ state, actions, meta }`: one
  `dispatch`, payloads derived from the reducer's union, membership registries
  `as const satisfies`; don't memoize a value no `React.memo` reads. Props stay for a leaf's own
  closure or shared presentation (`PrescriptionFieldStack`, ADR-0067)
  (`prescription-draft-context.test.ts`, ADR-0105).
- Context API → read with `use(Ctx)`, provide with `<Ctx value={…}>`, never `useContext` or
  `.Provider`; don't name a member `Provider`/`Consumer` (`context-api-policy.ts`, ADR-0110).
- Copy → the apostrophe is `’` in every string, `lib/` included (`copy-typography-policy.ts`,
  ADR-0101). A placeholder that reads as an instruction ends in `…`, a value example doesn't, and
  one restating its hint is deleted.
