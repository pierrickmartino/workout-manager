# Layout, scale, large-data and contrast validation

Date: 2026-09-26. Source: [UI/UX audit, follow-up 3](../ui-ux-audit.md).
Scope confirmed through the grilling interview. Base commit:
`8edd5ca4ed62b6a732191778ba0917fc96573485`. Session: Codex; no separate issue supplied.

**Outcome:** isolated runtime checks reproduce layout overflow, cramped numeric
inputs, and contrast failures outside the opaque Text Ramp token guard. No
production UI fixes were made. This is fixture-based evidence, not certification
of the authenticated application or physical devices.

## Evidence and method

[Runner instructions](../../apps/web/audit/README.md),
[case summary](ui-layout-evidence/summary.json), and compressed raw measurements:
[matrix](ui-layout-evidence/results.json.gz),
[drawers and rendered colors](ui-layout-evidence/supplementary.json.gz),
[completed sets](ui-layout-evidence/states.json.gz),
[catalog timing repeat](ui-layout-evidence/catalog-data.json.gz).

732 successful captures across Chromium 153 and Playwright WebKit 26.6, on macOS,
Node 24.19.0. This is an overlapping capture count, not 732 independent journeys.
Earlier fixture/selector failures are retained in the summary and marked recovered
when the equivalent case completed. The two recorded final-matrix runner failures
were a missing fixture instruction array in one drawer case and a large-catalog
role-selector timeout; both were resolved and rechecked. They are not application
findings. Earlier setup runs with incomplete Tailwind source scanning were discarded.

- Production ProfileForm, SessionsLibrary, HistoryBrowser, ExerciseCatalogTaxonomy,
  HandAuthoredSessionForm (Capture/plan-only), LogSessionForm, LiveSessionScreen,
  VolumeChart, DistanceChart, AtlasDrawer and TabBar are mounted with isolated
  synthetic props. Account chrome is a fixture; shell spacing matches RootLayout.
- Both explicit modes in all six skins were checked at 320×568 and 568×320 CSS px.
  These simulate orientations; they do not validate a physical rotation event.
- Chromium uses actual browser zoom, verified with `getZoom=2`, DPR=2, and a
  1280×800 window resolving to a 640×400 CSS viewport. Every journey and skin was
  checked at 200% in Light mode, including 320×568 and 568×320 window stress cases
  resolving to 160×284 and 284×160 CSS px. The combined 160px case exceeds the
  ordinary 320px reflow check; do not equate its failures with a WCAG verdict.
- Synthetic session names include spaces and 120 unbroken characters; movement
  names include spaces and 100 unbroken characters, within their input limits.
  Session/author names, populated profile values, empty lists, 100 contributors in
  the atlas drawer, and 100/1,000/10,000-row datasets exercise the agreed cases.
- Same production font families are supplied by local Fontsource packages rather
  than Next's generated subsets. Exact production font payloads, Clerk, fetching,
  and save responses were not exercised. Mock writes explicitly fail.
- Rendered colors are measured from computed CSS and composited solid backgrounds,
  foreground alpha and, in supplementary/state checks, nested opacity groups.
  Normal text uses 4.5:1; qualifying large text uses 3:1. Disabled controls are
  excluded from defect counts. Gradients, images, filters, backdrop blur, blend
  modes and unsupported color representations remain unresolved. This does not
  establish complete contrast coverage of every hover/focus/error state.

## Reproduced layout findings

The following document widths were identical in both engines for PULSE Light at
320px with the populated long-name fixture:

| Journey | Document width | Result |
| --- | ---: | --- |
| Profile | 320px | No page overflow; numeric values visibly clipped |
| Session library | 320px | No page overflow; very short title previews |
| History | 338px | Header action cluster overflows |
| Catalog | 320px | Default list stays within viewport |
| Creation, plan-only | 1,655px | Long exercise names expand the form |
| Logging | 1,397px | Long exercise names expand the form |
| Live session | 1,424px | Unbroken names overflow set rows |
| Analytics, closed drawer | 320px | Charts fit the viewport |

