# Layout, scale and contrast validation — v2

Date: 2026-09-27. Spec: [#563](https://github.com/pierrickmartino/workout-manager/issues/563),
part of [#558](https://github.com/pierrickmartino/workout-manager/issues/558).
Current application and static-matrix base: `89d44f25e3bd5b9d93d6a8a6fad86fc4193d3e32`.
This report supersedes [the original validation](ui-layout-validation.md).
It consolidates existing evidence; it does not claim a new browser sweep.

## Evidence and severity

The finite, closed token space makes the [static matrix](../../apps/web/lib/skin-contrast-matrix.ts)
primary contrast evidence. The [pinned complete table](ui-layout-validation-v2-contrast.md)
is generated from the current application base above. Regenerate it offline with
`npm run --silent contrast:report` from `apps/web` on Node 22 or newer.
It enumerates nine ordinary text tokens on three surfaces, five Accent/self-tint
pairings and the primary-button label, including inheritance and System copies.
ADR-0081 enforces a 4.6:1 Contrast Floor; normal-text AA requires 4.5:1.
Pass/fail uses unrounded ratios. Twelve explicit Skin × Mode variants are counted
once per pairing at its worst surface; six authored System Light copies are
checked separately, with System Dark resolving the explicit Dark values.

The static method reproduced the prior browser's magenta/self-tint composite
measurements to two decimal places: **PULSE Light 3.51:1, Vercel Light 3.74:1,
Track Light 3.85:1**. See [the pre-retuning matrix handoff](skin-contrast-matrix-handoff.md).
Browser capture remains corroboration for solid compositing and in-situ views,
and primary evidence for ancestor opacity, which the token matrix cannot model.

[Split-fixture re-validation](ui-layout-revalidation.md), measured against
`d3bf914727d9bd4747a9787714f4f0d6a5cef5f7`, supplies current layout and compositing
evidence: 4,224 unique captures, including 2,304 using production font payloads
and 1,920 paired Fontsource controls. Both engines, all six Skins, both explicit
Modes and both simulated orientations are covered. All paired document-width
deltas are zero. Raw measurements, case identifiers and runner outcomes are
linked there; eleven runner timeouts recovered, none remain unresolved.
The [archived screenshots](ui-layout-validation.md) illustrate the earlier state,
not current palette colours. Original zoom and dataset captures remain historical.

Severity is conformance-first, with reach stated independently:

- **P1:** any established WCAG AA failure; reach identifies affected surfaces,
  palettes and inputs. A header extending beyond a 320px viewport is a Reflow
  failure (SC 1.4.10); enabled normal text below 4.5:1 fails SC 1.4.3.
- **P2:** a defect without an established conformance failure.
- **P3:** usability, legibility or input hardening concern without an established
  conformance failure. Unbroken-name cases alone do not establish ordinary
  spaced-content reflow failure in this evidence.

## Current numbered findings

1. **P2 — Profile numeric values are hard to review.** Reach: populated Profile
   age/height/weight inputs at 320px; original Chromium PULSE Light screenshot
   shows 199.9 clipped although the DOM retains the value. The three-column
   arrangement in `components/ProfileForm.tsx` remains. This is a presentation
   defect; no data change or specific AA failure is established. The split-name
   sweep confirms no document overflow, not that internal clipping is fixed.

2. **P1 — History header action cluster fails Reflow.** Reach: all six Skins and
   both Modes in both engines at 320px portrait, with every split input including
   short names: 24/48 cases per input overflow. Width is 338–340px; landscape
   fits. `components/HistoryBrowser.tsx` supplies the action to
   `components/pulse/page-header.tsx`. This is independent of long names.

3. **P1 — Spaced Exercise names expand creation fieldsets.** Reach: plan-only
   creation fixture, every engine/Skin/Mode/orientation combination, 48/48
   spaced-Exercise cases. Portrait width reaches 789px; unbroken names reach
   1,655–1,848px. `components/HandAuthoredSessionForm.tsx` cannot contain the
   spaced input. Neither long Session-name case overflows. Other builder and
   submission variants are not established by this capture.

4. **P3 — Unbroken Exercise names overflow logging and Live Session.** Reach:
   48/48 cases for each journey, across both engines, all Skins, Modes and
   orientations. Logging reaches 1,397–1,562px and Live Session 1,424–1,589px
   in portrait. Short and spaced Exercise names and both long Session-name cases
   fit. `components/LogSessionForm.tsx` and `components/live-session-sets.tsx`
   need input hardening; spaced-input Reflow failure does not reproduce.

5. **P3 — Unbroken Atlas contributor names crowd counts.** Reach: Atlas drawer,
   all 48 unbroken-Exercise cases; text/count right edge up to 1,540.27px.
   Short and spaced names fit. `components/analytics/atlas-drawer.tsx` contains
   the overflow within a fixed sheet, so document width alone misses it.
   Drawer height remains bounded and vertically scrollable in both orientations.

6. **P3 — Session titles are severely abbreviated.** Reach: Session library's
   320px card layout; archived title preview is “Long w…”, and author text wraps
   into short lines. `components/SessionCard.tsx` truncates beside the sigil and
   Start button. The accessible link name retains the full title. All split
   inputs fit the page; this is recognition/scanability, not page overflow.

7. **P1 — Previous-attempt notes still fail text contrast in completed cards.**
   Reach: Live Session completed-set Previous-attempt note, **28/48** captures
   across the engine/Skin/Mode/orientation matrix; ratios **3.88–7.68:1**.
   Browser ancestor compositing establishes this remaining failure in
   `components/live-session-sets.tsx`; passing tokens alone cannot dismiss it.
   The separate prescription note now passes at **4.91–6.28:1** in all 48 cases
   after #560. These are distinct notes, not disabled input labels.

8. **P3 — Small type remains a legibility concern.** Reach: 9px tab labels in
   `components/pulse/tab-bar.tsx` and 9–11px metadata labels across the sampled
   journeys. Passing contrast does not establish comfortable reading. No AA
   minimum-font-size failure is asserted; this needs usability validation.

9. **P2 — History read and contiguity computation are unbounded.** Reach: every
   caller's history read, growing with all their Logged Sessions and relevant
   Protocol ordering. This is code evidence, independent of local timings:
   [`list_for_user`](../../apps/api/app/repositories/logged_session_repository.py)
   selects owner-scoped rows, orders newest first and calls `.all()` without a
   limit or window. [`read_history`](../../apps/api/app/routes/logs.py) loads the
   entire list, calls `history_correction_verdicts` and serializes every record.
   [`history_correction_verdicts`](../../apps/api/app/logbook/correction.py) loads
   the caller's Protocol orders and evaluates both Delete and Un-complete gates
   per record against the same history on each request (ADR-0034).
   The [History screen](../../apps/web/app/history/page.tsx) passes the full feed
   to client-side Exercise search and Training Type filtering. Pagination,
   windowing or relocating verdict computation needs a separate architectural
   decision that preserves those semantics; this ticket only records the defect.

10. **P2 — History's fetch-strategy comment cited the wrong decision (corrected).**
    Reach: maintainers of `app/history/page.tsx`. ADR-0031 permits plan-less
    Logged Sessions; it does not justify fetching an entire feed. The comment
    now cites ADR-0022 for the server-only transport seam and explicitly describes
    the unbounded fetch as current implementation rather than an ADR requirement.
    No runtime fetching or filtering behavior changed.

## Contrast guard: historical red and current green

Before retuning, the earlier scope had **29 failing pairings (8 flat, 21
composite)**. The widened guard was observed **red** against the original
palette before #561's change, as recorded in the
[Contrast Floor handoff](contrast-floor-handoff.md). The requested 29 is an
incomplete subtotal, not the exhaustive guard's failure count: #559 enumerated
**50 AA failures (18 flat, 32 composite)**. Inherited amber/green in five Light
Skins contributed twenty omitted failures and PULSE Light's primary-button label
one. Enforcement at 4.6 additionally catches values between 4.5 and 4.6 and
checks surface rows and System copies; those counts are not interchangeable.
No red intermediate commit was published.

After #561, the complete static matrix is **green, zero failing pairings**.
The guard in `lib/skin-contrast.test.ts` checks every declared pairing and rejects
unknown colour tokens. This supersedes the archive's Text-Ramp-only nine-test
pass, which could not detect the omitted Accent and composite failures.
Browser corroboration after retuning: 1,728 Accent samples, minimum
**4.60006:1**. PULSE Light cyan `#066d7d` measures **6.01:1 on base,
5.47:1 on elevated, 4.62:1 on elevated tint**. Shared error-feedback token
pairings now pass too; a complete in-situ error-state inventory remains open.

## Large datasets and outstanding validation

Retain the archive's timing tables as single local, unthrottled runs. History
ready times include the inspector's full DOM walk; filter times include
automation. The catalog direct-locator repeat excludes later colour inspection
and is not directly comparable. Nothing supports a performance threshold or
production performance failure. These timings carry **no defect severity**;
finding 9 rests on code. No pagination or performance fix is included.

Outstanding: complete **hover/focus/error state inventory**, authenticated
full-stack journeys, physical iOS/Android rotation, installed-app safe areas,
real Safari browser zoom, and composited visual backgrounds (gradients, images,
filters, backdrop blur and blend modes). Dark-mode browser zoom, text-only zoom,
builder variants and author-and-log submission are also unvalidated. Simulated
orientations and DOM activation of completed cards do not establish physical
rotation or landscape pointer access. The 160px combined zoom stress case exceeds
the ordinary 320px Reflow check and is not itself a WCAG verdict.

## Changelog: original → v2

The archive and raw evidence remain intact so earlier measurements are interpretable.

- Original mixed-fixture PULSE Light portrait widths: Profile 320px, Session
  library 320px, History 338px, Catalog 320px, creation 1,655px, logging 1,397px,
  Live Session 1,424px, closed Analytics 320px. These were page maxima with spaced
  and unbroken names mounted together, not attributable input measurements.
  Split fixtures confirm the same PULSE unbroken widths and isolate creation's
  spaced case at 789px. Cross-Skin maxima differ by typography; paired production
  fonts cause zero document-width changes.
- Original P2 History becomes P1 Reflow. The combined P2 long-name finding splits
  into P1 creation and P3 logging/Live hardening; P2 Atlas becomes P3. Session
  title abbreviation stays P3. Small type becomes numbered P3 rather than prose.
- Original PULSE Light button **3.75:1**, selected chip about **3.12:1**, and
  cyan base/elevated/tint **3.75/3.41/2.97:1** are historical failures. Shared
  error examples **3.51/3.74/3.85:1** were rated P2; under the defined scale they
  were P1. Retuning resolves these token pairings; the static matrix replaces
  sampled browser counts as primary evidence.
- Original completed prescription note **3.33–4.23:1** across twelve palettes
  is superseded by **4.91–6.28:1** after removing the card fade. The separate
  Previous-attempt note remains a numbered P1 finding.
- Original Text Ramp minima (Dark/Light): PULSE **4.64/4.66**, Aurora
  **4.64/4.61**, Vercel **4.65/4.62**, Alpine **4.85/4.81**, Clay **4.88/4.81**,
  Track **4.61/5.25**. They were valid for their restricted scope, not evidence
  that every text pairing passed. Original 732 captures were overlapping,
  not independent journeys; v2 points to the complete split-fixture counts.
- The old timing-based P2 profiling paragraph is replaced by unrated local
  observations and code-sourced P2 finding 9. Timing tables remain archived,
  including the superseded 19.8-second catalog automation measurement.

## Implementation handoff

Issue #563; branch `main`; base `89d44f25e3bd5b9d93d6a8a6fad86fc4193d3e32`.
Session: current GPT-6 Codex model, implementation and independent review axes.
Changes: this report, its generated static table, the archive's supersession link,
and the History page comment. No behavior changed, so no new behavioral test seam
or browser sweep was needed.

Validation on Node 22.23.3: `npx tsc --noEmit --incremental false` passes;
`node --test lib/skin-contrast.test.ts lib/skin-contrast-matrix.test.ts lib/wcag-contrast.test.ts`
passes all 22 tests; `node --test --experimental-test-module-mocks` passes the full
frontend suite (1,293 tests, zero failures/skips). Static report: zero failing
pairings. `git diff --check` passes. Remaining risks and validation are listed
above; runtime layout and Previous-attempt note fixes are separate tickets.

Code-review result against the fixed base and #563: **Standards — zero findings;
Spec — zero findings**. Independent reviewers confirmed the severity/reach
inventory, source citations, evidence limits and 29-versus-50 explanation.
