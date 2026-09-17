# UI/UX audit — Web Interface Guidelines

Date: 2026-09-17. Scope: application shell, shared UI primitives, training creation/execution, exercise catalog, analytics, history, profile, and administrative controls.

Method: static source inspection using the freshly retrieved [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md). This report extends the [navigation review](navigation-review.md). Findings are grouped by file, with repository-relative `file:line` references. No UI code was changed. Browser, screen-reader, contrast, performance, and device testing were not performed; this is not a conformance certification.

**Priority:** P1 = address first: access barriers, work loss, or incorrect feedback. P2 = meaningful usability/resilience issue. P3 = polish or consistency. Items marked **validate** are risks inferred from source, not reproduced visual defects.

## Shared fields — `apps/web/components/pulse/field.tsx`

- `apps/web/components/pulse/field.tsx:24` — **P1:** Default wrapper is `<label>`, but its child `Label` also renders `<label>` (`apps/web/components/ui/label.tsx:13`). This creates invalid nested labels throughout forms. Use one label associated with a stable input ID; render a span for text inside a wrapping label.
- `apps/web/components/EquipmentField.tsx:35` — **P2:** The default Field wrapper encloses both an input and preset button, putting multiple labelable controls inside one label. Use an explicit label/input association and keep the preset button outside it.
- `apps/web/components/pulse/field.tsx:30` — **P2:** Helper text has no ID/`aria-describedby` association. Expose a hint ID and connect it to the control so instructions are available when the control receives focus.

## Status feedback — `apps/web/components/pulse/alert.tsx`

- `apps/web/components/pulse/alert.tsx:28` — **P1:** Alert has no default announcement semantics despite being used for asynchronous form results. `RecordMetricForm.tsx:28` and `ProfileForm.tsx:38` do not supply them. Add appropriate status/error semantics at dynamic call sites or through an explicit component API; avoid announcing every static page message as urgent.
- `apps/web/components/DeleteLogControl.tsx:47` — **P2:** A failed deletion renders a plain span without live feedback. Announce the failure while retaining its visible inline explanation.

## Profile and metric forms

- `apps/web/components/ProfileForm.tsx:38` — **P2:** Server validation is a single message above a long form, without field association or focus management. Return field-specific errors, connect descriptions, and focus the first invalid control or an accessible error summary after failure.
- `apps/web/components/ProfileForm.tsx:41` — **P3:** Display name has no autocomplete intent. Supply an appropriate token such as `nickname`; set intentional autocomplete behavior for other fields rather than leaving browser heuristics to guess.
- `apps/web/components/ProfileForm.tsx:55` — **P2, validate:** Age, height, and weight always share three columns. Test narrow screens, larger text, and long numeric values; collapse to fewer columns where labels or values become cramped.
- `apps/web/components/RecordMetricForm.tsx:28` — **P2:** Success and error messages appear above the inputs, with no explicit association to the submitted value. Combine announced results with field-level validation and retain entered values on failure.

## Exercise catalog — `apps/web/components/ExerciseCatalogTaxonomy.tsx`

- `apps/web/components/ExerciseCatalogTaxonomy.tsx:95` — **P1:** Debouncing cancels pending timers but does not invalidate requests already running. An older filter response can overwrite newer results and errors. Check a request sequence/filter key before committing results; `ExerciseLibrary.tsx:61` already demonstrates a stale-result guard.
- `apps/web/components/ExerciseCatalogTaxonomy.tsx:70` — **P2:** Filters initialize from URL-derived props but interactive changes do not update the URL. Refreshing or sharing loses the current view. Serialize stable filters and restore them on navigation.
- `apps/web/components/ExerciseCatalogTaxonomy.tsx:405` — **P1:** Detail drawer lacks focus entry, containment, restoration, and background inertness. An Escape handler and labeled Close button exist; preserve them while completing modal behavior. Prefer a tested dialog primitive.
- `apps/web/components/ExerciseCatalogTaxonomy.tsx:419` — **P1:** Dialog has no accessible name. Connect `aria-labelledby` to the displayed exercise title.
- `apps/web/components/ExerciseCatalogTaxonomy.tsx:422` — **P2:** Scrollable drawer has no overscroll containment or safe-area padding. Prevent scrolling from spilling into the page and keep controls clear of device insets.
- `apps/web/components/ExerciseCatalogTaxonomy.tsx:410` — **P2:** Drawer opacity/slide transitions have no reduced-motion alternative. Disable spatial movement when reduced motion is requested.

