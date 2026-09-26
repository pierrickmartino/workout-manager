# Motion, network, navigation and installed-app validation

Date: 2026-09-26. Source: [UI/UX audit, follow-up 4](../ui-ux-audit.md).
Base commit: `2a1bb9e0c37855292716d8ca1e2472563ffc81bc`.
Session: Codex, inherited session model; no separate issue supplied.
Agreed scope: report and regression tooling only; no production fixes. Cover all
five conditions, prioritizing Live Session save/retry, authoring, plan-less logging,
Log Correction and Catalog navigation. Use synthetic data and mocked services for
isolated and real-app journeys. Physical-device checks may remain outstanding.

This report separates source evidence, isolated runtime evidence and outstanding
authenticated/physical-device checks. Production behavior is unchanged by this
validation. No pass is inferred from source inspection.

## Source evidence and test boundaries

- [GenerationProgress](../../apps/web/components/GenerationProgress.tsx) uses
  `animate-spin` and an infinite `pulse-sweep`; the shared
  [Skeleton](../../apps/web/components/pulse/skeleton.tsx) uses `animate-pulse`.
  These classes have no local reduced-motion alternative. This is a source risk;
  runtime animation measurements determine whether movement actually continues.
- [Catalog drawer](../../apps/web/components/ExerciseCatalogTaxonomy.tsx) disables
  transitions under reduced motion and makes its close delay zero. The
  [atlas drawer](../../apps/web/components/analytics/atlas-drawer.tsx) disables its
  slide transition. Both sheets include bottom-inset spacing and contained scrolling.
- [RootLayout](../../apps/web/app/layout.tsx) includes top-inset header padding and
  bottom-inset main clearance; [TabBar](../../apps/web/components/pulse/tab-bar.tsx)
  includes bottom-inset padding. The viewport exports width and initial scale,
  without `viewportFit: "cover"`. Whether these controls clear an installed
  device's physical insets remains a device question.
- Catalog, [SessionsLibrary](../../apps/web/components/SessionsLibrary.tsx) and
  [HistoryBrowser](../../apps/web/components/HistoryBrowser.tsx) serialize filters
  with `history.replaceState`. Refresh/back correctness is not established by the
  URL write alone. The existing audit's
  [navigation boundary](../../apps/web/audit/boundaries.tsx) replaces Next routing
  and Clerk; its original search parameters are always empty and refresh is a no-op.
- [Catalog ordering tests](../../apps/web/lib/latest-catalog-request.test.ts)
  establish superseded-response rejection at the request helper. Browser checks
  must also establish that the mounted component wires invalidation correctly.
- [Outbox orchestration](../../apps/web/lib/finish-outbox-sync.ts) persists finish
  entries in IndexedDB and retains failures for retry; the
  [registrar](../../apps/web/components/OutboxSyncRegistrar.tsx) drains on mount,
  reconnect and foreground. Pure outbox/sync-state tests do not prove these browser
  persistence/event effects or real server deduplication.
- [Draft ADR-0080](../adr/0080-workout-form-drafts-are-account-scoped-local-recovery-state.md)
  requires explicit Restore/Discard, exact owner/form matching and retention until
  acknowledged save. The audit records browser back/forward blocking as a remaining
  best-effort gap; working recovery storage must cover such departures.

The existing [layout runner](../../apps/web/audit/README.md) mounts production UI
with synthetic data. Mocked action delays, errors and reorderings can establish
component behavior, but cannot establish production Next/RSC transport or Clerk
account transitions. Simulated CSS insets cannot establish installed-device behavior.

## Acceptance criteria

Evaluate observable outcomes rather than an arbitrary speed threshold:

- Reduced motion removes slide, sweep, spin and pulse motion while retaining
  readable progress/status and usable drawer dismissal. Test the initial
  preference and changing it while the UI is mounted.
- Delayed/failed operations retain entered work and communicate pending/failure;
  successful recovery cannot publish an obsolete result or duplicate a record.
- Refresh and return navigation recover the current filter context or explicitly
  offer the account's unsaved draft. Storage failure is visible and never silently
  presented as durable saving.
- Finish durability and sync feedback match the actual local queue/server
  acknowledgement. Server-computed projections may lag queued records.
- Installed-app controls and last content clear physical insets in both
  orientations and remain reachable with the software keyboard visible.

These criteria follow the existing audit/ADRs. They do not authorize caching
authenticated pages, an offline projection engine or a production UI fix scope.
Agreed blocker outcomes are lost data, duplicate records, false saved feedback,
stale results/errors and inaccessible controls. The response matrix includes slow
success, returned failure, offline before a write, connectivity lost mid-write and
a committed write with lost acknowledgement followed by retry. Reordering covers
both stale successes and stale errors.

## Isolated runtime evidence

Runner: [resilience.mjs](../../apps/web/audit/resilience.mjs). Raw evidence:
[results.json](ui-resilience-evidence/results.json), including browser versions,
timestamps, failures and injected conditions. Node 24.11.0; Playwright 1.63.0;
Chromium and WebKit, 390×844 CSS viewport, default Pulse/dark theme. This bounded
matrix does not repeat the previous all-skin layout audit.