1. **P2 — Profile values are hard to review at 320px.**
   `apps/web/components/ProfileForm.tsx:104` keeps age/height/weight in three
   columns. With 199.9 in height and weight, the Chromium screenshot shows the
   decimal part clipped inside narrow number inputs. The DOM still holds 199.9;
   this is a presentation defect, not changed data. Recommend responsive columns
   and sufficient usable input width. [Screenshot](ui-layout-evidence/screenshots/chromium-pulse-light-profile-320x568-z1-default.png).

2. **P2 — History's header causes horizontal scrolling.**
   `apps/web/components/HistoryBrowser.tsx:88` supplies a Log link/count cluster to
   `apps/web/components/pulse/page-header.tsx:34`, whose action remains nonshrinking
   alongside the title. It extends to x=338 at a 320px viewport. Recommend stacking
   or wrapping the action at narrow widths.
   [Screenshot](ui-layout-evidence/screenshots/chromium-pulse-light-history-320x568-z1-default.png).

3. **P2 — Long names expand creation/logging fieldsets and live rows.**
   `apps/web/components/HandAuthoredSessionForm.tsx:654` and `:878`,
   `apps/web/components/LogSessionForm.tsx:180` and `:190`, and
   `apps/web/components/live-session-sets.tsx:211` reproduce overflow with a legal
   100-character unbroken movement name. Whole form sections expand, putting
   controls outside the visible area. Recommend allowing fieldsets/flex children
   to shrink and wrapping unbroken names; check the action clusters afterward.
   [Creation](ui-layout-evidence/screenshots/chromium-pulse-light-creation-320x568-z1-default.png),
   [logging](ui-layout-evidence/screenshots/chromium-pulse-light-logging-320x568-z1-default.png),
   [live](ui-layout-evidence/screenshots/chromium-pulse-light-live-320x568-z1-default.png).

4. **P2 — Atlas contributor names overflow the sheet horizontally.**
   `apps/web/components/analytics/atlas-drawer.tsx:95` places an unconstrained name
   beside its count. Unbroken names extend beyond the sheet and crowd counts.
   The 100-row drawer remains height-bounded and vertically scrollable in both
   orientations; the earlier unbounded-height risk is not reproduced in current
   code. Recommend wrapping the name and reserving count width.
   [Portrait](ui-layout-evidence/screenshots/chromium-pulse-light-analytics-320x568-z1-drawer.png),
   [landscape](ui-layout-evidence/screenshots/chromium-pulse-light-analytics-568x320-z1-drawer.png).

5. **P3 — Session names are severely abbreviated.**
   `apps/web/components/SessionCard.tsx:56` truncates the title in the remaining
   space beside the sigil and Start button. At 320px, the fixture's title becomes
   “Long w…”, while the author wraps into many short lines. Full names remain in
   the accessible link name and can be opened, so this is a recognition/scanability
   finding rather than proof that the full title is inaccessible.
   [Screenshot](ui-layout-evidence/screenshots/chromium-pulse-light-sessions-320x568-z1-default.png).

## Contrast: tokens pass, some rendered states fail

The existing skin guard and contrast-math tests pass (9 tests). In both engines,
all nine Text Ramp/surface combinations in each of the 12 explicit palettes meet
4.5:1. The minimum per palette is:

| Skin | Dark minimum | Light minimum |
| --- | ---: | ---: |
| PULSE | 4.64 | 4.66 |
| Aurora | 4.64 | 4.61 |
| Vercel | 4.65 | 4.62 |
| Alpine | 4.85 | 4.81 |
| Clay | 4.88 | 4.81 |
| Track | 4.61 | 5.25 |

All 24 System checks (six skins × two preferences × two engines) resolve the same
measured ramp colors as their explicit mode. These findings uphold ADR-0070's
token invariant; they do not establish rendered-state contrast everywhere.

- **P1 — PULSE Light accent text and primary button labels miss 4.5:1.**
  `apps/web/app/globals.css:117` supplies cyan used for ordinary small text;
  `apps/web/components/ui/button.tsx:17` pairs it with on-accent text. “Save profile”
  and the primary “Continue” sample measure **3.75:1**. Selected cyan chip/badge
  text measures about **3.12:1** on cyan-dim. These are enabled text, not disabled
  controls or large headings. The current guard covers only the Text Ramp.