## Muscle atlas — `apps/web/components/analytics/muscle-atlas.tsx`

- `apps/web/components/analytics/muscle-atlas.tsx:204` — **P1:** Drawer moves focus into the sheet but neither traps it nor restores it to the invoking region; `inert={!open}` only affects the closed sheet, not background content. Complete the focus lifecycle and make background controls unavailable while open.
- `apps/web/components/analytics/muscle-atlas.tsx:232` — **P1:** No explicit Close button is rendered inside the modal. Dismissal depends on the backdrop or Escape, making it difficult for touch screen-reader users. Add a labeled, reachable close control.
- `apps/web/components/analytics/muscle-atlas.tsx:240` — **P2, validate:** Fixed sheet has no maximum height or internal scrolling, while contributing exercises are an unbounded list. Large results can extend above the viewport. Add a viewport-relative height limit, internal scrolling, overscroll containment, and safe-area spacing.
- `apps/web/components/analytics/muscle-atlas.tsx:240` — **P2:** Slide transition lacks a reduced-motion alternative.

## Session library — `apps/web/components/SessionsLibrary.tsx`

- `apps/web/components/SessionsLibrary.tsx:249` — **P1:** Session link removes the focus outline without a replacement. Add a visible focus ring or card-level focus-within styling.
- `apps/web/components/SessionsLibrary.tsx:47` — **P2:** Search and selected chips are local-only; preserve them in the URL so returning to the library restores context.
- `apps/web/components/SessionsLibrary.tsx:249` — **P2, validate:** Flexible link/title sits beside nonshrinking metadata without `min-w-0` or a long-name wrapping strategy. Test long session/author names at narrow widths and 200% zoom; stack metadata or allow controlled wrapping.
- `apps/web/components/SessionsLibrary.tsx:341` — **P2, validate:** Favorite has only a 16px icon plus `p-0.5`, producing a nominal 20px box. Increase its hit area without nesting it inside the session link. Measure surrounding spacing before making a formal target-size compliance claim.

## Form continuity — `apps/web/components/HandAuthoredSessionForm.tsx`

- `apps/web/components/HandAuthoredSessionForm.tsx:249` — **P1:** Substantial workout drafts live in component state with no persistence or dirty-navigation guard. A tab switch can discard entered work. Preserve a scoped draft or guard departures; cover both client navigation and browser exits.
- `apps/web/components/AdhocLogForm.tsx:46` and `apps/web/components/CorrectLogForm.tsx:199` — **P1:** The same draft-loss risk affects new log rows and correction rows. Live-session persistence already exists and should remain separate from these unsaved forms.

## Loading and progress

- `apps/web/components/GenerationProgress.tsx:18` — **P2:** Spinner and the infinite sweep at line 31 have no reduced-motion variant. Keep the textual live status and provide a static/reduced indicator.
- `apps/web/components/pulse/skeleton.tsx:18` — **P2:** Shared skeleton always pulses; no global reduced-motion override was found. Add a motion-reduce variant at this shared primitive.
- `apps/web/components/pulse/segmented-bar.tsx:38` — **P2:** Progressbar exposes values but no accessible name, and its API offers no naming prop. Allow `aria-label` or `aria-labelledby` to identify what completion represents.

## Exercise imagery

- `apps/web/components/exercise/specs-panel.tsx:107` — **P2:** Image has no intrinsic dimensions or reserved aspect ratio; `max-height` alone does not reserve the loaded height. Supply dimensions or an aspect-ratio wrapper to avoid content jumps. Choose lazy loading when the image is below the fold.
- `apps/web/components/AdminExerciseImage.tsx:207` — **P2:** Preview image has the same missing-space-reservation issue. Reserve its dimensions before the request completes.

