# Web Interface Guidelines audit

Date: 2026-09-30  
Commit: `a0f1ec33239335101b170f360362ecbb55b5f8b1`  
Scope: `apps/web/app/**`, `apps/web/components/**`, shared UI primitives, and the repository's UI policy tests.

## Method and limits

Static source inspection followed the repository's `web-design-guidelines` skill and the Web Interface Guidelines categories: accessibility, forms, interaction, responsive/touch behavior, content, navigation/state, motion, images, and performance. The skill requires a fresh read of its canonical `command.md`; both the raw GitHub URL and GitHub Contents API returned HTTP 403 in this environment. This review therefore used the locally installed skill, the repository's last freshly retrieved audit baseline from 2026-09-17, and current source/tests. The upstream rules were not falsely claimed as freshly retrieved.

Automated checks:

- `npm test`: pass, 1,410/1,410 tests.
- `npx tsc --noEmit --incremental false`: pass.
- Browser reflow audit: not executed. The pinned Playwright Chromium binary is absent; the runner stopped before opening a page. Archived browser evidence was not counted as a current pass.
- No authenticated production journey, physical-device, Safari/VoiceOver, or NVDA/Firefox test was performed. This is an engineering audit, not a conformance certification.

Priority: **P1** = address first because it can create an access barrier or incorrect user data. **P2** = meaningful usability, resilience, or performance issue. **P3** = polish or consistency.

## Findings

### P1

- `apps/web/components/ui/input.tsx:14`, `apps/web/components/ui/select.tsx:22`, `apps/web/components/ui/textarea.tsx:12` — Shared form controls render at `text-sm` (14px). Mobile Safari automatically zooms focused controls below 16px, changing the viewport during nearly every form journey. Use at least 16px at mobile widths; reduce it only at a breakpoint where iOS focus zoom is no longer relevant.
- `apps/web/app/metrics/page.tsx:21` — “Today” is derived on the server with `new Date().toISOString()`, so the prefilled date is UTC rather than the user's local calendar date. The same pattern appears in `app/sessions/log/page.tsx:13`, `app/sessions/build/page.tsx:18`, `app/sessions/[id]/log/page.tsx:30`, `app/sessions/[id]/live/page.tsx:42`, `app/logs/new/page.tsx:10`, and history capture/edit pages. Around local midnight this can record a workout or metric on the wrong day. Resolve a user-local date at the client boundary or from an explicit user timezone.
- `apps/web/components/ui/button.tsx:26` — The shared `sm` button is 36px high and the icon button is 40px (`:29`), below the 44px mobile touch-target recommendation. Several raw controls are smaller still: catalog facet chips (`components/ExerciseCatalogTaxonomy.tsx:511`), drawer close (`:468`), history filter chips (`components/HistoryBrowser.tsx:155`), and text-only filter actions. Keep the visual treatment compact if desired, but expand the interactive box/pseudo-element to at least 44×44px on touch layouts.

### P2

- `apps/web/components/ExerciseCatalogTaxonomy.tsx:251` — Search progress, result count, and the request error at `:267` update visually but are not exposed as a `status`/live region. Screen-reader users receive no confirmation that filtering started, completed, or failed. Put the non-urgent count/progress in `role="status"` and announce failures with the existing Alert API.
- `apps/web/app/history/page.tsx:14` — History fetches the entire feed, then `components/HistoryBrowser.tsx:193` mounts every matching record and its full set table. The source explicitly identifies the strategy as unbounded. Add server pagination/infinite loading or measured virtualization before large accounts turn this route into a slow, memory-heavy page; preserve the current URL-backed filters.
- `apps/web/components/exercise/specs-panel.tsx:110`, `apps/web/components/AdminExerciseImage.tsx:207` — Exercise images have neither intrinsic `width`/`height` nor a reserved aspect-ratio box, so layout height is unknown until the image loads. Reserve stable space to prevent content shifts; apply intentional lazy loading where the image is below the fold.
- `apps/web/components/HistoryBrowser.tsx:262` — User-facing dates are emitted as raw ISO values. The same occurs in `app/metrics/page.tsx:73`, `app/history/[id]/page.tsx:47`, and `components/exercise/history-panel.tsx:61`. Format date-only values with a shared `Intl.DateTimeFormat` view-model that avoids timezone conversion, so all surfaces use one readable locale-aware convention.
- `apps/web/app/layout.tsx:126` — Browser chrome is always `#09090b` even when the active Skin/Mode is light or uses another base color. Supply light/dark media-aware theme colors (and align manifest colors) so the address/status bar does not visibly contradict the page.
- `apps/web/app/history/page.tsx:27` — Read failures expose backend text or “unknown error” with no local recovery action. The same terminal pattern is repeated across sessions, profile, metrics, exercises, dashboard, and analytics routes. Present stable user-oriented copy and a retry/reload action; log diagnostic detail rather than making it the primary UI message.
- `apps/web/components/SessionCard.tsx:52` — Session names, including user-authored names, are always truncated with no visible way to reveal the full value; the exercise preview is also truncated at `:112`. Prefer wrapping for authored names (consistent with ADR-0085) or provide an accessible, pointer-independent disclosure of the complete text.

### P3

- `apps/web/components/ProfileForm.tsx:94` — Display name omits an autocomplete hint. Add `autoComplete="nickname"` (or the product's chosen compatible identity token) so browsers and assistive input tools can fill it intentionally instead of guessing.
- `apps/web/components/pulse/tab-bar.tsx:47` — Mobile primary-navigation links have active styling but no authored hover/focus-visible treatment. Native focus may remain visible, but a design-system focus ring and subtle hover state would make interaction feedback consistent with the sidebar and shared buttons.

## Positive patterns verified

- Shared fields generate stable IDs, connect labels, hints, errors, `aria-describedby`, and `aria-invalid`; the invalid nested-label issue from the 2026-09-17 audit is resolved.
- Catalog and atlas drawers now have names, explicit close controls, focus entry/containment/restoration, background inertness/scroll locking, overscroll containment, safe-area padding, and reduced-motion handling.
- The shell includes a working skip-to-main contract, distinct navigation landmarks, active-page semantics, safe-area spacing, and responsive sidebar/tab-bar ownership.
- Motion-bearing utilities found in source have same-string reduced-motion fallbacks; the motion, reflow, contrast, chart-value, and accent policies are covered by automated tests.
- Form-draft recovery and dirty-navigation protection cover substantial authoring/correction flows; asynchronous form results commonly use announced Alerts.
- Catalog, Sessions, and History filter state is URL-backed, and catalog requests reject stale responses.
- Charts expose textual values from the plotted rows and are guarded by parity tests.

## Recommended order

1. Correct local-date derivation and mobile control font sizing.
2. Raise touch targets in shared primitives, then sweep raw compact controls.
3. Announce catalog updates/errors and add retryable route error states.
4. Paginate or virtualize History, reserve image dimensions, and centralize date formatting.
5. Retune theme-color metadata, authored-name wrapping, autocomplete, and navigation interaction polish.

After remediation, rerun the current Playwright reflow/wide suites with the repository's expected browser installed, then complete keyboard and screen-reader journeys on at least Safari/VoiceOver and Firefox/NVDA.
