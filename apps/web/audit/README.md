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
states. Fontsource supplies the same production font families locally; these
files are not guaranteed byte-identical to Next's generated font subsets.

Contrast calculations composite solid backgrounds, alpha foregrounds and nested
opacity groups. Images, gradients, filters/backdrop blur, blend modes, and unsupported
color representations are recorded as unresolved rather than scored. Disabled
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
