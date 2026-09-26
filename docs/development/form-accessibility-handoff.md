# Form accessibility handoff — 26 September 2026

Spec: [audit item 5](../research/audit/2026-09-24.md), “Fix shared field associations and profile error focus”. No GitHub issue was created by this task.

Base commit: `a3437f709454e572aa7117b8e478ae6bf03532ad`. Implementation: current Codex GPT-6 session; changes remain uncommitted. Relevant decision: ADR-0019; no domain or architectural decision changed.

Shared Field/FieldLabel now associate one explicit label with their control and associate hints/errors without replacing existing descriptions. Shared Alert supplies announcement roles. Profile server validation supplies targeted numeric errors; the form focuses the first invalid control, or its summary for API/transport failures, and restores attempted values after React resets an action form. The test-only jsdom dependency permits real React DOM submission/focus tests in the offline Node runner.

Verification commands from `apps/web` (Node 24.11.0 locally; CI uses Node 22):

- `node --test --experimental-test-module-mocks` — all 1,269 frontend tests passed.
- `node --test lib/form-accessibility.test.ts lib/profile-validation.test.ts` — all 8 focused tests passed: rendered markup, repeated failed submissions, retained input, announcement roles, focus, server validation, and API/transport errors. Rerun after the final addition of Next's `unstable_rethrow` to preserve framework navigation signals while handling transport failures.
- `./node_modules/.bin/tsc --noEmit` — passed after the final code change.

Reviewed against REVIEW.md: no plan/record, generation/cache, persistence, terminology, authorization, or redirect-boundary changes. The required security reviewer found no blockers. Submitted values stay in component memory, with no logging or new persistent storage.

Manual screen-reader validation is pending; automated DOM tests cannot establish spoken announcement order. To complete acceptance:

1. Open onboarding and Profile editing with VoiceOver/Safari or NVDA/Firefox; record browser and reader versions.
2. Tab through the form. Each control should announce its label once. Default rest timer should announce the associated “Leave blank…” hint. Also check Equipment in a generation form: its bodyweight hint belongs to the input, and the preset button keeps its own name.
3. Enter Age `151` and Height `0`, then submit by keyboard. Verify the dynamic failure summary is announced, focus moves to Age, and its label, invalid state, and correction text are spoken. Tab to Height and verify its correction text.
4. Submit the same invalid values again. Verify focus returns to Age and input remains available for correction. Correct both fields and confirm stale invalid attributes disappear after the next submission.
5. Make the profile API unavailable and submit valid values. Verify the summary receives focus and its failure text is announced; values remain available for retry. Repeat the failure.
6. Save successfully and verify onboarding/editing navigation still returns to the intended destination.

Record the actual spoken order and any duplicate or omitted announcements here before marking the manual criterion complete.
