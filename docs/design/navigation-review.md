# Application navigation review

Review date: 2026-09-17

Prompt : Review the navigation across the pages of the application and create⠄a report in a markdown file.

## Scope and method

Source review of all 33 page routes under `apps/web/app`, the shared shell, navigation components, relevant form actions, URL-state helpers, authentication middleware, and PWA manifest. Reviewed against the intent and tap budgets in [the agreed information architecture](redesign-ia.md) and the navigation/accessibility portions of [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md).

This is a static review, not an authenticated browser audit. Findings describe implemented paths and code-level gaps; actual focus behavior, browser-history restoration, Clerk redirects, touch geometry, and device safe areas still need runtime verification. No application code was changed and no automated tests were run for this documentation-only review. Source references below are repository-relative `file:line` locations at review time.

## Assessment

The four-tab structure is coherent, and Home provides useful shortcuts for both generated and hand-built training. The main weaknesses are continuity: generated protocols do not lead directly into their sessions, launch and reuse paths exceed agreed tap budgets, several return links discard the entry context, and list filters are inconsistently preserved. Keyboard navigation also needs attention in the exercise drawer and session library.

Prioritize the protocol-to-session path, draft protection, and keyboard access before smaller labeling and shell improvements.

## Route inventory

| Area | Routes | Entry and onward navigation |
| --- | --- | --- |
| Entry and onboarding | `/`, `/dashboard`, `/onboarding` | Welcome offers sign-in or dashboard. Dashboard redirects incomplete profiles to onboarding. Profile submission returns to dashboard. |
| Training hub | `/train` | Generation, Build, Log, recent-session Start links, My sessions, and exercise catalog. |
| Session library and creation | `/sessions`, `/sessions/new`, `/sessions/build`, `/sessions/log` | Library opens session detail. Generation/build land on the created session; author-and-log lands on History. |
| Session execution | `/sessions/[id]`, `/sessions/[id]/live`, `/sessions/[id]/log` | Detail offers Start and Log. Live state has resume handling; successful logging leads to History. |
| Protocols | `/protocols/new`, `/protocols/[id]`, `/protocols/[id]/edit` | Generation lands on protocol overview. Overview links to editor and exercises; editor links back to overview. Session cards lack session navigation. |
| Exercise discovery | `/exercises`, `/exercises/[id]`, `/exercises/[id]/progress` | Catalog opens a detail drawer. Full detail has URL-based tabs and origin-aware return links. Legacy progress route redirects to `?tab=history`. |
| Analytics | `/analytics`, `/analytics/strength`, `/metrics` | Stats hub links to strength, History, and metrics. Analytics range and strength pagination use query parameters. |
| Records | `/history`, `/history/[id]`, `/history/[id]/edit`, `/history/[id]/capture`, `/logs/new` | History offers detail, correction, reuse/capture, and ad-hoc logging. Record detail links to its source plan when available. |
| Profile | `/profile`, `/profile/edit`, `/profile/achievements` | Profile links to editing and achievements. Achievements returns to Profile; editing returns to Dashboard. |
| Administration | `/admin`, `/admin/exercises`, `/admin/exercises/[id]` | Admin-only Profile row opens Admin; explicit back links connect its catalog and editor. Server-side role checks gate access. |
| Sharing and recovery | `/shared/[token]`, `/offline` | Sharing previews/redeems sessions or displays an unavailable state. Offline page links to Dashboard. |

The bottom tabs map Dashboard to HOME; Train, Sessions, Protocols, and Exercises to TRAIN; Analytics, History, and Metrics to STATS; and Profile to PROFILE. `/logs/new` and `/admin/**` currently have no active tab.

## Findings

Severity: **High** blocks a core continuation, risks losing work, or materially impairs keyboard access. **Medium** adds friction or loses navigation context. **Low** affects consistency or orientation.

### 1. Protocol overview cannot open or start a session — High

- `apps/web/app/protocols/[id]/page.tsx:118` — “Next up” renders a `SessionCard` without a Start or session-detail link.
- `apps/web/app/protocols/[id]/page.tsx:130` — Schedule cards are non-interactive containers; only individual exercise names navigate.
- `apps/web/lib/use-protocol-generation.ts:32` — Successful generation sends the user directly to this overview.

**Journey:** Generate protocol → protocol overview → no direct way to run the displayed next session. The user must discover the Home tab and its Start action. The overview does not complete the flow implied by “Next up.”

**Recommendation:** Link every schedule item to its session detail and give Next up a primary Start link to `/sessions/[id]/live`. Keep exercise links separate. Add a route back to the training hub or dashboard.

### 2. Installed-app launch adds an avoidable welcome step — Medium

- `apps/web/public/manifest.json:5` — `start_url` is `/`.
- `apps/web/app/page.tsx:51` — Signed-in users remain on the welcome screen and must choose “Go to your dashboard.”

