# Isolated layout and contrast audit

This is a separate development server, not a Next route. It mounts production
components and CSS with synthetic props; Vite replaces server actions, navigation,
and Clerk only inside this harness. Writes return an error. No credentials, real
account records, generation, or Active Skin publication are involved.

Use Node 22.12+ (this audit ran with the locally available Node 24.19.0):

```bash
cd apps/web
npm ci
npx playwright install chromium webkit
npm run audit:serve
# In a second terminal:
npm run audit:ui
node audit/extra.mjs
UI_AUDIT_STATES_ONLY=1 node audit/extra.mjs
UI_AUDIT_DATA_ONLY=1 node audit/extra.mjs
node audit/summarize.mjs
```

The server binds only `127.0.0.1:4173`. Screenshots and compressed raw measurements
default to `docs/development/ui-layout-evidence/`; set `UI_AUDIT_OUTPUT` to another
directory for a new run. Preserve evidence before rerunning: outputs are overwritten.

`run.mjs` checks explicit and System palettes, both orientations, empty states,
and 100/1,000/10,000-record histories. The Chromium extension uses `tabs.setZoom`
and records `getZoom`, effective CSS viewport, and DPR at 200%; it does not use CSS
zoom or pinch-zoom emulation. WebKit checks are at 100%. `extra.mjs` checks drawers,
group opacity, the unpaged taxonomy at 100/1,000/10,000 rows, and completed-set
states. The harness now uses checked-in next/font payloads and emitted face declarations
from `app/layout.tsx`; see `production-fonts/manifest.json` for byte hashes and
provenance. The archived original audit used substituted Fontsource packages.

The states-only run records `completedNotes.prescription` and
`completedNotes.previous` in `states.json.gz`, including composited colours and
ratios. It fails when either note cannot be measured or the completed prescription
note falls below 4.5:1. Previous-attempt contrast is reported without enforcing a
floor here. Fixtures include synthetic previous performance for this check.

Contrast calculations composite solid backgrounds, alpha foregrounds and nested
opacity groups. Images, gradients, filters/backdrop blur, blend modes, and unsupported
color representations are recorded as unresolved rather than scored. Browser-supported
CSS colours such as `color-mix()` are resolved through an sRGB canvas pixel before
compositing. Disabled
controls are recorded separately and excluded from failure counts. New runs
sample the first 4,000 elements for contrast, while recording the entire DOM
and actual rendered row counts. The recorded original history matrix used an
uncapped inspector; its ready times are not comparable to the bounded catalog pass.
Timings include browser/automation
overhead and are not production performance budgets.

The shell uses RootLayout's spacing with inert synthetic account chrome. Clerk UI,
authenticated server fetching, physical orientation changes, installed-app safe
areas, real Safari browser zoom and complete interaction-state coverage require
separate checks. This harness is not a conformance certification.

