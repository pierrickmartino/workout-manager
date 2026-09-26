# Keyboard and screen-reader journey validation

Date: 2026-09-26. Source: [UI/UX audit follow-up 2](../ui-ux-audit.md#follow-up-validation).
Scope agreed with the user through the grilling workflow. No separate GitHub issue supplied.
Base commit: `671aa51ecc1d374983e21bba1592a3f20e5be85b`. Session: Codex; documentation and guided validation only.

## Method and acceptance

Run every journey separately with keyboard-only Chromium and Safari + VoiceOver.
Use Tab/Shift+Tab, Enter/Space and Escape in the keyboard run; use VoiceOver navigation
as well as focus navigation in the screen-reader run. Enable Safari's keyboard navigation
setting so Tab reaches all controls; record that setting. Record OS, browser and VoiceOver
versions, environment URL, test date, and account role. Do not record credentials or private
profile data. Use a dedicated test account and disposable Sessions/Logged Sessions for writes.

A pass requires reachable actions, visible and predictable focus, meaningful control names,
associated hints/errors, understandable result feedback, and retained input after failures.
For VoiceOver, record what was actually spoken and its order, including duplicate or omitted
messages. Automated DOM/accessibility-tree checks do not establish spoken behavior.
Use **pass**, **fail**, **untested**, or **blocked** per browser and case. A journey passes
only when all its required cases pass. Unavailable authentication, generation or failure
fixtures leave the affected cases blocked; they do not count as passes.

Environment URL: pending. OS/version: pending. Safari/version: pending.
VoiceOver/version: pending. Chromium/browser/version: pending. Account role: pending.
Safari keyboard navigation setting: pending.

## Journeys

All runtime cases below are **untested** in both combinations. Run normal cases first,
then failures using a controlled test environment. Do not interrupt a shared backend to
simulate failures. Record the failure mechanism; offline mode alone may not interrupt
server-side API calls. If no safe mechanism exists, mark that case blocked.

| ID | Steps | Expected behavior |
| --- | --- | --- |
| AUTH-1 | Signed out, open `/`; reach and activate sign-in by keyboard. Navigate all available credential, provider and verification controls. Submit an invalid credential, then sign in successfully. | Entry label explains authentication; controls and errors are understandable; focus is visible; successful sign-in reaches the intended destination. Follow the configured Clerk flow without recording secrets. |
| AUTH-2 | Open a protected route while signed out. Complete sign-in. Separately reopen the sign-in modal and dismiss it using Escape and its close control when available. | Intended protected destination is preserved. Modal focus enters and remains inside; background is unavailable; dismissal restores focus to the opener. If a method is unsupported, record its observed behavior. |
| CAT-1 | Open `/exercises`; navigate search, filters and results. Open an Exercise drawer; traverse it forward/backward, read its title/content, close with Escape, reopen and close using Close. | Dialog announces the Exercise name; focus enters, stays contained and returns to its invoking result. Background cannot be focused or read as active modal content. All content and Close are reachable. |
| PROF-1 | In Profile editing and onboarding, read labels/hints. Enter Age `151` and Height `0`; submit twice. Correct both and submit valid values. | Failure is announced; first invalid control receives focus and exposes its error; Height exposes its own error. Repeated failure remains understandable and values remain. Successful save removes stale errors and reaches the expected destination with understandable feedback. |
| PROF-2 | Make profile submission fail using a controlled API/transport failure; submit valid values twice, then retry successfully. | Summary is focused and announced; values remain editable; no duplicate write or misleading success; recovery works. |
| BUILD-1 | At `/sessions/build`, name a disposable Session, add at least two Exercises, edit prescription Quantity/Load/rest, reorder via buttons, group/ungroup where offered, and remove a prescription. Attempt departure and cancel; save. | All editing works without dragging; repeated controls identify the relevant prescription; order/group changes are understandable. Departure dialog contains/restores focus. Save reaches Session detail with clear completion and usable focus. |
| LOG-1 | At `/sessions/log`, author a disposable Session and its first performance; edit performed values, trigger validation, correct and save. | Prescription and performed-value controls remain distinguishable. Errors identify corrective action; values remain. Successful save reaches History and the new Logged Session is discoverable. |
| GEN-1 | At `/sessions/new`, read field hints, including Equipment and its preset button; submit invalid input, correct and generate a Session. Exercise a controlled generation failure and retry. | Fields/preset have separate names; validation is understandable; progress and completion/failure are announced without excessive repetition. Result is reachable; failure retains useful inputs and permits retry. |
| SAVE-1 | For Session authoring and metric recording, submit invalid values where applicable; force a controlled save failure, then retry successfully. | Errors are associated or an accessible summary receives focus; values remain; failures and successful results are understandable. Record redirect destination and focus after navigation, or actual inline announcement. |
| DEL-1 | Delete a disposable Logged Session: cancel native confirmation, then confirm. Separately force deletion failure and retry. | Confirmation is understandable and keyboard operable; cancellation retains the record and restores usable focus. Failure is announced and record remains. Success removes only the intended record and leaves focus in a useful location. |
| DEL-2 | Delete an unperformed disposable standalone Session from detail and library separately; cancel, confirm, and exercise a controlled failure. Inspect a Session with a Logged Session and a deletion-disabled Logged Session where a fixture exists. | Inline confirmation and cancellation are reachable; failure is announced; success navigation or disappearing row leaves useful focus and clear feedback. Unavailable deletion has an understandable explanation. No Protocol or performed Session is deleted. |

## Evidence record

Copy one record for each case/combination; split success, validation, cancellation and
failure/retry cases when results differ.

```text
Case ID / variant:
Browser + assistive technology / versions:
Date / environment / fixture:
Result: untested
Steps actually executed:
Expected:
Observed focus and visible behavior:
Actual spoken words and order (VoiceOver):
Failure simulation (if any):
Finding / severity / reproduction:
```

No runtime findings have been recorded yet. P1 = access barrier, work loss or incorrect
feedback; P2 = meaningful usability/resilience issue; P3 = polish/consistency. Findings
must distinguish reproduction from source-inferred risks. Fixes are a subsequent agreed task.

## Handoff and supporting evidence

Existing source/DOM evidence: [form accessibility handoff](form-accessibility-handoff.md)
and the audit's priority 1 implementation follow-up. No automated tests were run in this
documentation session. Existing tests are supporting evidence, not runtime results.

Relevant decisions: ADR-0027 (keyboard editing controls), ADR-0034 (record deletion gates),
ADR-0040 (Hand-Authored Session), ADR-0042 (read-only Catalog), ADR-0063 (standalone Session
deletion), ADR-0071 (creation intents). No behavior or domain decisions changed.
Documentation diff reviewed against `REVIEW.md`; plan/record separation and deletion gates
remain reflected in the expectations. Outstanding: every runtime case above, versions,
environment readiness, failure fixtures, and observed announcements.