- **P1 — Completed-card opacity undermines muted informational text.**
  `apps/web/components/live-session-sets.tsx:199` applies `opacity-80` to the entire
  completed card. The still-readable prescription note at `:220` measures
  **3.33–4.23:1 across all 12 palettes**, below 4.5:1, despite passing opaque muted
  tokens. This finding uses the static prescription note, not exempt disabled
  input text. Recommend representing completion without fading the information.
  [Completed-set screenshot](ui-layout-evidence/screenshots/chromium-pulse-light-live-320x568-z1-completed-set.png).

- **P2 — Shared error feedback can miss contrast on supported surfaces.**
  `apps/web/components/pulse/alert.tsx:16` uses magenta over magenta-dim. Controlled
  rendered samples on base/surface/elevated reveal failures in PULSE Dark/Light,
  Aurora Light, Vercel Light, Alpine Dark/Light, Clay Dark/Light and Track Light.
  Worst examples: PULSE Light **3.51:1**, Vercel Light **3.74:1**, Track Light
  **3.85:1**. This establishes a component/palette pairing risk; it is not a claim
  that every actual error placement fails. Recommend validating semantic text
  pairings and their composited parent surfaces.

Small type remains a separate legibility concern. The tab labels are 9px and many
metadata labels are 9–11px; meeting a ratio does not prove comfortable reading.
Blurred navigation backgrounds and unsupported alpha/color formats remain
explicitly unscored in the evidence.

## Large datasets

Single local runs; no throttle, production API, network timing or latency budget.
History ready time includes navigation, module/font readiness, and the original
full-DOM inspection. Its filter timing includes automation and confirmation of
the empty result. Each history record carries one Logged Set. All requested
records rendered; 10,000 histories created approximately 290,000 DOM elements.

| History records | Chromium ready / filter to empty | WebKit ready / filter to empty |
| --- | ---: | ---: |
| 100 | 481 / 49 ms | 471 / 107 ms |
| 1,000 | 2,246 / 131 ms | 3,058 / 132 ms |
| 10,000 | 34,369 / 1,004 ms | 32,349 / 7,311 ms |

Catalog taxonomy is unpaged; the 50-result search limit does not apply to it.
Separate repeats used exact rendered row counts and a direct section-header
locator, avoiding expensive role/name scans over thousands of buttons. Catalog
ready time excludes the subsequent color inspection. Therefore it is **not
directly comparable** to the history ready time above.

| Taxonomy rows | Chromium ready / collapse | WebKit ready / collapse |
| --- | ---: | ---: |
| 100 | 515 / 70 ms | 649 / 33 ms |
| 1,000 | 422 / 44 ms | 973 / 68 ms |
| 10,000 | 2,281 / 431 ms | 9,199 / 783 ms |

**P2, further profiling needed:** history's large DOM and slow empty-filter
transition justify focused performance work before choosing pagination or
virtualization. Ready-time costs need instrumentation inside React to separate
rendering from the audit inspector. No arbitrary timing threshold or production
performance failure is asserted. The earlier 19.8-second catalog collapse and
WebKit role-selector timeout were automation overhead and are superseded by the
direct-locator repeat, not application timings.

## Remaining validation and handoff

Real Safari/WebKit 200% browser zoom, authenticated full-stack journeys, physical
iOS/Android rotation, installed-app safe areas, and unsupported/composited visual
backgrounds remain outstanding. Dark-mode browser zoom, text-only zoom and a
complete state-by-state contrast inventory were not performed. Creation here is
the plan-only Capture form; generation, builder variants and author-and-log
submission are not established by this fixture pass.

The audit harness adds only development dependencies and files outside the Next
route tree. Production components, domain data, auth and Active Skin publication
are unchanged. Evidence identifies findings for a subsequent agreed fix scope;
it does not choose a pagination architecture or change palette tokens.

Checks: TypeScript `--noEmit --incremental false`; skin/contrast guard (9 passing);
browser harness stylesheet/zoom/count checks; diff checked against `REVIEW.md`
and `git diff --check`. Full frontend suite: **1,279 passing**, zero failures,
using Node 24.19.0 with `--experimental-test-module-mocks`.
