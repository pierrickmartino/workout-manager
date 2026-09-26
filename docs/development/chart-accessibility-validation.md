# Chart keyboard, screen-reader and value-access validation

Source: [UI/UX audit follow-up 5](../ui-ux-audit.md#follow-up-validation).
Scope confirmed through the grilling workflow; no separate issue supplied.
Base commit: `bcb18a1584d7fc3790056a8184368807f35c1917`. Session: Codex.
Validation tooling and findings only; no production component behavior changed.

## Acceptance and scope

Every plotted datum must be available with its series or Muscle Group, unambiguous
date/week where applicable, value and unit at displayed precision. Zero and missing
data must remain distinct. An accessible alternative may satisfy value access;
interactive chart actions must also work by keyboard. A decorative strength
miniature may link to the canonical Exercise Detail chart only if it identifies
the Exercise, the plotted datasets match and the destination provides complete
value access. Summary/latest/delta figures alone do not satisfy this requirement.

Scope: daily Total Volume, Weekly Distance, Top-Set Trend, Strength Trajectories
miniatures, weekly Muscle Balance, Muscle Split and the interactive Muscle Atlas.
Their production filters, legends, tooltips and links are included in the closure
criteria. ADR-0011, ADR-0017, ADR-0024, ADR-0049 and ADR-0078/0079 govern the
underlying projections; nothing here adds training targets or modifies records.

Actual VoiceOver/Safari and NVDA/Firefox evidence, plus authenticated-page checks,
are required before closure. Browser accessibility snapshots are supporting
evidence and do not establish spoken announcements. Item 5 remains open.

## Reproduce automated checks

Use Node 22.12+ and installed Playwright Chromium/WebKit. From `apps/web`, run
`npm run audit:serve`, then `node audit/charts.mjs` in another terminal.
The server binds to `127.0.0.1:4173`; no authentication or real records are used.
Evidence defaults to `docs/development/chart-accessibility-evidence/`.
`UI_CHART_OUTPUT` changes the destination; reruns overwrite the two result files.

`chart-fixture.tsx` mounts the production components. `charts.mjs` records input
fixtures, accessibility snapshots before/after keyboard traversal, Tab stops,
SVG role/tabindex, pointer tooltips, and atlas activation/dismissal/restoration.
Raw results are compressed JSON; `summary.json` records counts and runner errors.
Exit 1 indicates a harness/browser error, not the presence of an accessibility
finding. A successful runner exit does not mean accessibility acceptance passes.

Fixtures include empty, single, multiple, sparse and large inputs; Volume and
strength use kg/lb; Volume/Distance/Split use 30/90/150 parameters. Dates cross
2025/2026 and distance weeks are ISO Mondays. Volume is sparse, never filled with
invented zeros. Sparse distance explicitly includes a zero week; Muscle Balance
includes a no-training week. Top-set series are capped at eight points. Large
Volume uses up to 150 points; Distance uses up to 22 weekly buckets. The atlas
fixture samples Quadriceps, Hamstrings and Rectus Abdominis with trained and
untrained states and up to 100 contributing Exercises. The atlas heat magnitude
is deliberately distinct from its set count.

Limitations: chart range parameters shape synthetic data, not production filter
interactions. Component-only empty Volume/Distance charts do not reproduce their
callers' empty-state branches. Muscle Balance fixture length is a stress input,
not a production-window assertion. Only the neutral atlas figure and three muscle
records are sampled automatically. Miniature links are inspected but not followed
into authenticated detail. Production headings, disclosure text, full canonical
muscle coverage, all figure variants and focus appearance need page-level checks.

## Runtime evidence

The evidence files record individual browser cases; the measured summary follows. Required manual cases
remain **untested**, and authenticated cases remain **blocked** until a configured
disposable-account environment is available. No real screen-reader speech has
been captured in this session.

Automated run: 2026-09-26, macOS 26.6.2, Node 22.23.3, Playwright 1.63.0,
Chromium 153.0.8010.12 and Playwright WebKit 26.6. Default Pulse/dark, 900×900
viewport, reduced motion. WebKit automation is not an actual Safari/VoiceOver run.
The fixture/runner changes were uncommitted against the recorded base SHA.

Evidence: [summary](chart-accessibility-evidence/summary.json) and
[compressed per-case observations](chart-accessibility-evidence/results.json.gz).
There are **180 unique completed browser cases**, no remaining runner/page errors,
and **1,458 matching pointer-tooltip observations**, including six zero-week
category-slot probes. The complete matrix was followed by focused large-Volume
and Distance reruns. A browser context interruption and a harness assumption that
zero-height bars have paths were corrected; final evidence replaces those cases
with the reruns and retains run provenance and the initial interruption.
These harness problems are not reported as product defects.

| Surface | Cases | Observed result in both browsers |
| --- | ---: | --- |
| Total Volume | 60 | **fail** for keyboard/equivalent value access: chart skipped by Tab; snapshot exposes axis labels, not every date/value/unit pair. Pointer values match. |
| Weekly Distance | 30 | **fail** for keyboard/equivalent value access. Pointer values, including zero weeks, match. |
| Top-Set Trend | 20 | **fail** for keyboard/equivalent value access. Pointer estimates match kg/lb displayed rounding. Empty fixture uses a synthetic teaching message; production gating is separate. |
| Strength miniatures | 20 | **pass** for sampled link reachability, Exercise/latest/delta naming and observed focus-ring styling; **blocked** for real destination parity/access. Empty section is correctly absent. |
| Muscle Balance | 10 | **pass** for composition/legend/no-training-week exposure in snapshots; **fail** for the isolated component's year context. Actual spoken reading is untested. |
| Muscle Split | 30 | **pass** for sampled group/rounded-percentage text exposure and empty message. Actual spoken reading and full group roster remain untested. |
| Muscle Atlas | 10 | **pass** for sampled list expansion, Enter activation, SVG Space activation, named drawer and Escape focus restoration in all eight nonempty cases. Heat magnitude equivalence fails the agreed criterion; full atlas and screen-reader behavior remain untested. |

Across **88 nonempty full Recharts cases**, **zero** chart surfaces were reached
by Tab; every recorded SVG has no explicit role/tabindex. Baseline snapshots show
axis tick labels. No complete table/grid or per-point text alternative is present
in the mounted component or source-inspected callers. Their custom tooltip DOM
contains no live/status/alert element; this observation does not establish what
assistive technology speaks. The miniature chart is intentionally hidden, while
its link remains exposed. Noninteractive composition bars do not need Tab stops
when their values are available through ordinary text/image names.

## Findings

- **CH-F1 — P1, keyboard/value-access barrier:** Total Volume, Weekly Distance and
  Top-Set Trend provide pointer tooltips but no adjacent complete value alternative.
  Source locations: `apps/web/components/pulse/volume-chart.tsx:37`,
  `apps/web/components/pulse/distance-chart.tsx:29`,
  `apps/web/components/exercise/top-set-trend-chart.tsx:50`; their callers render
  summaries/context, not a per-point list. Browser focus and tooltip evidence below
  determines the runtime outcome; this is not inferred from the library's name.
- **CH-F2 — P2, incomplete date context:** Muscle Balance's accessible names carry
  month/day and percentages but omit the year (`apps/web/lib/muscle-balance-view.ts:72`).
  The year-crossing fixture exposes names such as “Week of Dec 29” and “Week of Jan 5”,
  without the corresponding ISO years. Value composition is exposed, but the agreed
  unambiguous date requirement is not met within this isolated component. Verify
  whether real-page surrounding context resolves it before assigning a page-level
  failure. Pointer dates in the three Recharts tooltips likewise omit the year.
- **CH-F3 — P2, heat magnitude equivalence gap:** Atlas names and detail expose
  state and mapped set counts. The actual heat driver is emphasis-weighted volume
  normalized to the busiest muscle (`apps/web/lib/muscle-region-atlas-view.ts:83`),
  while the accessible name uses `sets` at line 87. Its text-row magnitude bar is
  inside `aria-hidden` (`apps/web/components/analytics/muscle-region-atlas.tsx:257`).
  In the synthetic fixture, Quadriceps has 10 sets/intensity 1 and Rectus Abdominis
  has 4 sets/intensity 0.2: accessible set counts cannot reconstruct those proportions.
  This is a source-plus-fixture finding against the agreed equivalent magnitude
  requirement; deciding how to expose that magnitude belongs to the subsequent fix
  scope. Do not label it fatigue, readiness or a training target.
- **CH-F4 — linked miniature access remains incomplete:** The miniature chart is
  intentionally hidden from the accessibility tree and its link carries the Exercise,
  latest estimate and delta (`apps/web/components/analytics/strength-trajectories.tsx:56`,
  line 77). That is valid teaser behavior under ADR-0024, but is not a full-value
  alternative by itself. The isolated destination is not implemented; the canonical
  Top-Set chart's CH-F1 barrier prevents treating the link alone as an acceptance pass.
  Real fetched-dataset parity and destination navigation remain blocked.

No screen-reader announcement failure is asserted from the absence of a live
region alone. Custom tooltip live-region inspection is recorded, but actual
spoken output remains untested. Findings are not a WCAG conformance verdict.

## Manual and authenticated closure matrix

Run each case with keyboard-only Chromium and WebKit, then actual Safari +
VoiceOver and Firefox + NVDA. Record browser, OS and assistive-technology versions,
Safari keyboard-navigation setting, test date, environment and fixture IDs.
Use synthetic records in a dedicated account; retain no credentials in evidence.

| Case | Steps and expected evidence | Current status |
| --- | --- | --- |
| CH-1 | On `/analytics`, reach every offered 30/90/150 range link and change ranges. Verify selected state, relevant chart values, focus and accessible context; test disabled/unavailable ranges at shallow History Depth. | blocked: authenticated stack not supplied |
| CH-2 | Read all Volume and Distance points in empty/single/multi/sparse/large windows; compare date/week, displayed value and unit with the fixture record. Verify keyboard access to any pointer-only detail or a complete alternative. Test kg/lb for Volume and fractional km for Distance. | manual untested; authenticated blocked |
| CH-3 | On Exercise Detail SPECS, retrieve every Top-Set estimate/date, including equal-date sessions and a year boundary; test one/eight qualifying sessions and nonqualifying hidden chart. Confirm Estimated 1RM context and kg/lb. | manual untested; authenticated blocked |
| CH-4 | From `/analytics/strength`, Tab to each miniature, read its Exercise/link name, activate it, and compare all miniature points with the destination. Retrieve every destination value and verify return navigation. | blocked: real destination and matching datasets not exercised |
| CH-5 | Read every Muscle Balance week and legend. Verify all group percentages, year/week context and no-training weeks; compare with inputs without inferring values from color. | manual untested; authenticated blocked |
| CH-6 | Read Muscle Split groups/percentages, including Unclassified, rounding and empty data; compare the displayed precision with all bars. | manual untested; authenticated blocked |
| CH-7 | Traverse both atlas halves and the complete group/muscle text list for neutral/male/female. Activate trained/untrained regions via Enter/Space and list controls, read the drawer, close by Close/Escape, verify focus restoration and background exclusion. Compare sets, contributing Exercises, window, state and the magnitude actually driving heat. | partial isolated checks; full/manual cases untested |
| CH-8 | In each actual screen-reader combination, record the words and order spoken for chart entry, point/value reading, filter changes and tooltips. Check duplicate/missing announcements and discoverability of alternatives. | untested in both combinations |

Use **pass**, **fail**, **untested**, or **blocked** per browser and case. Capture
steps executed, expected/observed behavior, actual spoken words, data comparison
and reproduction details. Do not promote snapshot visibility to a speech pass,
a sampled muscle to a full-atlas pass, or a working miniature link to equivalent
destination value access. Closure requires all mandatory cases to pass.

## Checks and handoff

Commands completed with Node 22: `node audit/charts.mjs` plus focused reruns,
`node --check audit/charts.mjs`, TypeScript `--noEmit --incremental false`, and
`git diff --check`. Browser observations are the tests for this validation-only
change; the unrelated application unit suite was not rerun. Diff checked against
`REVIEW.md`: no domain, record, auth, backend, persistence or production rendering
behavior changed. No separate issue or PR was created.

Changed files: isolated chart fixture/runner, audit entry/README, this report,
the two evidence files and the UI/UX audit follow-up link. Next work: perform the
manual/authenticated closure cases and agree a separate production fix scope for
CH-F1 through CH-F4. Do not mark item 5 closed or infer screen-reader success from
the automated value-exposure passes.
