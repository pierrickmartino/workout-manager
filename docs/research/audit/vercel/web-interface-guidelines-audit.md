# Web Interface Guidelines — Audit

Ruleset: [vercel-labs/web-interface-guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) (fetched 2026-09-30).
Scope: `apps/web` — `app/`, `components/`, `lib/`, `globals.css`. Test files and `audit/` harness excluded.

## Summary

The app clears most of the ruleset outright. Focus states, live regions, modal focus
management, safe-area insets, `color-scheme` per Skin×Mode, `overscroll-contain` in every
drawer, `prefers-reduced-motion` pairing, skip link, and loading-copy ellipses are all
handled — several of them mechanized as guards under `lib/*-policy.ts` (ADR-0081..0088).
No instance of `transition: all`, `user-scalable=no`, `onPaste` + `preventDefault`,
`<div onClick>`, or an `outline-none` without a `focus-visible` replacement.

The findings below are real gaps, grouped by how much they cost.

> **Status (2026-10-01).** The three HIGH findings (#1, #2, #3) are fixed; each carries a
> `**Resolution:**` note saying what landed and what deliberately did not. The conventions they
> set are ADR-0093 (a control's autofill and keypad come from the primitive) and ADR-0094 (a
> section divider is a heading). One part of #2 is closed as *won't fix* with a reason — the
> `mm:ss` fields — and is called out in its note. #4–#15 are untouched.

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | 122 form controls, zero `autocomplete` | HIGH | Fixed — ADR-0093 |
| 2 | Numeric inputs have no `inputmode` | HIGH | Fixed — ADR-0093, except `mm:ss` (see note) |
| 3 | `SectionHeader` is not a heading — 29 files, no `<h2>` outline | HIGH | Fixed — ADR-0094 |
| 4 | `<img>` without `width`/`height` (CLS) and without `loading` | MEDIUM | Open |
| 5 | Admin audit-log timestamp renders in *server* locale/timezone | MEDIUM | Open |
| 6 | `limit=500` admin catalog, unvirtualized, filtered per keystroke | MEDIUM | Open |
| 7 | Admin browser filter state not in URL | MEDIUM | Open |
| 8 | `window.confirm` in 3 places while `ConfirmDialog` exists | MEDIUM | Open |
| 9 | No `touch-action: manipulation` anywhere | LOW | Open |
| 10 | No `text-wrap: balance`/`pretty` on headings | LOW | Open |
| 11 | Placeholders don't end with `…`; two use a straight apostrophe | LOW | Open |
| 12 | `themeColor` hardcoded to one Skin's dark background | LOW | Open |
| 13 | `autoFocus` on a mobile-reachable inline rename field | LOW | Open |
| 14 | No `spellCheck={false}` on code-ish fields | LOW | Open |
| 15 | Interactive SVG `<g>` focus relies on fill tint only | LOW | Open |

---

## Findings

### 1. No `autocomplete` on any form control — HIGH

`grep -c autoComplete` over `app/` + `components/` returns **0**, across **122** `<Input>` /
`<Select>` / `<Textarea>` sites. Browser and password-manager autofill is off everywhere,
including the profile fields that map cleanly onto standard tokens.

Highest-value sites:

```text
components/ProfileForm.tsx:95   display_name    → autoComplete="name"
components/ProfileForm.tsx:113  age             → autoComplete="off"
components/ProfileForm.tsx:126  height_cm       → autoComplete="off"
components/ProfileForm.tsx:138  weight_kg       → autoComplete="off"
components/AdminExerciseBrowser.tsx:83  search  → autoComplete="off"
components/SessionsLibrary.tsx:104      search  → autoComplete="off"
components/HistoryBrowser.tsx:126       search  → autoComplete="off"
components/ExerciseLibrary.tsx:106      search  → autoComplete="off"
```

The guideline also asks for `autocomplete="off"` on non-auth fields specifically to stop
password managers from offering to fill workout numbers. That is the bulk of the 122.

**Fix shape:** default `autoComplete="off"` in `components/ui/input.tsx`,
`select.tsx` and `textarea.tsx` (before `{...props}`, so a call site can still override),
then set the real tokens on the handful of profile fields. One primitive edit covers ~115
of the 122 sites.

**Resolution:** done exactly as the fix shape describes, and recorded as ADR-0093.
`autoComplete="off"` is now a default in all three primitives, so every control that goes
through them declares it and a call site can still override. `display_name` carries
`autoComplete="name"` — it is the only field in the app a browser genuinely has on file. The
profile's age/height/weight keep `off`: no standard token means "body measurement", and the
audit's own table asks for `off` there.

`lib/form-input-policy.ts` guards the bypass rather than the primitive: a hand-rolled native
`<input>`/`<select>`/`<textarea>` that declares no `autoComplete` fails the sweep. It fails
closed on a computed `type` and on a `{...props}` spread, and exempts by rule the types no
browser fills (`hidden`, `checkbox`, `radio`, `file`, the buttons, `range`, `color`) — which
is every raw control in the app but one. That one,
`components/SchemeControl.tsx`'s compact inline `<select>`, states its own `autoComplete="off"`
rather than being reshaped to fit the primitive's chevron gutter. The registry is empty.

What the primitives *render* is asserted separately, by rendering them:
`lib/form-affordances.test.ts` reads the markup a browser would receive, because a guard over
source could not tell a declared attribute from a correct one.

### 2. Numeric inputs have no `inputmode` — HIGH

`inputMode` appears once in the entire app. Every `type="number"` below opens the full
alphanumeric keyboard on iOS instead of the numeric pad — on a PWA whose whole point is
logging sets mid-workout on a phone.

```text
components/live-session-sets.tsx:271          reps        → inputMode="numeric"
components/LogSessionForm.tsx:419             reps        → inputMode="numeric"
components/LogSessionForm.tsx:481             load        → inputMode="decimal"
components/AdhocLogForm.tsx:339               reps        → inputMode="numeric"
components/AdhocLogForm.tsx:364               load        → inputMode="decimal"
components/CorrectLogForm.tsx:160,372,584,635             → numeric / decimal
components/HandAuthoredSessionForm.tsx:810,992,1027,1049  → numeric / decimal
components/prescription/PrescriptionFieldStack.tsx:303,393 → numeric / decimal
components/builder/prescription-rows.tsx:692              → numeric
components/ProfileForm.tsx:113,126,138,168                 → numeric / decimal
components/GenerateProtocolForm.tsx:93,100,105             → numeric
components/GenerateSessionForm.tsx:56                      → numeric
components/ProtocolBuilder.tsx:524                         → numeric
components/RecordMetricForm.tsx:42                         → decimal
components/AdminExerciseEditor.tsx:175                     → numeric
```

Use `decimal` wherever `step="0.1"` / `step="any"` is set (load, weight, height), `numeric`
for integer counts (reps, sets, seconds, weeks, level).

The `mm:ss` duration fields are `type="text"` and want `inputMode="numeric"` too:
`components/CorrectLogForm.tsx:392,411,449,466`, `components/HandAuthoredSessionForm.tsx:1005,1017`.

**Resolution:** done for every `type="number"` field, derived rather than declared, and
recorded as ADR-0093. All 27 of them already route through `<Input>`, so `lib/input-mode.ts`
reads the rule this item states — `decimal` where the `step` admits a fraction, `numeric`
otherwise — and the primitive applies it. The derivation lands on this item's hand-written
answer at every one of the 27 sites, because a field that takes decimals in this app always
says so with `step="any"` or `step="0.1"`. `lib/form-input-policy.ts` fails a native
`type="number"` that declares no `inputMode`, so a control that skips the primitive is caught.

**The `mm:ss` fields are deliberately left alone.** A numeric pad carries no colon, so
`inputMode="numeric"` would make `1:30` untypable on iOS against a placeholder that reads
`mm:ss`. `lib/quantity.ts` does accept bare seconds, so the field would still *work* — which
is what makes it the wrong fix: it narrows what a user can enter in order to repair a
keyboard. If this is pursued, it needs a real answer (two `mm` / `ss` fields, or dropping the
colon from the format), not an `inputmode`.

The typed-Load value field is a case this item's table reads as "load → decimal" but which is
subtler: one `type="text"` input serves all five Load kinds (ADR-0010), and a decimal pad has
neither the hyphen a `range` needs nor the letters a `qualitative` Load needs. So
`loadValueInputMode` in `lib/load.ts` keys the pad on the picked kind, applied at the five
sites that hold that kind in state (`LogSessionForm`, `AdhocLogForm`, `live-session-sets`,
`HandAuthoredSessionForm`, `PrescriptionFieldStack`). `CorrectLogForm`'s two kind pickers are
uncontrolled; their *initial* kind is readable at render, so a pad was available there and was
rejected — it would survive a switch to `qualitative` and leave the user on a keyboard with no
letters, which is worse than an unhelpful one. Fixing it properly means putting the kind in
state, in a form whose draft recovery depends on those `defaultValue`s; not worth it for a
keypad.

`spellCheck={false}` (#14) is a separate item and was not part of this pass.

### 3. `SectionHeader` renders no heading element — HIGH

```text
components/pulse/section-header.tsx:23 - section divider is <div><span> — not <h2>
```

`SectionHeader` is the app's primary section divider ("▸ WEEK CYCLE ————— 04/05") and is
used in **29 files**. It emits a `<div>` wrapping a `<span>`. App-wide there are 3 `<h1>`
and 10 `<h2>`, so Dashboard, Analytics, Profile, Sessions, Exercises and History each
expose exactly one heading — the `PageHeader` `<h1>` — and no outline below it. Screen-reader
heading navigation (the primary way non-visual users skim a page) lands nowhere.

**Fix shape:** give `SectionHeader` an `as`/`level` prop defaulting to `h2`, render the
label inside it, keep the rule and meta as siblings. Purely additive — the visual output
is unchanged if the heading carries the existing `label-mono` classes.

Related level skips, worth fixing in the same pass:

```text
components/ui/card.tsx:34      - CardTitle is <h3> under an <h1>, no <h2> between
components/SessionCard.tsx:52  - <h3> under an <h1>, no <h2> between
```

**Resolution:** done as described, and recorded as ADR-0094. The label is an `<h2>` by
default, carrying the classes the `<span>` carried; the marker stays `aria-hidden` and the
meta counter stays a sibling, so the accessible name is the section's name alone. A `level`
prop (2 or 3) is there for a divider nested inside a section another divider opened; every
current call site is top-level, so every one renders an `<h2>`.

The visual claim was checked, not asserted: `audit/reflow.mjs` (0 of 660 cases overflow at
320px, at 100% *and* 200% text) and `audit/wide.mjs` (0 of 660 at 1440px) both still pass, and
`lib/section-heading.test.ts` pins the row's classes, the rule element and the accessible
name.

Of the two related skips: `SessionCard` is now an `<h2>`, matching `HistoryBrowser.tsx:259` for
the same list-item role — neither list that renders the card sits under a divider, so the
`<h3>` really did skip a level from the page's `<h1>`. `CardTitle` has **no call site anywhere
in the app**, so it skips nothing on any rendered page and is left as it is. Measured over all
11 journeys the audit harness mounts: **0 level skips**, down from 1.

One finding beyond this item's text, surfaced by making the cards headings: Train labels its
groups with a `TRAIN // …` eyebrow rather than the ▸ rule, and those were plain `<span>`s. Three
of them are `<h2>` now (`RecentSessions`, My Library, Explore), and `SessionCard` takes a `level`
so the cards in that panel are `<h3>` under their panel's heading — otherwise the outline would
have named the sessions and not the group holding them.

The guard is narrow on purpose — a page's outline is a property of what it renders, which only
a browser can judge. What is mechanized is the thing that would rot: no component outside
`section-header.tsx` may *render* the `▸` marker (read from JSX text and string literals through
the AST, so a comment about the rule is not a breach of it), so a second hand-rolled divider
cannot reappear beside the real one. The eyebrow form has no guard: `label-mono text-[11px]` is
also how stat labels and chart ticks are styled, so there is no signature to key on.

### 4. `<img>` without dimensions or loading hint — MEDIUM

```text
components/exercise/specs-panel.tsx:110  - no width/height (CLS); below fold, no loading="lazy"
components/AdminExerciseImage.tsx:207    - no width/height (CLS); no loading="lazy"
```

Both are `max-h-* w-full object-contain`, so the box collapses to zero until the bytes
land and the content below jumps. Both are remote/proxied and of unknown intrinsic size.
Give the wrapping `<Card>` an `aspect-[4/3]` (or whatever the catalog standardizes on) and
put `width`/`height` on the `<img>` as the ratio hint, plus `loading="lazy"` — the exercise
illustration sits well below the fold on the detail page.

### 5. Admin audit timestamp uses the server's locale and timezone — MEDIUM

```text
app/admin/exercises/[id]/page.tsx:106 - new Date(...).toLocaleString() in a Server Component
```

No `"use client"` in this file, so `toLocaleString()` with no arguments resolves against the
*server's* `Intl` defaults — container locale, container timezone, typically `en-US` / UTC.
Admins read audit entries stamped in someone else's clock. Every other date in the app is
either parsed from ISO parts (`lib/date-format.ts`, `lib/chart-date-label.ts` — both
deliberately timezone-safe) or formatted client-side; this is the one that escaped.

Render it in a small client component, or pass the raw ISO string through and format it
under a mount guard. `components/SyncStatusBanner.tsx:199` and
`components/pulse/resume-session-banner.tsx:25` do this correctly already — both are
`"use client"` and render only after a `useEffect`, so the reader's locale wins and there is
no hydration mismatch.

Separately, the codebase uses **no** `Intl.*` constructor anywhere. The `toLocaleString()`
calls in `components/pulse/level-badge.tsx:34,42,43,46` are acceptable, but an
`Intl.NumberFormat` memoized once would be cheaper than re-resolving the formatter on every
XP render.

### 6. 500-row catalog rendered unvirtualized and refiltered per keystroke — MEDIUM

```text
lib/admin-exercises.ts:26              - apiGet("/api/admin/exercises?limit=500")
components/AdminExerciseBrowser.tsx:150 - views.map(...) over up to 500 rows, no virtualization
components/AdminExerciseBrowser.tsx:83  - controlled search input refilters 500 rows per keystroke
```

Over the >50-item threshold by 10×, with a controlled input driving the filter and no
debounce. `components/ExerciseLibrary.tsx:59` shows the pattern the app already knows —
`SEARCH_DEBOUNCE_MS` plus a superseded-request guard. Either reuse that debounce here, or
add `content-visibility: auto` with a `contain-intrinsic-size` on the row wrapper, which is
a one-class change and needs no new dependency.

### 7. Admin browser filter state is not deep-linkable — MEDIUM

```text
components/AdminExerciseBrowser.tsx:69 - setFilters in useState; query/provenance/completeness/status never reach the URL
```

An admin cannot share or bookmark "all AI-provenance movements with incomplete metadata",
and a refresh drops the filter. `components/SessionsLibrary.tsx:40` and
`components/HistoryBrowser.tsx:49` both read `useSearchParams` and are the in-repo
precedent to copy.

### 8. Native `window.confirm` for destructive actions — MEDIUM

```text
components/DeleteLogControl.tsx:33       - window.confirm
components/AdminExerciseDelete.tsx:33    - window.confirm
components/GenerateProtocolForm.tsx:43   - window.confirm (supersede warning)
```

`components/pulse/confirm-dialog.tsx` exists, is themed, traps focus, restores focus to the
opener, handles Escape and sets `inert` on the background. These three bypass it for a
browser-chrome dialog that ignores the Skin and can be suppressed by "prevent additional
dialogs". `components/DeleteSessionControl.tsx` already uses the real dialog.

`components/DeleteLogControl.tsx:33` also carries a straight apostrophe in
`"This can't be undone."` → `can’t`.

### 9. No `touch-action: manipulation` — LOW

Zero occurrences across `app/`, `components/` and `globals.css`. Every button and link
carries the 300ms double-tap-zoom delay on touch. For a PWA logging sets between efforts
that delay is felt on every tap.

**Fix:** one rule in `app/globals.css` under `@layer base`:

```css
button, a, summary, [role="button"], input, select, textarea {
  touch-action: manipulation;
}
```

`-webkit-tap-highlight-color` is likewise never set, so the platform default grey flash
lands on every custom-styled control. Set it intentionally in the same rule.

### 10. No `text-wrap: balance` / `pretty` on headings — LOW

Zero occurrences of `text-balance` or `text-pretty`. Display titles are the widow-prone
ones:

```text
components/pulse/page-header.tsx:35   - <h1>, add text-balance
components/pulse/session-hero.tsx:58  - <h2>, add text-balance
components/pulse/generate-training-launchpad.tsx:41 - <h2>, add text-balance
components/exercise/catalog-detail.tsx:63 - <h2>, add text-balance
```

Note `session-hero.tsx:58` already carries `break-words` for ADR-0085; `text-balance` is
compatible and does not change the minimum content width the reflow guard measures.

### 11. Placeholder copy — LOW

Only 4 of ~40 placeholders end with `…`. Most are example patterns (`mm:ss`, `70`, `3-1-1`,
`0:45`), which the guideline permits as "show example pattern" — leave those. The prose
ones should get the ellipsis:

```text
components/AdminExerciseBrowser.tsx:86   "Search by name…"        ✓ already correct
components/SessionsLibrary.tsx:105       "Search by name or type" → "…"
components/HandAuthoredSessionForm.tsx:128 "Any exercise"         → "Any exercise…"
components/GenerateSessionForm.tsx:207   "no running, no jumping in the apartment" → "…"
components/GenerateProtocolForm.tsx:84   "e.g. gain muscle mass"  → "…"
```

Two placeholders use a straight apostrophe:

```text
components/ProfileForm.tsx:170     "each exercise's prescribed rest" → exercise’s
components/AdminExerciseRelationships.tsx:83 title="This movement's variations & alternatives" → movement’s
```

`components/ProfileForm.tsx:170` is also redundant — the `hint` on line 167 says the same
sentence, correctly punctuated. Drop the placeholder and keep the hint.

### 12. `themeColor` is a single hardcoded hex — LOW

```text
app/layout.tsx:127 - themeColor: "#09090b"
```

The app ships 6 Skins × 3 Modes. In any light Mode, and in any Skin whose base is not
`#09090b`, the browser chrome and the iOS standalone status bar disagree with the page
background. Next's `Viewport.themeColor` accepts an array with `media` conditions:

```ts
themeColor: [
  { media: "(prefers-color-scheme: dark)",  color: "#09090b" },
  { media: "(prefers-color-scheme: light)", color: "<light base>" },
],
```

That covers Mode. Covering Skin too means emitting the tag from the resolved theme in the
layout body rather than from static metadata — worth it only if Skin switching is common.

### 13. `autoFocus` on an inline rename field — LOW

```text
components/RenameSessionControl.tsx:77 - autoFocus
```

The guideline restricts `autoFocus` to desktop, single primary input. This is a mobile-first
PWA and the field sits inside an `OverflowMenu` disclosure, so on a phone the keyboard
springs up and scrolls the panel out from under the user's thumb the moment they open
"More actions". The control is already the first focusable element in the revealed panel —
a focus call gated on a pointer/viewport check, or nothing at all, is safer.

### 14. No `spellCheck={false}` — LOW

Zero occurrences. Red squiggles under tempo codes, equipment slugs and duration strings:

```text
components/HandAuthoredSessionForm.tsx:1005,1017  mm:ss / 0:45
components/CorrectLogForm.tsx:392,411,449,466     mm:ss
components/prescription/PrescriptionFieldStack.tsx tempo "3-1-1"
components/ProfileForm.tsx:156                    "dumbbells, pull-up bar"
```

Search inputs too — `spellCheck={false}` on the `type="search"` fields at
`SessionsLibrary.tsx:104`, `HistoryBrowser.tsx:126`, `AdminExerciseBrowser.tsx:83`.

### 15. Interactive SVG group focus relies on fill tint — LOW

```text
components/analytics/reference-atlas-figure.tsx:145 - outline-none on <g role="button" tabIndex={0}>, no focus-visible ring
```

The `onFocus` handler sets `active`, which changes the muscle group's overlay fill — so
there *is* feedback, but it is a colour shift on an already-tinted shape rather than a
focus indicator, and it is the only signal a keyboard user gets while traversing ~20
selectable regions. Every other interactive surface in the app uses
`focus-visible:ring-2 focus-visible:ring-cyan`. An SVG equivalent (a `stroke` +
`stroke-width` under `:focus-visible`, which does not disturb the `fill-box` geometry) would
match.

---

## Verified clean

Checked and found compliant, so they don't need re-auditing:

- **Focus** — `focus-visible:` rings on every primitive (`button.tsx:10`, `input.tsx:14`,
  `select.tsx:22`, `textarea.tsx:12`); no bare `outline-none`; skip link is the first
  focusable element (`app/layout.tsx:173`) and `<main tabIndex={-1}>` is a real target.
- **Modals** — `lib/use-modal-focus.ts` traps Tab both directions, contains stray
  `focusin`, handles Escape, sets `inert` on every ancestor sibling, locks body scroll and
  restores focus to the opener. `overscroll-contain` on all three overlays.
- **Live regions** — `role="alert"` on ~15 inline error surfaces, `aria-live="polite"` on
  sync/generation status, and `lib/form-accessibility.test.ts` already asserts that failed
  profile submits announce *and* focus the first bad field.
- **Labels** — `components/pulse/field.tsx` generates one `<label htmlFor>` per control and
  merges `aria-describedby` for hint + error without clobbering a caller's own; grouped
  controls use `<fieldset><legend>`.
- **Icons/SVG** — `aria-hidden` on decorative glyphs; `role="img"` + `aria-label` +
  `<title>` where meaningful (`movement-glyph.tsx:128`, `workout-sigil.tsx:60`).
- **Motion** — `motion-reduce:` paired at every call site, enforced by
  `lib/motion-policy.ts`. Animations are `transform`-only.
- **Safe areas** — `env(safe-area-inset-*)` on header, main, tab bar and both drawers.
- **Dark mode** — `color-scheme` mapped for all 6 Skins × 3 Modes (`globals.css:770-845`),
  plus `color-scheme: inherit` on native controls; `<select>` carries explicit
  `bg-surface` + `text-text-primary`.
- **Typography** — loading states all end with `…`; `tabular-nums` on every numeric
  display; curly quotes in user-facing strings (`ExerciseLibrary.tsx:141`).
- **Unsaved changes** — `NavigationGuardProvider` covers both router navigation and
  `beforeunload`, tested.
- **Reflow/contrast/charts** — already mechanized by `lib/reflow-policy.ts`,
  `lib/skin-contrast-matrix.ts`, `lib/accent-tint-policy.ts`, `lib/faded-text-policy.ts`,
  `lib/chart-values-policy.ts` and the `audit/*.mjs` harnesses (ADR-0081..0088).

## Suggested order

1. **One primitive edit each** — `autoComplete` default in `ui/input.tsx` / `select.tsx` /
   `textarea.tsx` (#1), `touch-action` base rule in `globals.css` (#9), `as`/`level` on
   `SectionHeader` (#3). Three files, largest share of the total fix.
2. **Per-call-site sweep** — `inputMode` (#2), `spellCheck` (#14), placeholder copy (#11),
   `text-balance` (#10).
3. **Behavioural** — admin timestamp (#5), `ConfirmDialog` swap (#8), admin filter URL sync
   (#7), catalog debounce (#6), image dimensions (#4).
4. **Judgement calls** — `themeColor` per Mode (#12), `autoFocus` removal (#13), SVG focus
   ring (#15).

Items 1–2 are mechanizable in the style this repo already uses: a `lib/form-input-policy.ts`
sweeping components for a `type="number"` without `inputMode`, or a heading-level policy,
would fit alongside the existing `*-policy.ts` guards and keep these from regressing.