The final matrix contains 34 checks: 29 passed, four reduced-motion checks failed,
and one WebKit service-worker check was inconclusive. No browser page errors were
reported. The runner intentionally exits 1 for reproduced acceptance failures.

| Scenario | Chromium | WebKit | Evidence boundary |
| --- | --- | --- | --- |
| Initial reduced motion and changing preference while mounted | Fail | Fail | Production loading components/CSS |
| Older Catalog success/error arriving after latest success | Pass | Pass | Controlled action completions; latest count and URL retained |
| Catalog disconnect before debounced query, then reconnect | Pass | Pass | Real browser connectivity; offline controls disabled, no action fired until reconnect |
| Catalog success delayed 1 second | Pass | Pass | Query retained, latest result displayed after mock completion |
| Blocked draft storage | Pass | Pass | Injected quota error; warning announced and field remained editable |
| Authoring, plan-less log and correction reload/Restore | Pass | Pass | Real localStorage; changed values recovered explicitly (three checks per engine) |
| Plan-less log delayed failure/retry | Pass | Pass | Submit disabled while pending; fields retained; same nonempty retry key |
| IndexedDB reload and repeated same-key insertion | Pass | Pass | Actual browser store; exactly one entry survived reload |
| Outbox interrupted delivery and retry | Pass | Pass | Actual enqueue/drain/store; injected delivery throw retained failed entry; mock acknowledgement removed it, same key on both attempts |
| Service-worker full offline navigation | Pass | Inconclusive | Production worker, synthetic offline page; only `/offline` cached online; WebKit returned internal navigation error offline |
| Reduced-motion Catalog and atlas sheets | Pass | Pass | Sheet transition disabled; Close visible; button color transitions are outside spatial-motion criterion |
| Synthetic 47px top / 34px bottom insets | Pass | Pass | Compiled CSS rules overridden; header/main/tab content padding arithmetic only |

**Reproduced P2 finding:** reduced motion does not stop GenerationProgress's
`spin` (1s) and `pulse-sweep` (1.4s), or Skeleton's `pulse` (2s), in either browser.
This occurs on initial preference and live preference changes. Textual generation
status remains visible. Production fixes are outside this agreed validation scope.
See [GenerationProgress](../../apps/web/components/GenerationProgress.tsx) and
[Skeleton](../../apps/web/components/pulse/skeleton.tsx). Screenshots are supporting
still images; computed animation records establish continued motion.

No agreed blocker was reproduced in these isolated scenarios. That does **not**
establish blocker-free real-app behavior. In particular, the outbox mock does not
commit a backend record, the direct store check does not exercise the Finish button,
and a one-second action delay is not real network throttling. The Catalog count's
loading label remains pending until both outstanding transitions settle; the
ordering assertions inspect the final latest result after both complete.

The local checkout has `.env.local.example` but no configured `.env.local`.
Authenticated Next/RSC journeys were therefore not run. The real-app
[navigation probe](../../apps/web/audit/resilience-navigation.mjs) is provided for
a configured loopback stack and disposable account: it checks actual refresh and
browser back/forward for Catalog, Sessions and History. It is syntax-checked but
unexecuted here. Its full-document navigation does not cover client detail links.
The checklist below covers offline-before-write, interrupted real requests,
server-commit/lost-acknowledgement, real Finish UI, account transitions and physical
installation. Item 4 remains partially open.

Reproduce from `apps/web`, with Node 22.12+ on PATH:

```bash
npm run audit:serve
# Separate terminal:
node audit/resilience.mjs
# Configured real Next stack only; auth state stays outside the repository:
UI_REAL_APP_URL=http://127.0.0.1:3000 UI_REAL_APP_STORAGE_STATE=/private/tmp/disposable-auth.json node audit/resilience-navigation.mjs
```

The isolated server binds only loopback. See [tooling instructions](../../apps/web/audit/README.md)
for output overrides and evidence boundaries. Earlier failure screenshots from
tooling development can remain; current JSON is authoritative for scenario outcomes.

## Authenticated real-app checklist — outstanding

Use a disposable test account and disposable records. Start the existing stack
using the configured development credentials and instructions in
[README](../../README.md): `docker compose up --build db redis api worker web`.
Alternatively, connect the web development server to that API with `API_URL` and
run `npm run dev` from `apps/web`. Record tested commit, origin, browser/version,
account alias and exact scenario; omit credentials and private record payloads.
Prefer synthetic test records and controlled mocked services. If credentials or
the full-stack environment are unavailable, record that limitation and leave
these journeys outstanding; fixture behavior does not establish real-app results.

1. In browser developer tools, enable reduced motion, visit a route loading
   skeleton and generation progress, and open/close both drawers. Record computed
   animation/transition state and a short observation. Repeat with the OS setting
   on a physical device. Progress text must remain present.
2. In Catalog, Sessions and History set distinguishable filters, copy each URL,
   reload, then open a detail and return using its Back control and browser Back/
   Forward. Compare visible controls/results with the recorded URL at every step.
   Distinguish intentional `replaceState` history behavior from loss of context.