**Journey:** Fresh installed-app launch → welcome → Dashboard → Start next is two taps, exceeding the agreed one-tap launch budget. This count assumes an authenticated user with a complete profile and an available next session; OS session restoration was not tested.

**Recommendation:** Redirect authenticated visitors at `/` to Dashboard, or launch the PWA at Dashboard with appropriate sign-in handling. Verify both signed-in and signed-out cold launches.

### 3. Saved-session reuse exceeds its two-tap budget — Medium

- `apps/web/lib/quick-actions.ts:46` — Home’s My sessions shortcut opens `/sessions`.
- `apps/web/components/SessionsLibrary.tsx:248` — A library row opens session detail, not Live.
- `apps/web/app/sessions/[id]/page.tsx:260` — Start is a further link on detail.

**Journey:** Dashboard → My sessions → session detail → Start takes three taps even after reaching Dashboard. Train → recent-session Start meets two taps from Dashboard, but covers only the recent subset.

**Recommendation:** Add a separate Start link to each library row while preserving the detail link. Keep Favorite and Delete outside both anchors.

### 4. Substantial form drafts have no navigation protection — High

- `apps/web/components/HandAuthoredSessionForm.tsx:249` — Exercise drafts live in component state.
- `apps/web/components/AdhocLogForm.tsx:46` — Ad-hoc rows live in component state.
- `apps/web/components/CorrectLogForm.tsx:199` — Newly added correction rows live in component state.
- `apps/web/app/layout.tsx:205` — Global tab navigation remains available during these flows.

No dirty-form navigation guard or draft persistence was found for these forms. Navigating away and reopening the route can discard unsaved work; incidental browser restoration is not a recovery strategy. Live sessions are a positive exception: they explicitly persist and resume state.

**Recommendation:** Preserve drafts or confirm navigation when a form is dirty. Cover in-app links and browser navigation; `beforeunload` alone does not cover client-side route changes. Clear drafts only after confirmed success or explicit discard.

### 5. Exercise drawer lacks modal keyboard navigation — High

- `apps/web/components/ExerciseCatalogTaxonomy.tsx:405` — `DetailDrawer` renders a custom modal without focus entry, focus containment, or focus restoration.
- `apps/web/components/ExerciseCatalogTaxonomy.tsx:419` — The dialog has `aria-modal="true"` but no accessible name.

The overlay visually covers the page, but keyboard users can remain on or reach background controls. An explicitly labeled Close button and Escape handler are present, but they do not supply the missing focus behavior.

**Recommendation:** Use an accessible dialog primitive or implement the complete focus lifecycle, background inertness, and a label tied to the exercise heading. Preserve Escape dismissal and restore focus to the originating exercise row.

### 6. Session-library links suppress visible keyboard focus — High

- `apps/web/components/SessionsLibrary.tsx:249` — The main session link applies `focus-visible:outline-none` without a replacement ring or other focus indicator.

The surrounding card changes on hover, not keyboard focus. Keyboard users cannot reliably identify the selected navigation target.

**Recommendation:** Add a visible focus ring to the link or a clearly visible `focus-within` treatment to the card. Verify across all supported skins.

### 7. Browse filters are not consistently represented in URLs — Medium

- `apps/web/components/SessionsLibrary.tsx:47` — Search and chip selection initialize locally and are not synchronized to the URL.
- `apps/web/components/AdminExerciseBrowser.tsx:59` — Admin filters initialize from an empty local state.
- `apps/web/components/ExerciseCatalogTaxonomy.tsx:70` — Catalog accepts initial URL filters, but subsequent filter changes only update component state and fetch results.
- `apps/web/components/exercise/catalog-detail.tsx:200` — Drawer alternatives hard-code `from=/exercises`, dropping any filtered catalog origin.

**Journey:** Filter a library/catalog → open an item → return using an explicit back link or refresh/share the view. The chosen filter state is not encoded, so the narrowed view cannot reliably be recovered. Catalog deep links can initialize filters, but interactive changes do not round-trip into a new URL.

**Recommendation:** Store stable filters in query parameters and include the full filtered origin in detail links. Use replace for typing and intentional history entries where Back should restore a prior view. History’s existing URL serialization provides a useful pattern.

### 8. Back and post-save destinations are inconsistent — Medium

- `apps/web/app/profile/edit/page.tsx:27` and `apps/web/app/profile/actions.ts:98` — Profile → Edit returns to Dashboard both through the back link and after saving.
- `apps/web/app/sessions/new/page.tsx:24` and `apps/web/app/protocols/new/page.tsx:38` — Forms reached from Train return to Dashboard.
- `apps/web/app/history/[id]/edit/page.tsx:63` — Editing a record returns to the History list rather than its detail.
- `apps/web/app/history/[id]/capture/page.tsx:63` — “Back to session” actually opens a recorded performance at `/history/[id]`.

These are valid destinations, but they interrupt the journey or blur the distinction between a saved plan and a recorded workout.

