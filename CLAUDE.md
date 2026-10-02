# CLAUDE.md

Operational map for working in this repo productively with no additional context.
Read this first, then [`CONTEXT.md`](./CONTEXT.md) for the domain **language** and
[`docs/adr/`](./docs/adr) for the **why** behind every invariant. When you change
behaviour, [`REVIEW.md`](./REVIEW.md) is the checklist your change must survive.

## What this is

An AI-assisted app for creating, following, and tracking fitness workouts. The
domain's cardinal rule: a **plan** (what the AI prescribes) and a **record** (what
the user actually did) are never the same thing. Most of the design falls out of
keeping those two separate. See `CONTEXT.md`.

## Layout

Monorepo with two deployables under `apps/`:

- **`apps/api`** — FastAPI backend (Python 3.11, SQLModel/Postgres, Alembic,
  Redis/RQ for async generation). Domain-driven layout:
  - `app/domain/` — pure domain logic (no I/O): one-rep-max, progression,
    readiness, streak, achievements, volume, load, completion… Unit-test heaven.
  - `app/repositories/` — the **Repository pattern** seam; all DB access goes
    through these. Business logic depends on the interface, not SQLModel.
  - `app/routes/` — HTTP endpoints (thin; delegate to domain/services).
  - `app/generation/` — AI generation: the LLM **port/factory** (see Seams),
    caching, RQ worker/job queue, protocol/session/substitute generators.
  - `app/logbook/`, `app/protocols/`, `app/live/`, `app/adoption/`,
    `app/substitution/` — feature services.
  - `app/quality/terminology_guard.py` — executable terminology tripwire (below).