3. Enter unmistakable values in Hand-Authored Session, plan-less log and Log
   Correction. Exercise in-app departure, browser Back, reload and tab reopening.
   Confirm explicit recovery with the exact fields and original retry identity;
   separately confirm Discard. Test blocked/full storage and record the warning.
4. Enable a recorded slow-network profile, submit once and observe pending state,
   retained inputs and failure/retry controls. Repeat with connectivity lost while
   the response is in flight. A transport failure is distinct from a returned
   validation error. Use a controlled test transport to reverse two Catalog
   response completions; confirm the latest filter owns both results and errors.
5. Load the app online until its service worker controls the page. Disable network
   and perform a full navigation/reload: expect the branded offline page. Inspect
   Cache Storage: authenticated navigation/RSC payloads must not be cached. Also
   try client navigation offline and record its actual recovery; the service
   worker handles `navigate` requests only, so full-navigation evidence does not
   establish client-navigation behavior.
6. During a Live Session, record sets, disconnect and Finish. Confirm durable
   IndexedDB queueing before the live slot is released. Restart offline, reconnect,
   foreground and use manual retry; observe truthful sync transitions. Finish a
   second distinct session while the first remains queued. Verify exactly one
   Logged Session per finish on the server after delivery.
7. In a controlled backend test, commit a finish but drop its acknowledgement;
   retry the same stored key and verify the original Logged Session is returned.
   A failure before commit cannot establish lost-acknowledgement deduplication.
8. With disposable queued work/drafts, test account switching and explicit sign-out.
   No foreign-account work may appear or be delivered. Verify expected local-store
   teardown without mistaking deliberate sign-out removal for network data loss.

## Physical installed-app checklist — outstanding

Test an HTTPS deployment at the recorded commit on a real iPhone with a notch/home
indicator and a real Android device with gesture navigation. Record device model,
OS/browser versions, install method, standalone display mode, orientation and
screenshots. [ADR-0028](../adr/0028-web-pwa-is-installable-and-offline-aware-but-caches-no-authenticated-navigation.md)
explicitly requires real iOS standalone validation each major release.

1. Install from Safari Add to Home Screen on iOS and the browser installation flow
   on Android. Launch from the installed icon and establish service-worker control
   while online before running offline cases.
2. In portrait and landscape, inspect header, all bottom tabs, lowest main-content
   action, Catalog drawer Close/content and atlas drawer Close/last contributor.
   Scroll to both extremes. Every control must remain visible and tappable clear
   of cutouts/home indicator; record actual inset values where inspectable.
3. Rotate with a drawer open; open the software keyboard in a long form, focus its
   lowest input, and try the save/recovery controls. Confirm scrolling remains
   usable and there is no concealed essential action or background scroll leak.
4. Repeat reduced-motion drawer/progress checks with the OS preference enabled.
   Keep text/status available while decorative motion is suppressed.
5. Start a Live Session, background/terminate/relaunch and return offline. Reconnect
   and foreground the installed app, then exercise manual retry. Verify queue
   durability, retained sets and exactly-once delivery using the real-app checklist.
6. Capture results for each device separately. An emulated mobile viewport,
   Playwright WebKit or injected inset value is supporting evidence, not a pass for
   either installed-device row.

## Decisions and handoff

Relevant decisions: [ADR-0012](../adr/0012-live-session-is-ephemeral-client-side.md),
[ADR-0028](../adr/0028-web-pwa-is-installable-and-offline-aware-but-caches-no-authenticated-navigation.md),
[ADR-0059](../adr/0059-account-scope-the-live-session-slot-and-finish-outbox.md),
[ADR-0060](../adr/0060-a-finish-is-an-immediately-real-logged-session-via-an-idempotent-outbox.md),
[ADR-0061](../adr/0061-offline-projections-stay-server-computed-no-client-projection-engine.md)
and [ADR-0080](../adr/0080-workout-form-drafts-are-account-scoped-local-recovery-state.md).
Authenticated navigation stays uncached; projections stay server-computed; retries
reuse the original finish key; recovery state stays account/form scoped.

Changed files: isolated audit boundaries, fixture entry point, Vite configuration,
README, two resilience runners, this report, evidence and the audit follow-up link.
No production components, dependencies or domain rules changed.

Validation: browser matrix above; focused frontend tests passed **51/51** using
`node --test --experimental-test-module-mocks` on `latest-catalog-request`,
`use-form-draft`, `form-draft-storage`, `navigation-guard`, `finish-outbox` and
`sync-state` test files. Backend `tests/test_logged_session_repository.py` passed
**46/46**, including repeat-key upsert returning the original record. This supports
the repository deduplication seam, not a real lost HTTP acknowledgement. TypeScript
`--noEmit --incremental false`, runner syntax checks and `git diff --check` passed.
Diff checked against `REVIEW.md`; bounded independent audit-tool security review
found no actionable blockers. No CI run or deployment is claimed.

Remaining findings: P2 reduced-motion loading defect; inconclusive WebKit worker
navigation; authenticated checklist and physical installed-device matrix outstanding.
Next fix scope should address the loading primitives and rerun those four failed
checks, while tracking real-app/device evidence separately.