**Recommendation:** Establish explicit parent destinations and preserve origins for multi-entry flows. Return profile edits to Profile while keeping onboarding completion directed to Dashboard. Label the capture return “Back to workout record.” Reuse the existing validated-origin approach from exercise detail rather than relying only on browser Back.

### 9. Signed-out deep links receive inconsistent entry handling — Medium

- `apps/web/proxy.ts:17` — Only Dashboard, Onboarding, and Profile route families call `auth.protect()`.
- `apps/web/lib/api.ts:40` — API requests attach the token without handling the signed-out case as navigation.
- `apps/web/app/protocols/[id]/page.tsx:29` — Any unsuccessful protocol read becomes `notFound()`.

Signed-out visits to private training/statistics routes do not receive the same deliberate sign-in entry as Dashboard. Depending on the page and backend response, the user can see a generic load error, an empty hub, or a not-found screen instead of a sign-in continuation. This is a navigation finding, not evidence of unauthorized data access; backend authorization is separate.

**Recommendation:** Define public routes explicitly and consistently gate private areas. Preserve the intended destination through sign-in. Decide the sharing-preview policy separately. Validate authentication expiry and fresh deep links with real Clerk sessions.

### 10. Active-tab coverage omits records and administration — Low

- `apps/web/components/pulse/tab-bar.tsx:20` — No route match covers `/logs/new` or `/admin/**`.

History → Log an exercise loses the STATS indicator. Profile → Admin loses the PROFILE indicator, despite both journeys having clear parents.

**Recommendation:** Include `/logs` under STATS and `/admin` under PROFILE, or provide an explicit alternative location indicator for administration. Add route-family assertions so new routes do not silently lose orientation.

### 11. Shared shell lacks a skip link and device-safe bottom spacing — Medium

- `apps/web/app/layout.tsx:158` — Repeated header navigation has no skip-to-content link.
- `apps/web/app/layout.tsx:198` — Main content lacks an ID for such a target.
- `apps/web/components/pulse/tab-bar.tsx:46` — Fixed bottom navigation uses `pb-5`, without `env(safe-area-inset-bottom)`.

**Recommendation:** Add a visible-on-focus skip link and a main-content target. Give the header and primary navigation distinct accessible labels. Incorporate device safe-area insets into the tab bar and corresponding content clearance. Safe-area overlap is a device-validation risk, not a visually reproduced defect in this review.

### 12. Nested statistics pages and error states rely heavily on global tabs — Low

- `apps/web/app/analytics/strength/page.tsx:73` — No explicit return link to the analytics overview.
- `apps/web/app/metrics/page.tsx:22` — No explicit return link to the analytics overview.
- `apps/web/app/dashboard/page.tsx:37` — A failed profile read displays an error without retry or contextual recovery.
- `apps/web/app/analytics/strength/page.tsx:45` — A failed analytics read similarly provides no local recovery action.

These are not total dead ends for signed-in users because the global tabs remain available. However, recovering an earlier analytics range or retrying a transient failure is left to browser controls or rediscovering the hub.

**Recommendation:** Add labeled parent links on nested pages, preserve originating analytics parameters where useful, and provide retry actions for recoverable load failures.

## Existing strengths to preserve

- Navigation predominantly uses real Next.js links, supporting normal browser behavior.
- Tab matching respects path-segment boundaries and exposes the selected section with `aria-current`.
- Home offers Build, Log, and My sessions even without an active protocol.
- Exercise detail preserves validated origins across its tab links; legacy progress URLs redirect to the consolidated detail page.
- Analytics ranges, strength pagination, and History filters already have URL representations.
- Live sessions have explicit persistence/resume and post-finish routes; ordinary unsaved forms should not be confused with this protected flow.
- Admin navigation is role-aware and its pages perform server-side authorization checks.
- History distinguishes opening a record, reusing its plan, and capturing a plan from a plan-less record.

## Recommended delivery order and acceptance checks

1. **Complete the core journeys:** Add protocol session links, bypass the welcome page for returning users, and add library Start links. Verify an authenticated cold launch reaches the next Live session in one tap and any saved session in at most two.
2. **Protect work and keyboard access:** Preserve or guard form drafts, fix drawer focus behavior, restore library focus indicators, and add the skip link. Test Tab/Shift+Tab, Escape, focus return, and navigating away from a populated draft.
3. **Preserve navigation context:** Synchronize filters, normalize back/save destinations, and cover missing tab families. Test filter → detail → return, refresh, copied URLs, and browser Back/Forward.
4. **Verify recovery and mobile behavior:** Test signed-out deep links, expired sessions, unavailable records, failed reads, offline recovery, and installed-app safe areas. Distinguish expected authorization failures from missing content and transient service failures.

Use ordinary users with and without a current protocol, an administrator, and a signed-out visitor. Include both plan-backed and plan-less workout records. These runtime checks remain outstanding; this report does not claim that they passed.
