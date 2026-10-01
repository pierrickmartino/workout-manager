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

> **Status (2026-10-01).** The three HIGH findings (#1, #2, #3), all five MEDIUM ones
> (#4–#8) and the first LOW one (#9) are fixed; each carries a `**Resolution:**` note saying
> what landed and what deliberately did not. The conventions they set are ADR-0093 (a
> control's autofill and keypad come from the primitive), ADR-0094 (a section divider is a
> heading), ADR-0095 (an image reserves its box before its bytes arrive), ADR-0096 (an instant
> is written in the reader's clock), ADR-0097 (the admin catalog is kept off the keystroke
> path), ADR-0098 (a destructive confirmation is the app's own dialog) and ADR-0099 (every tap
> target answers the first tap). One part of #2 is closed as *won't fix* with a reason — the
> `mm:ss` fields — and is called out in its note. #10–#15 are untouched.
>
> The Exercise detail page and the admin screens were in **no** audit journey, so nothing
> #4–#6 touched had ever been rendered at 320px, at 200% text, or at 1440px. Two journeys
> (`exercise`, `admin`) now cover them in `audit/reflow.mjs` and `audit/wide.mjs`: 0 of 780
> cases overflow at each. Adding them surfaced one pre-existing defect, noted under #4.
>
> #8 had the same hole for the same reason: a dialog renders only while it is open, so no
> journey had ever mounted one. A third journey (`confirm`) now covers it in both sweeps,
> which measure **840** cases each: 0 overflow at 320px (100% *and* 200% text) and 0 at
> 1440px, where the dialog's `max-w-sm` box holds at 416px inside the wide frame.

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | 122 form controls, zero `autocomplete` | HIGH | Fixed — ADR-0093 |
| 2 | Numeric inputs have no `inputmode` | HIGH | Fixed — ADR-0093, except `mm:ss` (see note) |
| 3 | `SectionHeader` is not a heading — 29 files, no `<h2>` outline | HIGH | Fixed — ADR-0094 |
| 4 | `<img>` without `width`/`height` (CLS) and without `loading` | MEDIUM | Fixed — ADR-0095 |
| 5 | Admin audit-log timestamp renders in *server* locale/timezone | MEDIUM | Fixed — ADR-0096 |
| 6 | `limit=500` admin catalog, unvirtualized, filtered per keystroke | MEDIUM | Fixed — ADR-0097 |
| 7 | Admin browser filter state not in URL | MEDIUM | Fixed |
| 8 | `window.confirm` in 3 places while `ConfirmDialog` exists | MEDIUM | Fixed — ADR-0098 |
| 9 | No `touch-action: manipulation` anywhere | LOW | Fixed — ADR-0099 |
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

**Resolution:** done as the fix shape describes, and recorded as ADR-0095. The box is now a
property of the layout rather than of the picture, which is the only thing it can be: both
images are proxied or legacy URLs of unknown and unequal intrinsic size.
`lib/illustration-box.ts` holds the whole shape — `aspect-[4/3]`, a `max-h-80` cap, and the
matching `width`/`height` pair — and `components/pulse/illustration.tsx` is the one thing that
reads them. Both call sites render it, so the admin preview now shows the curator exactly what
a reader sees, letterboxing included, instead of a different box at a different cap.

The cap is not cosmetic: the aspect alone would make the illustration 864px tall in the 72rem
wide shell (ADR-0088). Past ~427px of column — in practice only that shell — the cap binds and
the box is 320px tall rather than 4:3, with the picture letterboxing horizontally. That costs no
stability, because both the aspect and the cap are lengths known before the image is; it does
mean the ratio hint describes the **uncapped** box, which is the one a browser lays out from
before the stylesheet applies.

Two things are mechanized, and they answer different questions. `lib/image-policy.ts` sweeps
every component and page and fails a raw `<img>` that declares no `width`, `height` or
`loading` (`{...props}` declares nothing; `loading="eager"` passes — the guard asks for the
decision, not for one answer); its registry is empty. `Illustration` itself only ever says
`lazy` — both its surfaces are below the fold — and an above-the-fold image declares its own
three attributes rather than bending the frame, which is precisely what the guard accepts.

That the ratio hint and the reserved *aspect* describe the same shape is a different question,
and `illustration-box.test.ts` answers it by comparing the two declarations, with
`aspectClassRatio` returning `null` rather than a guessed `1` so an unreadable class fails the
comparison instead of passing it vacuously.

`decoding` is deliberately outside the guard — it changes when a loaded image paints, never the
space it occupies — though the component sets `decoding="async"` anyway.

**Measured.** The Exercise detail page is now an audit journey (`exercise`), with its fixture
pointing at an app route the isolated audit server does not serve, so the image never arrives —
the case worth measuring. With `naturalWidth === 0` the old `max-h-80 w-full object-contain`
box is **270 × 0** at a 320px viewport and **414 × 0** at 1440px; the reserved box is 270 × 203
and 414 × 311.

Adding the journey also surfaced a defect this change did not cause, in the same file: the
Variations / Alternatives rows render an authored name in a bare `<span>`, and an unbroken
80-character name measured **1225px inside a 320px screen** — invisible to every report because
the `Card` clips it, and a silent failure of ADR-0085's first clause. Fixed with the
`min-w-0 break-words` pairing `session-hero.tsx` already carries, plus `shrink-0` on the
chevron.

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

**Resolution:** done, and recorded as ADR-0096 — and fixing the output exposed a second,
worse fault underneath it. `created_at` is written as UTC but stored in a
`TIMESTAMP WITHOUT TIME ZONE` column, so `.isoformat()` emits an offsetless string, which ES
parses as **local** time. A reader in Paris was not seeing a UTC moment in US format; they were
seeing a moment shifted two hours, correctly formatted. So `lib/instant.ts` owns the reading as
well as the writing: a missing offset is read as UTC (silence, not an override), a stated one is
kept, and anything that is not an instant returns `null` rather than `NaN` or the epoch.

`components/pulse/local-instant.tsx` renders the zone-explicit text (`2026-09-30 14:03 UTC`,
built from the UTC getters so it is byte-identical everywhere) on the server and in the first
client paint, then swaps to the reader's locale after mount. The first render is not a
placeholder — it is a correct reading that names its clock, so it is right with JavaScript off
and can never be mistaken for the reader's own time. The output is a `<time dateTime>` carrying
the normalized string, so the machine-readable moment is right whichever text is showing.
`local-instant.test.ts` asserts both renders by rendering them.

`lib/server-locale-policy.ts` guards the rule: a module that is not a Client Component may not
call `toLocaleDateString`/`toLocaleTimeString`, construct an `Intl.DateTimeFormat`, or call
`toLocaleString` on a `Date` — written in place or bound to a local first. Its registry is empty.
It is about the **clock**, not locale in general: `level-badge`'s number grouping is left alone,
because a separator resolved in the container is cosmetic where a timestamp resolved there is a
wrong moment, and conflating them would have forced an exemption that made the registry a list
of things the rule does not really mean.

The `Intl.NumberFormat` memoization this item suggests is **not** done. It is a different
change — about allocation per render, not correctness — and it wants a measurement, not a guess.

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

**Resolution:** done, and recorded as ADR-0097 — as three changes, because the keystroke was
paying for three separate things.

The **sort** was the largest and is not mentioned above: `selectAdminExerciseRows` sorted 500
rows with `localeCompare` on every pass, though the order never depends on the filters. The
component now memoizes `sortAdminExercises(rows)` on `rows` alone and the per-keystroke pass is
the new `projectAdminExerciseRows`. That is correct only because the filter preserves order and
the sort is stable, so `admin-exercises-view.test.ts` asserts the equivalence directly rather
than leaving it to reasoning.

The **filter** goes through `useDeferredValue`, not the `SEARCH_DEBOUNCE_MS` this item points
at: that pattern exists to collapse network requests, and there is no request here — a debounce
would add latency to a local computation to avoid doing it twice, where deferring delays nothing
and merely lets the work be interrupted. The summary line and the Clear-filters affordance read
off the *deferred* filters, so the field, the rows and the count always describe the same settled
pass; a deferred list whose header described the pending one would be a new bug for an old one.

The **rows** carry `.list-row-defer` — the `content-visibility: auto` /
`contain-intrinsic-size: auto 74px` pair this item suggests. Not virtualization: every row stays
in the DOM, in the accessibility tree and findable by find-in-page. The 74px is an estimate read
off the row's own classes, not a measurement, and `auto` replaces it with the browser's real
number the first time a row renders.

`admin-catalog-list.test.ts` mounts the real browser and holds the two component-level
properties: the catalog is sorted once however many characters are typed (counted through a
wrapped view-model), and every row carries the class. The deferral itself is **not** mechanized
and the ADR says so — `act()` flushes the urgent and deferred passes together, so a test can
only see the settled result; what is held is that settling leaves the screen consistent.

None of the three is a measured number. They remove work that provably did not need doing; what
the screen *feels* like at 500 rows is a question for a profile on a real device.

### 7. Admin browser filter state is not deep-linkable — MEDIUM

```text
components/AdminExerciseBrowser.tsx:69 - setFilters in useState; query/provenance/completeness/status never reach the URL
```

An admin cannot share or bookmark "all AI-provenance movements with incomplete metadata",
and a refresh drops the filter. `components/SessionsLibrary.tsx:40` and
`components/HistoryBrowser.tsx:49` both read `useSearchParams` and are the in-repo
precedent to copy.

**Resolution:** done by copying that precedent, which is why it has no ADR of its own — the
pattern is already twice-stated and this is the third screen to follow it. `parseAdminFilters`
and `adminFiltersToQuery` join the pure view-model in `lib/admin-exercises-view.ts`; the
browser seeds its state from `useSearchParams` once and mirrors it back with
`history.replaceState`, never a router navigation. A push would re-run the Server Component
and re-fetch the whole 500-row catalog on every keystroke, which is precisely the cost
ADR-0097 removed a week earlier. The page now wraps the browser in `Suspense`, as History and
My Sessions do, per the App Router's contract for `useSearchParams`.

Two decisions inside it are worth naming. **The URL is written from the live filters, not the
deferred ones.** ADR-0097 reads the summary copy and the Clear-filters affordance off the
deferred pass so the header always describes the list underneath it; the URL is not a rendered
surface, so it can carry what the admin has actually typed without any risk of disagreeing
with the screen. **Parsing is where a bogus facet dies.** The query string is untrusted input,
so a `provenance` or `completeness` value outside the closed vocabulary — and any `status`
that is not `all`/`active`/`retired` — collapses to "no filter on that axis". This is
deliberately stricter than `provenanceLabel`, which renders an unknown token a *row* carries
so a future value still appears: a filter value the dropdown cannot display would show an
empty catalog under a control reading "All provenance", with nothing on screen explaining the
emptiness.

The first draft of that strictness did not have it: the membership test was `token in
vocabulary` against an object literal, so `?provenance=constructor` passed the check written
to stop exactly that, and the test passed because it tried `marketing`. It is `Object.hasOwn`
now, with a case for the prototype keys.

`admin-exercises-view.test.ts` holds the round-trip and the dropping; `admin-catalog-list.test.ts`
holds the two halves a view-model cannot — that the component opens filtered when the URL says
so, and that typing reaches the address bar. "Without a navigation" is held structurally rather
than asserted: that mount's `useRouter` throws, so a screen that reached for the router to write
its URL would not mount.

This item is the one of the three with no ADR of its own at first; it has one now
(**ADR-0100**), because the bullet it put in `CLAUDE.md` is a repo-wide rule and every other
bullet in that list cites a decision record. Writing it also turned up a fourth copy of the
mirror — `ExerciseCatalogTaxonomy` — so the `replaceState` half now lives once, in
`lib/filter-url.ts`, with each screen keeping its own `*FiltersToQuery`.

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

**Resolution:** all three swapped, the apostrophe fixed, and recorded as ADR-0098 — which
restates the reason more sharply than this item does. The decisive fault is not that browser
chrome ignores the Skin but that **the browser owns the answer**: after the first dialog on a
page every browser offers "prevent additional dialogs", and once it is ticked every later
`window.confirm` returns without asking. The guard becomes a standing yes or a standing no
depending on the browser, with nothing on screen to say which and nothing in the code able to
tell. The straight apostrophe is downstream of the same thing — a one-slot plain-text dialog
has no typography.

Each control keeps its own shape. The logged-session delete keeps `type="submit"` and only
`preventDefault`s, so the form still posts with JavaScript off exactly as before, and
confirming calls `requestSubmit()` rather than rebuilding the payload. The admin delete's copy
split into the dialog's two slots (`confirmTitle` beside `confirmMessage` in the pure
`deleteControlView`). The supersede had to hold the submitted values in state while the
question is on screen, because the generate form is uncontrolled and re-reading it on confirm
would depend on it still being mounted.

`lib/native-dialog-policy.ts` sweeps every component and page for `alert`, `confirm` and
`prompt` — bare or via `window`/`globalThis`/`self` — read from the AST so the three
components that now explain why they avoid it do not trip the rule they document. Its registry
is empty, because no destructive question in this app should be answered by a browser. It
cannot see whether a confirmation is asked at all, so `destructive-confirm.test.ts` mounts all
three and holds that opening performs nothing, cancelling performs nothing, and only
confirming acts — with `window.confirm` made to **throw**, so a forgotten call cannot read as
a quiet cancel.

A dialog renders only while it is open, so **no audit journey had ever mounted one** — the
static guards would have passed over three unmeasured surfaces, which is the hole ADR-0088
names. `audit/main.tsx` now has a `confirm` journey carrying the longest of the three copies,
and it is in both `audit/reflow.mjs` and `audit/wide.mjs`.

One correction to this item's text: `components/DeleteSessionControl.tsx` does **not** use the
real dialog. It uses a two-step inline confirm (the `RemoveExerciseButton` idiom), which is a
deliberate different answer for a non-modal row action and was left alone.

Fixing this also exposed a hole in the test harness rather than in the app: `mountDom`
installed JSDOM's `window` and `document` but not its `FormData`, so a component calling
`new FormData(form)` reached Node's own, which rejects an `HTMLFormElement` and throws inside
the event handler — a form action then did nothing and looked exactly like an unwired one.
The harness now installs it with the other globals.

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

**Resolution:** done as the fix shape describes, and recorded as ADR-0099. Two notes on what
the rule does and does not give up. `manipulation` disables double-tap zoom on those elements
and nothing else — panning and pinch-zoom still work, so the page stays zoomable — and because
it is in `@layer base` a utility outranks it, so the @dnd-kit drag handles that already spell
`touch-none` keep `touch-action: none` and their touch drags are unchanged.

The tap highlight is deliberately **not** `transparent`. That is only safe beside an `:active`
state of one's own, and this app styles `:hover` and `:focus-visible` but not `:active` — and
`:hover` is synthesized and often sticky on touch. A transparent highlight would leave a tap
unacknowledged until the next screen paints, which is the opposite of this item's point. It is
set to a soft accent wash built with `color-mix`, so it re-tints per Skin.

`lib/tap-target-policy.ts` guards both halves. `tapActionSelectors` reads the selector list the
stylesheet actually declares, so the test holds it against the native controls rather than
against a copy of the rule's text, and returns `[]` when nothing declares it — a finding, not a
pass. The sweep then looks for an ARIA widget role on an element no selector reaches, which is
how a tap target escapes an element-name rule; a role on a component tag resolves through a
one-entry map (`next/link` renders an `<a>`) and anything else capitalized is reported rather
than guessed at. A computed role is read through every branch of its conditional, nested ones
included — that is how all three of the app's computed roles are written — and anything it
cannot read is reported, not assumed harmless.

Two things it does **not** prove. That a tap feels immediate is a property of a device. And it
keys on a *declared role*, so a tappable element that declares none — a `<div onClick>`, which
this app has none of (see *Verified clean*) — is invisible to it.

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
components/AdminExerciseBrowser.tsx:126  "Search by name…"        ✓ already correct
components/SessionsLibrary.tsx:104       "Search by name or type" → "…"
components/HandAuthoredSessionForm.tsx:128 "Any exercise"         → "Any exercise…"
components/GenerateSessionForm.tsx:207   "no running, no jumping in the apartment" → "…"
components/GenerateProtocolForm.tsx:96   "e.g. gain muscle mass"  → "…"
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
components/HandAuthoredSessionForm.tsx:1006,1018  mm:ss / 0:45
components/CorrectLogForm.tsx:392,411,449,466     mm:ss
components/prescription/PrescriptionFieldStack.tsx tempo "3-1-1"
components/ProfileForm.tsx:156                    "dumbbells, pull-up bar"
```

Search inputs too — `spellCheck={false}` on the `type="search"` fields at
`SessionsLibrary.tsx:103`, `HistoryBrowser.tsx:125`, `AdminExerciseBrowser.tsx:123`.

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