## Shell, orientation, and theme

- `apps/web/app/layout.tsx:158` — **P2:** Repeated header/navigation has no skip-to-main link. Add a focus-visible shortcut and an ID on main content; label the two navigation landmarks distinctly.
- `apps/web/components/pulse/tab-bar.tsx:46` — **P2:** Fixed bottom bar uses a constant bottom padding without safe-area insets. Pair inset-aware padding with sufficient main-content clearance; verify on installed iOS and Android apps.
- `apps/web/components/pulse/tab-bar.tsx:20` — **P3:** `/logs/new` and `/admin/**` have no active tab. Associate them with Stats and Profile respectively, or show another clear location indicator.
- `apps/web/components/pulse/tab-bar.tsx:60` — **P3:** Tab links provide active-state styling but no explicit hover treatment. Add subtle hover feedback while retaining visible keyboard focus.
- `apps/web/app/layout.tsx:118` — **P3:** Browser theme color is fixed to a dark value even when the selected skin/mode changes the page background. Resolve browser chrome color consistently with the displayed theme; coordinate the PWA manifest colors.

## Entry content and recovery

- `apps/web/app/page.tsx:23` — **P3:** Welcome copy explains token/cookie storage instead of helping users choose their next action. Replace implementation detail with a concise benefit or instruction.
- `apps/web/app/page.tsx:48` — **P2:** “Initiate session” opens authentication but can be read as starting a workout in this app. Use “Sign in” or another explicit authentication label.
- `apps/web/app/dashboard/page.tsx:37` — **P2:** Failed reads expose a generic error with no local retry. Provide a recovery action and a user-oriented explanation; apply the pattern to analytics failures too.
- `apps/web/app/protocols/[id]/page.tsx:130` — **P1:** Generated protocol schedule cards do not open or start sessions. Add session-detail links and a primary Start action for Next up. See the navigation report for launch budgets and return-path fixes.

## Dates and large datasets

- `apps/web/app/metrics/page.tsx:68` — **P3:** Visible dates render the raw `recorded_on` value. Format date-only values for the reader’s locale without introducing timezone shifts.
- `apps/web/components/HistoryBrowser.tsx:194` — **P2, validate:** History filters an already-fetched record feed and renders matching records without windowing. Profile large histories before choosing pagination, virtualization, or deferred offscreen rendering; no performance measurements were made.

## Positive patterns verified in source

- Shared Button/Input/Select/Textarea primitives have explicit focus styling; native selects specify themed foreground/background colors.
- HTML viewport allows zoom, and CSS sets native color-scheme according to mode.
- Delete-log actions require confirmation and explain disabled deletion states.
- Generation and synchronization status use live regions; extend that pattern to form results.
- Exercise images have meaningful alternative text.
- Volume/distance chart animations are disabled, avoiding unnecessary animated data transitions.
- ExerciseLibrary rejects superseded search results; apply the same protection to catalog filtering.
- Prescription controls include labeled move-up/down actions, providing an alternative to drag gestures.
- Overflow actions use native details/summary disclosure; navigation primarily uses real links.

## Follow-up validation

1. Fix shared labels, announcements, modal focus, catalog response ordering, and draft protection first. Add focused regression checks for those behaviors.
2. Test keyboard-only and screen-reader journeys through sign-in, catalog drawers, profile validation, workout creation, and save/delete feedback.
3. Inspect 320px-wide layouts, 200% zoom, long names, large datasets, and both device orientations. Measure contrast across all skins/modes; muted small text needs particular attention, but contrast failure is not asserted here.
4. Test reduced motion, offline/slow responses, request reordering, refresh/back navigation, and installed-app safe areas.
5. Validate chart keyboard/screen-reader access and equivalent access to plotted values. Library behavior was not assumed to provide or omit this automatically.

No automated application tests were run for this documentation-only audit. Runtime checks above remain outstanding; source evidence and inferred risks are distinguished throughout.