- **`apps/web`** — Next.js App Router PWA (React 19, Clerk auth, Tailwind).
  - `app/` — routes/pages (server components fetch server-side; JWT never
    reaches the browser). `components/` — UI, incl. the `pulse/` design system.
  - `lib/` — view-model mappers with co-located `*.test.ts` (the frontend's
    logic lives here, deliberately, so it's unit-testable without a browser).

## Run & test

Everything in the test suites is **offline** — SQLite, injected JWKS, a fake LLM.
No live Postgres/Redis/Clerk needed to run tests.

```bash
# Backend
cd apps/api
pip install -e ".[dev]"           # or: uv venv && uv pip install -e ".[dev]"
pytest --cov --cov-report=term-missing

# Frontend
cd apps/web
npm ci
npm test                          # node --test over lib/*.test.ts

# Full stack (needs Clerk keys in .env — see README.md)
docker compose up --build         # api runs `alembic upgrade head` on start
```

CI (`.github/workflows/ci.yml`) runs both suites on every push/PR.

## Architectural seams — route through these, don't bypass them

- **Response envelope** (`app/envelope.py`): every endpoint returns
  `{success, data, error}` (+ `meta` when paginated). Use `success_envelope` /
  `error_envelope`; never hand-roll a response shape.
- **Repository pattern** (`app/repositories/`): all persistence goes through a
  repository. Don't reach into SQLModel sessions from routes/domain.
- **LLM port + factory** (`app/generation/llm/port.py`, `factory.py`, ADR-0006):
  *every* AI call goes through the one `StructuredLLM.complete` seam, which
  returns raw JSON **text** — each generator does its own `parse_*` validation.
  Construct providers only via `build_llm_client`. Tests inject a fake LLM.
- **Two-layer generation cache** (ADR-0003): immutable Generated content keyed by
  a **coarse** normalized tuple; users **adopt-by-copy** and mutate only their
  own copy.

## Load-bearing invariants (violating these is a bug, not a style nit)

These are enforced by review (`REVIEW.md`) and, where mechanizable, by tests.

- **Read-time projections, never stored ledgers**: XP, Operator Level, Streak,
  Achievements, and Personal Records are computed from Logged Sessions/Sets at
  read time. No `xp` column, no unlock table, no write hooks (ADR-0018/0019).
- **Safety cache bypass**: a user with any **Sensitive Constraint** (injury,
  rehab, postpartum, medical) is *never* served cached/shared generation — always
  a fresh generation (ADR-0003). This is a safety rule, not an optimization.
- **Edits touch only the un-performed tail**: a performed Session is settled
  record and is never rewritten or reordered (ADR-0020).
- **Self-paced, calendar-free**: there is no "today". No dated schedules, no
  recovery %, no daily streak (ADR-0001). Readiness is a 3-state signal, not a
  score.
- **`Load` is a typed value** (absolute / bodyweight / %1RM / qualitative /
  range), never a bare kg number (CONTEXT 'Load').
- **Completion Outcome gates advancement**: only a *Completed* Logged Session
  advances a Protocol to its Next Session (ADR-0013).
- **Live Session is ephemeral / client-side** until finished (ADR-0012).
- **Estimated 1RM / PR** only from absolute-Load sets in a trustworthy rep range.

## Terminology discipline

`CONTEXT.md` is the law for naming; each term lists the words to **_Avoid_**. A
subset of hard regressions is enforced automatically by
`app/quality/terminology_guard.py` (Program→Protocol, daily streak, personal
best, max weight, readiness/recovery score). It runs as a pytest test. When you
retire or rename a domain term, add it to the guard's `BANNED_TERMS` registry so
the regression is caught forever — that's a one-line addition.

## Conventions

Full rules in [`.claude/rules/`](./.claude/rules). The load-bearing ones:

- **Immutability** — return new objects; never mutate in place.
- **Small, cohesive files** (200–400 lines typical, 800 max) organized by
  feature/domain, not by type.
- **Tests-first**, 80% coverage bar; AAA structure with behavior-describing
  names. Domain logic belongs in `app/domain/` (pure) so it's trivially testable.
- **Conventional commits** (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`,
  `chore:`).
- **Exact dependency versions in `apps/web/package.json`** — no `^`, so two installs at
  different times resolve identically and a dependency moves in a reviewable diff rather
  than on whoever installed last. Upgrade with `npm install <pkg>@<version>` (which writes
  the exact version) and let CI judge it. `apps/api/pyproject.toml` deliberately keeps
  `>=` floors instead: it has no lockfile, and several of those floors are documented
  security minimums, not preferred versions.
- Explicit error handling; validate at system boundaries; no hardcoded secrets
  (env vars only).

## Where to make a change

- New/changed domain rule → `app/domain/` (+ unit test) → surface via a
  service/route → update `CONTEXT.md` if it introduces or shifts a term → write
  an ADR if it's an architectural decision.
- New endpoint → `app/routes/`, return via the envelope, back it with a
  repository, add an endpoint test.
- New AI generation → go through the LLM port; add a `parse_*` boundary; test
  with the fake LLM.
- New Exercise Prescription field → add it to the spine in
  `app/repositories/prescription_mapping.py` (`PrescriptionDraft` + its ORM
  column) and classify it in the authorship partition; every persistence mapper
  routes through the one manifest, and `tests/test_prescription_spine.py` fails
  if a projection or the partition forgets it (ADR-0069).
- Frontend logic → put it in `apps/web/lib/` as a view-model with a `*.test.ts`,
  keep components thin.

- New Skin colour token or text/fill convention → classify the token and extend
  `apps/web/lib/skin-contrast-matrix.ts`'s pairing registry. The Contrast Floor
  guard checks every flat and declared composite pairing at 4.6:1 in every Skin
  and Mode, including System copies; unknown colour tokens fail closed (ADR-0081).

- New accent tint behind text, or any new colour token at a call site → use a declared
  fill (`bg-cyan-dim`, `bg-cyan`), never a hand-mixed `bg-cyan/15`: the `-dim` fills are
  tuned to sit *at* the Floor, so nothing deeper clears it and a hover state must move
  the border, ring or text. A new text-on-fill convention extends `COMPOSITE_PAIRINGS`
  (a token, optionally with an alpha); a fill that carries no text goes in `GRAPHIC_FILLS`
  with a written reason. The guard in `apps/web/lib/accent-tint-policy.ts` sweeps every
  component, also checks that every colour a `bg-`/`border-`/`ring-`/`text-` utility names
  is one the Skins declare, and fails closed. Translucent chrome (`bg-surface/95`,
  `bg-black/60`) is classified harness-only, not measured (ADR-0086).

- Fading text at a call site (`text-cyan/80`, or an `opacity-*` on the same element)
  → don't, unless the *rendered* result still clears 4.6:1 on the worst surface in
  every Skin and Mode. ADR-0081 guarantees the token, not what you render from it.
  The guard in `apps/web/lib/faded-text-policy.ts` sweeps every component and fails
  closed on unknown colour tokens; `disabled:` fades are exempt by rule, and the
  exemption registry is otherwise empty (ADR-0083).

- New chart, or a new series on one → render `ChartValues` from the **same rows** you hand
  the plot, and put the date/value formatting in the `lib/` view-model (`dateText`,
  `valueText`), never in the component. Every plotted datum must be retrievable as text, with
  its year and unit, and the `<caption>` says what an absent row means. The guard in
  `apps/web/lib/chart-values-policy.ts` sweeps every component, keys on classified `recharts`
  imports and fails closed on unknown ones; an entry in `CHART_VALUES_EXEMPTIONS` needs a
  written reason. It proves the table is rendered, not that it matches — `audit/charts.mjs`
  asserts per-point parity (ADR-0084).

- New `<fieldset>`, or an arbitrary grid track → give the fieldset `min-w-0` and spell the
  track `minmax(0,1fr)`, never a bare `1fr`. Both are boxes CSS floors at their content's
  minimum width, which is how one `nowrap` name widened the whole document to 789px at 320px.
  The guard in `apps/web/lib/reflow-policy.ts` sweeps every component; its registry is empty.
  It proves those boxes are declared, **not** that a page fits — `audit/reflow.mjs` renders
  every journey at 320px and asserts that. An authored name wraps and is never truncated; a
  header or action cluster wraps rather than overflowing (ADR-0085).

- New row of form fields → build it as a `FieldRow` (`components/pulse/field-row.tsx`) with a
  width ask per field (`FIELD_CELL` / `FIELD_WIDTH`, 5rem; the `WIDE_*` pair, 7rem), never a
  `grid-cols-[7rem_1fr]`. A `rem` track keeps its size while the viewport keeps its pixels, so
  at 200% text it is a column wider than a 320px screen; a wrapping row stacks instead, and a
  `sm:` variant is no remedy because Tailwind's breakpoints are `rem` too. A genuinely tabular
  grid whose columns align across rows keeps its grid and spells the track `minmax(0,2.5rem)`.
  The same guard flags every bare-length track and fails closed; `audit/reflow.mjs` now gates
  100% *and* 200% text, with no ratchet (ADR-0087).

- New desktop layout, or widening a page → the shell has two widths: `--spacing-shell` (26rem)
  and `--spacing-shell-wide` (72rem), switched at `lg:` by CSS alone — never by UA detection,
  and never below `lg:`, where the mobile layout is frozen. The frame is app-wide; a page's
  content column stays 26rem until it opts in by stamping `data-shell="wide"` on its own root,
  which `:has()` in `app/layout.tsx` answers to. Write the desktop layout in `lg:grid-cols-N`
  and flex only — **never** bracket track syntax, because `reflow-policy.ts` flattens variants
  by design and a `lg:grid-cols-[1fr_20rem]` is a rigid track it will (correctly) refuse.
  Primary navigation renders from `lib/sidebar-nav.ts` over the `tab-nav` registry, never a
  hand-written link list. `audit/wide.mjs` gates the frame at 1440px (ADR-0088).

- Converting a page to the wide column → stamp `data-shell="wide"` on its root, put the grid in
  a component the audit harness can mount (see `pulse/home-columns.tsx`) rather than classes
  inline on the page, and **add the page as a journey to both `audit/wide.mjs` and
  `audit/reflow.mjs`**. A page no journey renders is unverified however many guards are green:
  adding `home` surfaced three pre-existing defects at 320px and 200% text in components it had
  always rendered. Anything the wide layout adds must be a read-time projection, never an
  action — the click budget (ADR-0071) governs actions (ADR-0088).

- New chart call site, or a new charting component → import `recharts` in exactly one module and
  reach it only through its `*-lazy.tsx` `next/dynamic` wrapper — never a static import, on any
  route. Recharts is ~102KB gzipped and a static import puts it in the route's client chunk graph
  whether the chart renders or not, which is how three routes shipped it to visits that drew
  nothing (`/exercises/[id]` paid it on all three tabs). An early `return null` for an empty
  series does not help: the bytes arrive before the branch runs. Declare the boundary once per
  chart so every surface shares it — `volume-chart-wide.tsx` composes `VolumeChartLazy` and keeps
  only its mount gate. The guard in `apps/web/lib/recharts-import-policy.ts` sweeps every
  component and page; `import type` is erased and so exempt, `audit/` is out of scope, and its
  exemption registry is empty. It proves no module statically names a chart, **not** that a route
  is under budget — measure `.next/server/app/<route>/page_client-reference-manifest.js` for that
  (ADR-0090).

- Desktop-only content a phone must not pay for → `hidden lg:block` is enough for **markup**,
  and never enough for **JavaScript**: a hidden subtree still renders and hydrates, so one
  `"use client"` chart behind it put 110KB gzipped of Recharts in the mobile Dashboard bundle.
  A client-side block gets a dynamic import *and* a mount gate (`useWideViewport`, the same
  64rem as `lg:`), not CSS. Measure it offline before claiming a number:
  `.next/server/app/<route>/page_client-reference-manifest.js` lists the route's client chunks.
  An optional read also needs `.catch()` — `apiGet` *rejects* on a transport failure rather
  than returning an unsuccessful envelope, so an uncaught one in a `Promise.all` takes the
  whole page down over a bonus block (ADR-0088).

- New per-second tick, or any `setInterval` in a component → put it in the leaf that renders
  the figure, never in a screen that renders anything else. `useSecondTick` is that tick;
  `ElapsedClock` and `RestCountdown` are what it drives, and they return bare strings so the
  caller keeps the styling and the accessible name. Held in the Live Session shell it
  re-rendered an 830-line component and every set card's inputs sixty times a minute, on a
  phone with the Wake Lock held. A `React.memo` on a heavy list is worth nothing on its own:
  land it together with `useMemo` on the array and `useCallback` on every handler, or a fresh
  identity defeats it on every render and the memo reads as working.
  `lib/live-session-tick.test.ts` holds this for the Live Session; there is no sweep (ADR-0091).
  The catalog taxonomy is the other place that pair is load-bearing — it is the one unpaged
  nested list in the app, so `PatternSection` (its own module, memoized) and the screen's
  `useCallback`'d `openDetail` land together; `lib/catalog-list-memo.test.ts` holds both halves.

- New icon, anywhere → import it from `@/components/pulse/icons`, never from `lucide-react`.
  Icons are design-system surface like everything else in `pulse/`, and reaching past the
  design system for them is what made the icon set a 66-file edit. If the icon is not
  re-exported yet, add a line to `components/pulse/icons.ts` — keep it a *pure re-export*,
  because a wrapper component there would stop the per-icon tree-shaking the measurement
  relies on. The guard in `apps/web/lib/icon-import-policy.ts` sweeps the whole web root —
  `audit/` and `scripts/` included, unlike the chart guards — counts re-exports and
  `import type` too, and fails closed on the package (so a deep import is caught); its
  exemption registry is empty. It proves nothing names the
  package, **not** that the barrel is weightless — measure the per-route client-reference
  manifest for that, as ADR-0092 did (ADR-0092).

- Props-seeded `useState` in a form → only where the prop genuinely cannot change. The admin
  Exercise editor page revalidates its own route whenever any control on it writes, so a
  mount-time snapshot shows stale text and edits from it: the editors overlay the admin's
  *changed* fields on the `exercise` prop (`overlayEditorEdits`, `draft ?? server`) so an
  untouched field follows the server and typing is never discarded. "Changed", not
  "touched" — `applyEditorEdit` drops an edit typed back to the server's own value, or a
  field the admin edited and undid stays pinned against every later refresh, which is the
  same staleness one keystroke at a time.
  `lib/admin-editor-props-refresh.test.ts` holds it. `ExerciseCatalogTaxonomy` is the
  documented exception and says so at the `useState` — it writes the URL with
  `history.replaceState` precisely so the Server Component does not re-run.

- New form control → render it with `components/ui/input.tsx`, `select.tsx` or `textarea.tsx`,
  never a bare `<input>`/`<select>`/`<textarea>`. They declare `autoComplete="off"` (a field a
  browser genuinely has on file names its real token at the call site — today only
  `display_name`) and `Input` *derives* the keypad from `type` + `step`: `decimal` where the
  step admits a fraction, `numeric` otherwise, which is why a decimal field must spell
  `step="any"`/`step="0.1"`. Never force a numeric pad on a text field whose value carries a
  colon, a hyphen or letters — the `mm:ss` durations and the `range`/`qualitative` Loads would
  become untypable on a phone; the typed-Load field keys its pad on the picked kind
  (`loadValueInputMode`) and only where that kind is in state. The guard in
  `apps/web/lib/form-input-policy.ts` sweeps every component and page for native controls, fails
  closed on a computed `type` (both questions — it could be `text` or `number`) and on a
  `{...props}` spread, and its registry is empty.
  It proves the attribute is *declared*, not correct — `lib/form-affordances.test.ts` renders
  the primitives and reads what a browser would get (ADR-0093).

- New section divider → `SectionHeader`, which is a heading (`<h2>`, or `level={3}` inside a
  section another divider opened). It is the app's only ▸ divider and the only outline the pages
  below the `<h1>` have, so a hand-rolled `▸ …` rule is a hole in that outline and a test
  rejects the *rendered* marker anywhere else (read from the AST, so a comment about the rule is
  fine). Anything else that opens a group is a heading too, whatever it looks like: Train's
  `TRAIN // …` eyebrows are `<h2>`, and a card inside such a group takes `level={3}`
  (`SessionCard`) so the outline names the group and not only its items. Don't skip a level on
  the way down: a list-item title under no group heading is an `<h2>` (`HistoryBrowser`), not an
  `<h3>`. `lib/section-heading.test.ts` holds the ranks, the accessible name (the `▸` stays
  `aria-hidden`, the meta counter stays a sibling) and the row's classes — the divider's
  appearance is unchanged, which `audit/reflow.mjs` and `audit/wide.mjs` confirm (ADR-0094).

- New `<img>`, anywhere → it must reserve its box before the bytes arrive. A
  `max-h-* w-full object-contain` image is **zero tall** until it decodes, which is how one
  illustration dropped the whole SPECS lens down the page when it landed. For an Exercise
  picture that frame already exists: render `components/pulse/illustration.tsx`, whose box
  (aspect, height cap, matching `width`/`height` ratio hint) lives in `lib/illustration-box.ts`
  so the hint and the aspect cannot drift — `illustration-box.test.ts` holds them to one number.
  It is deliberately `loading="lazy"` only, because both its surfaces are below the fold; an
  above-the-fold image declares its own three attributes instead of bending the frame. The guard
  The `exercise` journey renders it in a browser with the image deliberately unavailable, which
  is how the box is verified rather than argued — that journey also surfaced an authored name
  measuring 1225px inside a 320px screen in the same file, clipped and so invisible to every
  report. The guard
  in `apps/web/lib/image-policy.ts` sweeps every component and page and fails a raw `<img>` that
  declares no `width`, `height` or `loading` (`loading="eager"` passes — it asks for the
  decision, not one answer); a `{...props}` spread declares nothing, and its registry is empty.
  It proves the attributes are *declared*, not that the numbers are right (ADR-0095).

- Rendering an **instant** — a moment on the clock, as opposed to a `yyyy-mm-dd` calendar date
  → `components/pulse/local-instant.tsx`, never `toLocaleString()` in a Server Component, where
  "the reader's locale" is the container's. Parse with `lib/instant.ts`, which reads a missing
  offset as UTC: the API's `created_at` columns are `TIMESTAMP WITHOUT TIME ZONE`, so
  `.isoformat()` emits an offsetless string that ES parses as *local* time — the moment is wrong
  before anything formats it. `LocalInstant` renders a zone-explicit UTC text on the server and
  in the first client paint (byte-identical, so no hydration mismatch) and swaps to the reader's
  locale after mount. The guard in `apps/web/lib/server-locale-policy.ts` fails a non-client
  module that calls `toLocaleDateString`/`toLocaleTimeString`, constructs an `Intl.DateTimeFormat`,
  or calls `toLocaleString` on a `Date`; a number's grouping is deliberately out of scope, and the
  registry is empty. Calendar dates stay with `lib/date-format.ts` (ADR-0096).

- A list over an unpaged set, or a filter driven by a controlled input → keep all three off the
  keystroke: hoist anything the filters don't affect (the admin catalog re-sorted 500 rows with
  `localeCompare` per character, though the order never depended on the query), run the filter
  pass through `useDeferredValue` rather than a debounce (a debounce is for collapsing *requests*;
  deferring delays nothing and merely lets local work be interrupted), and give each row
  `.list-row-defer` so an off-screen row costs nothing. Read the summary copy and any
  clear-filters affordance off the **deferred** value, or the header describes a list that is not
  on screen yet. The deferral itself is not mechanized — `act()` flushes both passes — so
  `lib/admin-catalog-list.test.ts` holds what is observable: the sort runs once per catalog, and
  settling leaves the field, the rows and the count consistent (ADR-0097).

- Confirming something irreversible → mount `components/pulse/confirm-dialog.tsx`, never
  `window.confirm`. The decisive fault is not the Skin: after one dialog a browser offers
  "prevent additional dialogs", and every later `confirm` then returns without asking — the
  guard becomes a standing yes or no, with nothing on screen saying which. Write the copy as
  the dialog's two slots — a question, then what accepting costs — wherever that copy already
  lives: in the view-model when the control has one (`deleteControlView`'s `confirmTitle` +
  `confirmMessage`), at the call site when it is a fixed string. Where the action is a
  `<form action>`, keep the submit button a submit and only
  `preventDefault` it, so the no-JS post survives, and confirm with `requestSubmit()` rather
  than a hand-built payload. The guard in `apps/web/lib/native-dialog-policy.ts` sweeps the
  whole web root — `lib/` hooks included, the obvious next place to write one — for
  `alert`/`confirm`/`prompt`, bare or via `window`, reads them from the AST so a comment about
  the rule is fine, and has no exemption registry. It cannot see whether a confirmation is
  asked at all; `lib/destructive-confirm.test.ts` mounts the three controls for that. A dialog
  renders only while it is open, so a new one that is not in the `confirm` audit journey is
  unmeasured at 320px, 200% text and 1440px however green the static guards are (ADR-0098).

- New interactive surface → it is a native control (`a`, `button`, `summary`, `input`,
  `select`, `textarea`) or a `[role="button"]`, because that is the selector list in
  `globals.css` that gives tap targets `touch-action: manipulation` — without it every tap
  carries the ~300ms double-tap-zoom delay. A widget role on anything else (`role="switch"` on
  a `<div>`) must extend that base rule. A control needing a custom gesture spells `touch-none`
  as a utility at the call site, where it outranks the base layer — which is why the @dnd-kit
  handles are unaffected. The guard in `apps/web/lib/tap-target-policy.ts` reads the selector
  list out of the stylesheet, resolves a conditional role through every branch, fails closed on
  a role it cannot read and on one written on an unknown component tag, and treats "no rule
  declares it" as a finding rather than a clean sweep. What it keys on is a **declared role**:
  a tappable element that declares none at all (`<div onClick>`, which this app has none of)
  is invisible to it (ADR-0099).

- A client-side filter over an already-fetched list → mirror it into the URL, so the narrowed
  view is shareable and survives a refresh. Put `parse*Filters` / `*FiltersToQuery` in the
  `lib/` view-model, seed component state from `useSearchParams` **once**, write back with
  `replaceFilterQuery` (`lib/filter-url.ts` — a `replaceState`, never a router push, which
  would re-run the Server Component and re-fetch on every keystroke), and wrap the component
  in `Suspense` on its page. Parsing is where an untrusted value dies: a facet outside the
  closed vocabulary collapses to "no filter", or the control reads "All" above an empty list —
  and the membership test is `Object.hasOwn`, since `in` against an object literal accepts
  `constructor`. `HistoryBrowser`, `SessionsLibrary`, `ExerciseCatalogTaxonomy` and
  `AdminExerciseBrowser` are the four that do this; where a deferred pass exists (ADR-0097)
  the URL follows the *live* filters, since it is not a rendered surface (ADR-0100).

- New heading set in the display face → give it `text-balance` (or `text-pretty`), so the title
  decides its own wrap instead of leaving a widow wherever the line box ran out. The guard in
  `apps/web/lib/display-heading-policy.ts` sweeps every component and page for an `<h1>`–`<h6>`
  whose classes name `font-display` and no wrap decision, reads them through `cn()`, conditionals
  and templates, and **fails closed** on a className it cannot read. Exempt by rule: a heading
  that cannot wrap (`truncate`, `line-clamp-1`) — a `line-clamp-2` still wraps, so it still
  balances. It cannot see a capitalized tag (`SessionCard`'s `<Title>`), and balancing changes no
  minimum content width, so ADR-0085's `min-w-0 break-words` pairing is still what keeps an
  authored name inside the viewport (ADR-0101).

- New authored string, anywhere → the apostrophe is `’`, not `'`. The guard in
  `apps/web/lib/copy-typography-policy.ts` sweeps components, pages **and** `lib/` view-models
  (copy lives there by design — ADR-0098 put a dialog's two slots in `deleteControlView`) for a
  straight apostrophe between letters, read from the AST so a comment about the rule is fine.
  **Every** string, not only the rendered ones: a failure message, a registry `reason:` and a
  placeholder are one node kind, so telling them apart would be guessing. Its registry holds the
  two `lib/session-section.ts` keywords matched against *authored* Exercise names, each entry
  naming the one word in the one file; the guard's own module is the one file the sweep skips,
  because a registry must be able to spell what it exempts. The ellipsis half is **not**
  mechanized: a placeholder that reads as an instruction or a phrase ends in `…`, one showing a
  value or a single token (`mm:ss`, `3-1-1`, `e.g. 2`, `dumbbells, pull-up bar`) does not — a
  judgement per field. A placeholder restating its own `hint` is deleted, not punctuated
  (ADR-0101).

- New Skin, or a re-tuned `--color-base` → update `SKIN_BASE_COLORS` in
  `apps/web/lib/theme-color.ts` in the same change. The browser chrome is the rendered Theme's own
  page colour: `app/layout.tsx` resolves it per request in `generateViewport()` from the same
  React-`cache`d Active Skin and Mode the `<html>` attributes come from, and System Mode emits both
  `prefers-color-scheme` branches because that is the one Mode whose polarity the server does not
  know. The registry restates the stylesheet, so `theme-color.test.ts` parses `globals.css` with
  `parseColorBlocks` and holds the twelve values — plus each Skin's System-light copy — to one
  number, and fails on a catalog Skin with no page colour rather than falling back (ADR-0102).

- New form control → nothing takes focus on arrival (`apps/web/lib/autofocus-policy.ts` sweeps for
  `autoFocus` anywhere, conditional included, registry empty) and a field whose value is not a word
  says so. `type="search"` gets `spellCheck={false}` from the `Input` primitive; a value field — a
  tempo, a duration, a Load, an authored *name* — declares it at the call site; a set note or a
  movement cue is prose and keeps the browser's checker. The guard in
  `apps/web/lib/spellcheck-policy.ts` keys on a **placeholder showing a value pattern** (digits,
  separators, the `hh`/`mm`/`ss` mask), accepts either answer, and fails closed on a computed
  placeholder. A placeholder made of words, or none at all, is outside it (ADR-0103).

- New focusable surface that is not a DOM control → its focus indicator is **drawn**, never a tint
  on something already tinted. The Reference Atlas figure's regions are SVG `<g>`s, where an
  `outline` traces the bounding box and not the muscle, so each renders a stroke-only copy of its
  own paths (`.atlas-region-ring`, `fill: none`, `pointer-events: none`,
  `vector-effect: non-scaling-stroke`) that `globals.css` paints `var(--color-cyan)` at 2px under
  `.atlas-region:focus-visible`. Not a stroke on the overlay path: that one's stroke is an inline
  style, which no stylesheet rule can override. `lib/atlas-focus-ring.test.ts` holds the markup by
  rendering it and the rule by reading the stylesheet; there is no sweep (ADR-0104).

- A third component on the way between the state and the control that edits it → that is a
  context, not another prop. The Protocol Builder's rows reached their `dispatch` through three
  intermediaries, which cost **52 callback props** in one file — the same block of 13 re-declared
  in four interfaces, `onEditField` alone written 16 times — and the two middle components
  declared, destructured and forwarded props they never read. The contract is
  `PrescriptionDraftContext`'s `{ state, actions, meta }` (`components/builder/`): `state` is the
  open Session, `actions` is **one** `dispatch` over a vocabulary whose payloads are derived from
  the reducer's own union (`WithoutSessionId<Extract<BuilderEvent, …>>`, so a new field reaches the
  rows with no second edit), and `meta` is the live drag gesture — shared, but neither draft nor
  action. *Membership* in that vocabulary is a judgement, so it is a declared registry — and
  `as const satisfies readonly BuilderEvent["type"][]`, or a renamed event drops silently out of
  the union instead of failing. A row addresses a `position` and cannot name a Session, so
  `toBuilderEvent` in the screen that holds the reducer is the one place an edit is addressed.
  Keep props where each is a leaf's own closure over one position (`PrescriptionControls`, the five
  that survive) or where the component is shared presentation (`PrescriptionFieldStack`, ADR-0067),
  and don't memoize a context value no `React.memo` is reading — that is ADR-0091's failure wearing
  a different hat. A context is not sweepable, so
  `lib/prescription-draft-context.test.ts` mounts the real list and asserts a **member** row's edit
  carries its own position, which is the thing 13 drilled callbacks proved by their shape
  (ADR-0105).

- A field that enters part of a Logged Set — an amount, a Load, an effort, a note → compose it
  from `components/pulse/set-entry.tsx`, never a new copy. That UI was written four times across
  `AdhocLogForm`, `CorrectLogForm` (twice), `LogSessionForm` and `live-session-sets`, eleven field
  blocks between them, and the copies had already drifted: two of the five typed-Load fields asked
  for **no keypad**, one distance field was not a `type="number"` at all, and three of the four
  captioned the kind picker with the word CONTEXT 'Quantity' puts under _Avoid_ — a pre-existing
  terminology-guard violation the guard could not see, because a JSX *text node* is not the quoted
  label its regex matches. Merging the copies put that caption in a string literal and the guard
  failed at once; the caption is "Quantity" and the accessible noun "Quantity kind".
  `SetEntry.Load` is now the one place a Load kind is added (ADR-0010) and `SetEntry.Quantity` the
  one place a Quantity kind's fields are (ADR-0032) — the correctness the duplication endangered,
  since a kind missing from one of five copies degrades a typed value silently in exactly one form.
  The axis that let the copies exist is **controlled vs uncontrolled**, so it is two providers over
  one `{ state, actions, meta }` contract (ADR-0105's shape): `SetEntryProvider` where a holder
  drives the row, `SetEntryFormProvider` where the DOM owns it under a server action. Every branch
  on that mode lives in `useSetEntryField`, which is what lets a field stay blind to which form it
  is in; `setEntryValueBinding` returns **one** key, because `value: undefined` beside a
  `defaultValue` reads as uncontrolled to React and the reverse warns. The vocabulary in
  `lib/set-entry.ts` *is* the wire contract — one word per field serving both the `name=` and the
  values record, so there is no mapping table to drift — and `setEntryValues` keeps the record
  total, because a controlled `value={undefined}` silently discards every keystroke. A row maps to
  it through a **declared table**, never a pair of hand-written mappers (`SetEntryRowMap` for a form
  holding a row object, `seededSetEntryValues` for one holding only a pre-fill reader): two mappers
  drift, and a field present in one direction but not the other discards that field in silence. The
  seeded provider takes its one honourable edit **by name** (`onKindChange`, since the pick decides
  which fields exist) and throws on any other, for the same reason. A caller states its width ask
  per shape (`durationClassName`, `rowClassName`) rather than re-branching on the kind, which would
  be back to four copies of the branch — and no part carries a `className` knob no call site passes.
  There is deliberately **no** new sweep: a guard cannot see whether copies *agree*, which is why
  they had drifted — `lib/set-entry.test.ts` and `lib/set-entry-fields.test.ts` hold it instead,
  every rendered claim made against **both** providers, including the one the family cannot keep
  alone (a seeded row's keypad follows the *picked* kind only because `CorrectLogForm`
  re-serializes its form on every change, so that is asserted against the real form). `adhoc` is
  now a journey in `audit/reflow.mjs` and `audit/wide.mjs`: it was renderable and swept by neither,
  so that form was unverified at every width (ADR-0106).

- A control inside a `Field`, or a new `Field` → the field *publishes* its id, its hint/error ids and
  its invalid state, and the control **claims** them. Rendering one of the three form primitives
  (ADR-0093) *is* the claim, so an ordinary call site writes nothing; a control that is not one of
  them — today only `AdminExerciseImage`'s file picker — spreads `useFieldControl()` from a component
  of its own, since the hook reads the field and must run below the provider. Position is irrelevant
  by design: this used to be `Children.toArray(children)[0]` plus a `cloneElement`, so wrapping the
  control in a div, rendering anything before it, or reordering silently unlabelled the field, and
  nothing reported it. The id is named **once**, as `htmlFor` on the field — never again on the
  control, where the field's `<label for>` would no longer point at it. The guard in
  `apps/web/lib/field-control-policy.ts` sweeps every component and page for a field with no
  claimant or two of them, traces a claim into a component declared in the same file, fails closed on
  one from another file, and its registry is empty. It proves a
  claimant is *present*, not that the wiring is right — `lib/form-accessibility.test.ts` renders the
  three shapes that used to break for that. A grouped `FieldLabel` is a `<fieldset>`/`<legend>` with
  no single id, so it is outside all of this (ADR-0107).

- A caption over *several* controls → `FieldGroup`, not `FieldLabel`: a `<fieldset>`/`<legend>` naming
  the group, each control carrying its own accessible name, and no field wiring to claim. These were
  one component and a `group` flag, which is two disjoint renderings — different element, different
  a11y contract, no shared markup — behind one name; the flag was also something the field-control
  guard had to evaluate from source and fail closed on when it could not, a problem class now gone by
  construction. `FieldGroup` provides no context, so a control nested in one inside a `Field` still
  claims **that** field's id and the guard counts it (ADR-0108).

- An optional card, link or block one caller offers and another does not → a `children` slot the
  caller composes, never a `show*` boolean. Two flags describe four states and a third makes eight,
  while the corners nobody renders exist only in the type: `GenerateTrainingLaunchpad`'s `showBuild`
  and `showLogPastWorkout` are `<BuildWorkoutLink />` and `<LogPastWorkoutLink />` written at the one
  call site that offers them. A flag toggling a detail *inside* a component's own rendering
  (`showBodyWeight`, `showValues`, `showOverflowCount`) is a different thing and stays. The shared
  chip is named once (`LAUNCH_LINK`), since four call sites of the same `buttonVariants` arguments
  are where one link starts to disagree with its neighbours. There is no sweep:
  `lib/generate-training-launchpad.test.ts` renders both compositions and reads the props interface
  through the AST, because a flag added and not yet passed renders as nothing (ADR-0109).

- New animation or transform transition → pair it with `motion-reduce:animate-none`
  or `motion-reduce:transition-none` **in the same class string**. Colour and
  opacity transitions move nothing and are exempt by rule. The guard in
  `apps/web/lib/motion-policy.ts` sweeps every component and fails closed; an
  entry in its `MOTION_EXEMPTIONS` registry needs a written reason (ADR-0082).