References: [Playwright extension testing](https://playwright.dev/docs/chrome-extensions),
[Chrome browser zoom API](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-setZoom),
[WCAG contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

## Motion and resilience validation

With the same loopback server running, use `node audit/resilience.mjs`.
This mounts additional motion, plan-less log and correction fixtures and enables
controllable actions only when the runner explicitly requests them. It exercises
delayed/reordered responses, failure/retry identity, storage recovery, real
IndexedDB orchestration and production `public/sw.js` with a synthetic public
offline fallback. It also injects CSS inset values: this is padding arithmetic,
not physical-device validation. Production builds never load these boundaries.

Evidence defaults to `docs/development/ui-resilience-evidence/results.json`;
override with `UI_RESILIENCE_OUTPUT`. The runner overwrites results and captures
failed scenarios. Earlier screenshots may remain from previous runs; only the
current JSON establishes outcomes. Exit 1 means a failed acceptance check; an
internal WebKit offline-navigation error is recorded as inconclusive. See
[the report](../../../docs/development/ui-resilience-validation.md).

For a **real Next app**, run `node audit/resilience-navigation.mjs` with
`UI_REAL_APP_URL` set to its loopback origin and `UI_REAL_APP_STORAGE_STATE` set
to a Playwright authentication-state file for a disposable account populated with
synthetic records. Keep that file outside the repository. Configure mocked
generation/other external services in the test stack. This probe only reads and
filters: it verifies URL state after refresh/back/forward for Catalog, Sessions
and History. It does not establish write delivery, client detail-return paths or
installed-device behavior. It writes outcome-only evidence without screenshots,
DOM dumps or credentials. The report contains the remaining real-app/device steps.

## Chart access validation

With the loopback server running, use `node audit/charts.mjs`. The `charts` journey
mounts production chart components via `chart-fixture.tsx`; the runner records
keyboard focus, accessibility snapshots, pointer tooltip values and sampled atlas
activation/restoration in Chromium and WebKit. Open a manual fixture with, for
example, `/?journey=charts&surface=distance&variant=sparse&range=90`.
Surfaces: `volume`, `distance`, `top`, `miniature`, `balance`, `split`, `atlas`.
Variants: `empty`, `single`, `multi`, `sparse`, `large`; `unit=kg|lb` and
`figure=neutral|male|female` are available where applicable.

Evidence defaults to `docs/development/chart-accessibility-evidence/`; set
`UI_CHART_OUTPUT` to preserve another run. `UI_CHART_SURFACES=atlas,split`
restricts a diagnostic run; use a separate output directory to preserve the full
matrix. `UI_CHART_CASE=volume/large/150/lb` selects one fixture in both browsers.
The runner overwrites compressed raw
results and the summary. Exit 1 means a runner error; accessibility findings are
recorded separately. Snapshots do not establish actual screen-reader speech,
production filter navigation or linked detail-page value access. See
[the report and manual closure matrix](../../../docs/development/chart-accessibility-validation.md).

## Split-fixture re-validation (#562)

With Node 22.12+ and the same server, run:

```bash
node audit/revalidate.mjs
# Retry only missing captures, preserving earlier runner failures:
UI_AUDIT_RESUME=1 node audit/revalidate.mjs
node audit/summarize-revalidation.mjs
```

Outputs default to `docs/development/ui-layout-revalidation-evidence/`;
`UI_AUDIT_OUTPUT` overrides it. Resume rejects a different application commit or
font-payload snapshot instead of relabelling old captures with new provenance.
The 4,224 cases include both engines, all six
Skins, both explicit Modes and both simulated orientations. Five separate inputs
(`fixture=short|session-spaced|session-unbroken|exercise-spaced|exercise-unbroken`)
run over eight journeys. Only the selected name axis is long; author and profile
names and the fixture footer stay short. Each default case has a paired
`fonts=fontsource` control on identical current code to isolate font metrics.
Additional production-font cases cover drawers, completed cards and rendered
flat/tinted Accents. Completed cards use DOM button activation because sticky
chrome can intercept a pointer in the short landscape viewport; their ratios do
not establish pointer accessibility. This run is at 100% browser zoom; the archived
200% zoom and large-data checks are not repeated by this issue.

Font files and generated CSS are snapshots of the app's Next font loader output,
not independent font packages. To refresh from a new compiled app layout:

```bash
node audit/capture-fonts.mjs .next/dev/static/css/app/layout.css .next/dev/static/media
```

A production build's combined layout CSS and media directory can also be passed
as arguments. Preserve the emitted face declarations and fallback metrics. The
runner verifies the layout and payload hashes and loads all seven families before
measurement, rejecting fallback-only resolution. The current snapshot comes from a successful production webpack build;
`cssSource` identifies its combined layout stylesheet. All 45 payload hashes also
matched the initial development-loader snapshot used during the sweep. The
production emitted declarations preserve the same faces and fallback metrics;
this is local production build output, not a capture from a deployed site. Fontsource remains available solely as the explicit comparison control.
Font licenses are retained beside the snapshots. Raw data includes every text
sample, composited colours, document width, overflow element and unresolved
sample; the summary names the exact fixture and separates recovered runner errors
from application findings.
