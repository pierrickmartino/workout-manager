# Trusted Types report-only check: React 19.3

ADR-0036 ships `require-trusted-types-for 'script'` report-only and names React 19 and
Clerk's injected scripts as the expected blockers. React 19.3.0 added Trusted Types
integration, so TASKS §4 asked for the check to be re-run with the bump. Run on
2026-10-07 in Chromium 1194, headless.

## Which React ships

The App Router renders with the React that Next vendors, not the `react` package:
`next@16.3.8` bundles **`19.3.0-canary-cbb046ab-20260731`**. Production was already
running 19.3 code before this bump. The `react` / `react-dom` pin drives the
`node --test` suite, the `audit/` Vite harness and the types, so the bump lines those
up with what ships.

## Method

`audit/trusted-types.mjs` listens for `securitypolicyviolation`, loads each page, opens
every `<details>` and presses the first four buttons in `main`. A press that fails is
recorded in `pressFailures` rather than skipped. On the re-run, one press failed: the fourth
button on `home` timed out. That journey's report may therefore miss a violation only that
press would raise.

- **Harness mode:** every `audit/` journey (Live Session, logging, Hand-Authored
  creation, builder-adjacent forms, charts, catalog, sheets, dialogs…), with the
  report-only header added by the probe. This isolates React and our components.
- **Server mode:** `next build && next start` with the Lighthouse placeholder Clerk keys,
  over `/`, `/sign-in`, `/sign-up`. `proxy.ts` sends both CSP headers itself.

Signed-in routes still need a real Clerk instance. They are not covered here.

## Results

| Run | React | Violations | Source |
| --- | --- | --- | --- |
| Harness, 20 journeys | 19.2.7 | 2 | `charts` only |
| Harness, 20 journeys | 19.3.0 | 2 | `charts` only, identical |
| Server, 3 public routes | bundled 19.3 canary | 15 (5 per route) | see below |

**Harness.** Both violations come from `audit/chart-fixture.tsx`'s
`<script type="application/json" id="chart-inputs">`, the payload `charts.mjs` reads.
React DOM creates a rendered `<script>` through `innerHTML` and sets its `textContent`.
No app component renders a `<script>`, so the app itself raised no violations on either version.

**Server**, per route:

- 4 × `HTMLScriptElement src` → `https://<clerk FAPI>/npm/@clerk/clerk-js…`, from
  Clerk's loader. This is the blocker ADR-0036 predicted, and it is Clerk's code.
- 1 × `ServiceWorkerContainer register|/sw.js`, from
  `components/ServiceWorkerRegistrar.tsx`. **This one is ours.** Under enforcement the
  registration would throw and the PWA would lose its worker (ADR-0028). It needs a
  `trustedTypes.createPolicy` that returns only `/sw.js` as a `TrustedScriptURL`.

## Verdict

- React 19.3 adds **no** Trusted Types violations. React is no longer a blocker for our
  components.
- Enforcement stays deferred. Clerk's script injection still blocks it, and the
  service-worker registration needs a policy first. Fix that in the enforcement
  ticket, not in this bump.
- Re-run with a real Clerk instance over the signed-in flows (dashboard hydration, Live
  Session, builder DnD) before turning enforcement on, as ADR-0036 asks.
