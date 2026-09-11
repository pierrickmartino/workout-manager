# Workout Manager — Recommendations for future improvements

Prepared: 11 September 2026.

## Overall recommendation

Make PULSE exceptionally dependable at three things: **knowing what to do next, recording what actually happened, and explaining progress accurately**. Build its visual identity around that experience. Expand into more ambitious features once the core journey is easy to understand and difficult to lose.

The next release should combine reliability work with visible usability gains: resilient session completion, clear measurements, responsive forms, accessible feedback, and a shorter path to Start, Save, and Edit. A small set of distinctive workout covers and completion cards can give that release personality. A broad collection of skins should follow a stable shared component system.

This is a product and engineering recommendation document, not a record of approved implementation work. Priorities express my judgment; effort and delivery dates require scoping.

## Evidence and scope

This document draws on the local application source, [domain glossary](../../CONTEXT.md), architecture decisions, [feature-gap history](../pulse-feature-gap.md), and the 12 screenshots previously reviewed. It complements:

- [UI/UX review](polish-ui-ux-review.md): screen-specific findings and acceptance checks.
- [Creative directions](pulse-creative-directions.md): signature experiences and researched component resources.
- [Skin ideas](pulse-skin-ideas.md): additional visual identities and theme infrastructure.

The source and screenshots represent different states. For example, the screenshots show light mode and named skins, while this checkout's stylesheet implements one dark appearance. Do not treat screenshot features as verified source capabilities or assume every historical gap remains open.

Recommendations use three evidence levels: **observed** in the inspected source or screenshots; **documented** in a project decision; and **proposed** as a future improvement. Runtime failure scenarios below require reproduction. No production behavior, performance baseline, or security audit was verified during this documentation task.

## Foundations worth preserving

The application has more substance than a typical generated workout interface. Preserve these strengths:

- **Plans and records are separate.** A prescribed Session and a Logged Session are different things; changing a plan must not rewrite past performance.
- **Load and Quantity are typed.** Repetitions, duration, distance, bodyweight, and qualitative prescriptions retain their meanings.
- **Protocols are self-paced sequences.** Next means next in order, not an invented calendar obligation.
- **Derived progress comes from the record.** XP, achievements, and personal records can be recomputed after permitted corrections.
- **Generation has explicit boundaries.** Cached generated artifacts are adopted into user-owned copies, with constraint-aware handling.
- **The core has tests and architecture decisions.** Build on the existing domain and repository seams rather than replacing them with UI-specific calculations.

The glossary deliberately reserves Protocol, Session, and Logged Session. Earlier creative documents suggested simpler wording as a design experiment. Treat any naming change as a product decision that updates the glossary, UI, and terminology checks together. In the meantime, add brief explanations beside unfamiliar terms rather than renaming concepts inconsistently.

## Priority map

| Priority | Workstream | Outcome | Main dependency |
| --- | --- | --- | --- |
| First | Resilient session completion and draft recovery | Entered work survives interruption; retries do not duplicate records | Save protocol and recovery-state design |
| First | Measurement and chart correctness | Users understand every displayed result | Shared formatting and comparison definitions |
| First | Responsive forms and accessibility | Core tasks work on narrow screens, keyboard, and assistive technology | Shared-component fixes and rendered checks |
| Next | Faster training and editing flows | Less navigation and repeated entry | Clear action hierarchy and persisted context |
| Next | Catalog and equipment quality | Better search, substitutions, and analytics coverage | Canonical vocabulary and stewardship |
| Next | User data export and deletion | Users can retrieve and remove their information | Cross-store lifecycle design |
| Next | CI and operational visibility | Regressions and failing jobs are easier to detect | Reliable fixtures and structured events |
| Then | Distinctive visual identity and selected skins | A recognizable, coherent PULSE experience | Semantic tokens and stable components |
| Explore | Protocol switching, synchronization, integrations | Broader usefulness with explicit domain rules | New decisions and demonstrated user demand |

## 1. Make live-session completion resilient

### Preserve recoverable work until the result is known

**Observed:** [LiveSessionScreen.tsx](../../apps/web/components/LiveSessionScreen.tsx) clears the local slot before invoking `finishLiveSession`, then rewrites the snapshot when a returned error is handled. This supports the redirect path, but creates a period when the recovery copy is absent.

**Recommendation:** Reproduce closing the tab, killing the app, and losing the connection between clearing the slot and receiving the result. Replace the transient gap with an explicit state such as `recording → submitting → saved`, retaining enough information to reconcile an interrupted submission.

Do not simply preserve a stale recording forever: distinguish a completed save from one whose outcome is unknown, so reopening does not encourage submitting the same performance twice.

### Give retries a stable identity

**Proposed:** Assign a performance identifier when a Live Session begins. Keep that identity across retries. Have the server return the existing result for the same accepted submission; reject incompatible reuse rather than silently combining different payloads.

Idempotency here is a recommendation, not a claim that all write paths were audited and lack it. Check the whole save path before choosing where to enforce it.

**Acceptance checks:**

- A connection fails before the server commits: recovery offers a safe retry.
- The server commits but the response is lost: retry resolves to the same Logged Session.
- A double press or two concurrent requests do not create two records.
- The process stops during submission: reopening explains the pending/unknown outcome.
- A successful save followed by failed navigation still provides a route to the saved record.
- Completed and Incomplete outcomes retain their existing advancement rules.

### Handle storage failure explicitly

**Observed:** [live-session-storage.ts](../../apps/web/lib/live-session-storage.ts) handles malformed JSON, but storage access and writes are direct. Browser storage denial or quota failures warrant separate handling.

Provide a visible “Progress cannot be saved on this device” state if persistence is unavailable. Keep in-memory entry usable where possible, but do not imply crash recovery works. Add versioned validation and deliberate migration rules for future stored-state changes.

Audit shared-device/account transitions and multiple tabs. Do not resume one account's unfinished work under another account or let two tabs silently overwrite each other's active state. Preserve the limited local payload described by [ADR-0035](../adr/0035-live-session-slot-is-non-sensitive-untrusted-and-unencrypted.md).

## 2. Protect editing work, not just live workouts

**Observed:** The Protocol Builder stages edits locally; navigating away discards that draft. Long configuration tasks deserve recovery too.

Add a draft identifier, a last-saved indicator, and a clear distinction between “Draft saved” and “Changes deployed.” Bind the draft to the relevant account and Protocol revision. If the Protocol changes while the draft is open, show the conflict and preserve the user's work instead of blindly overwriting a newer state.

Use unsaved-change warnings where persistence is unavailable. Offer Undo for removing an exercise or changing grouping. Avoid a confirmation dialog for every reversible click.

**Acceptance:** Editing a long Session, refreshing, navigating away, or encountering a failed deploy preserves recoverable input. A successful Deploy remains atomic and respects the frozen performed prefix.

## 3. Make every metric understandable and reproducible

**Observed in the board:** The volume chart's tick order is inconsistent; several charts omit units; strength values and record annotations do not identify their measurement basis clearly. These are high-priority presentation findings, not proof that the underlying domain formulas are incorrect.

Create shared display rules for every metric:

| Metric | Required context |
| --- | --- |
| Repetition result | Repetition count and applicable Load kind/value |
| Timed result | Duration and unit; no ambiguous multiplication sign |
| Distance result | Distance unit and accompanying duration when available |
| Estimated 1RM | Explicit estimate label, applicable exercise, and qualifying source performance |
| Volume | Definition, unit, aggregation interval, and supported-data coverage |
| Change | Earlier value, later value, comparison period, and comparable conditions |
| Muscle coverage | Time range, mapped activity definition, and unclassified data |

Reuse the backend's typed domain logic. Do not independently reconstruct strength estimates or load resolution in each chart component.

Allow users to inspect the Logged Sessions behind a result. Use “Insufficient comparable data” when appropriate. Preserve the distinction between missing data and zero. A changed profile weight must not silently rewrite the historical bodyweight basis of a record.

**Acceptance:** A small known fixture produces matching table, chart, header, and record-feed values. Include timed holds, distance, qualitative Load, missing bodyweight, backdated logs, and corrected records.

## 4. Shorten the repeated training journey

Make the app easiest to use when someone is already at the gym:

- Put Start near the Session title and keep the next exercise/set evident during training.
- Keep the currently editable set prominent; collapse completed detail without hiding its correction path.
- Offer previous-performance values as clearly labeled suggestions, not silently accepted actual results.
- Preserve search text, filters, selected exercise, and scroll position when returning from details.
- Use appropriate numeric keyboards and visible units; avoid forcing users to type unit strings.
- Show Superset membership and round-rest boundaries as one coherent group.
- Keep frequent actions clear of the bottom navigation and software keyboard.

**Proposed test:** Ask users to start the Next Session, complete a set, adjust rest, substitute an unavailable exercise, finish Incomplete, and find the saved record. Watch where they hesitate or misunderstand what will be recorded. Prioritize those problems over adding shortcuts to already-clear actions.

## 5. Explain the self-paced model at the point of decision

The current domain contains important behaviors that users should not have to discover by accident:

- Only a Completed Logged Session advances a Protocol; an Incomplete one leaves the same Session next.
- Generating a new Protocol sets the previous one aside.
- Some log deletions or outcome changes are blocked because they would create a gap in the performed sequence.
- Correcting or deleting permitted records can change derived XP, achievements, and personal records.

Use brief, contextual explanations before consequential actions and alongside refusals. A blocked correction should identify the affected later Session and offer navigation to it, without encouraging users to delete valid history merely to satisfy ordering.

**Sources:** [Completion outcomes](../adr/0013-completion-outcome-gates-protocol-advancement.md), [log correction](../adr/0034-logged-sessions-are-correctable-within-a-gap-free-performed-sequence.md), and [superseding a Protocol](../adr/0037-moving-on-from-a-protocol-is-supersede-not-deletion.md).

## 6. Improve first use and progressive disclosure

Let a new user choose a clear intent: generate a Protocol, create a Session, or log something already performed. Request the information necessary for that action, with optional profile detail available later.

Explain fitness ratings with concrete anchors if retaining a 1–10 scale. Equipment selection should use the catalog's canonical vocabulary. Put essential guidance outside placeholders so it remains visible after entry.

Give empty states a real next step: no Sessions → create one; no metrics → record a reading; no matching exercises → clear filters or create a custom entry. Do not populate an empty account with fictional performance figures to make the dashboard look finished.

Explain the effect of profile constraints on generation in product language. This recommendation concerns communication and data flow; it does not propose clinical advice or a numeric readiness score.

## 7. Treat catalog quality as a product feature

Catalog quality influences search, substitutions, explanations, and analytics. It deserves an explicit workflow.

### Normalize names and equipment

Use canonical display names with searchable aliases. Review apparent duplicates such as singular/plural equipment names and exercise names with reversed word order. Distinguish genuinely different Variations from alternate names for the same Exercise.

A catalog merge must preserve existing references and provenance. If a merge changes which performances are compared, make that effect deliberate and testable. Do not automatically merge ambiguous exercises based on string similarity alone.

### Improve classification and instructions

Prioritize frequently used Exercises with missing muscle mappings or unclear Execution Steps. Keep an explicit unclassified bucket in analytics until mapping is resolved. Use original illustrations or appropriately sourced media where they materially improve comprehension.

### Give users a correction channel

Provide structured reports such as “Wrong equipment,” “Duplicate,” or “Unclear steps.” Route them to a review queue with the affected Exercise and enough context to investigate. Keep user reports distinct from validated catalog changes.

**Acceptance:** Search finds aliases, equipment filters behave consistently, and corrections improve catalog coverage without rewriting settled performance facts.

## 8. Make generated content inspectable and generation recoverable

The project already has async generation and operational usage monitoring. Extend the experience around them:

- Show the requested scope and constraints before generation.
- Show real job states and a useful retry path after failure.
- Preserve the result when a user leaves and returns.
- Explain a Substitution in terms of equipment, related movement, or supported goal context.
- When available, summarize the main differences before committing a regeneration or deploy.
- Avoid invented progress percentages or claims about reasoning stages the worker does not report.

Build an evaluation set around schema validity, constraint handling, equipment compatibility, valid quantities, and reproducibility of downstream parsing. Separate these from subjective usefulness ratings. A new provider or prompt should be evaluated against the same cases before broader rollout.

Connect user feedback to generation lineage carefully. [ADR-0039](../adr/0039-ai-usage-monitoring-via-self-hosted-langfuse.md) already records trace lineage and defers feedback-to-score mapping. Cached artifacts may have many adopters, so one person's feedback should not become an unexplained universal score.

## 9. Complete user control over data

**Documented:** ADR-0039 includes trace erasure capability and a retention policy, while deferring the whole-account deletion trigger and application-data cascade.

Build a coherent user-facing export and deletion flow. An export should distinguish Protocols, Sessions, Logged Sessions, Logged Sets, metrics, and relevant units. Include a schema version and a readable format; do not flatten typed data into ambiguous text.

For deletion, map the full lifecycle across identity, database records, generated user-owned copies, telemetry, local recovery state, and backups. Define how shared catalog content and shared generated artifacts are handled without removing other users' data. Show an accurate completion state and a recovery path for failed processing.

Keep product analytics free of raw exercise notes, constraint text, or full prompts unless specifically required for an established purpose. Operational prompt capture already has a project decision; extend its lifecycle controls deliberately rather than duplicating sensitive data in new systems.

These are product and architectural recommendations, not an assertion about legal compliance.

## 10. Deliver accessibility through shared components

Fix shared primitives before making each page compensate separately:

- Make field labels valid and associated with one control; remove nested-label markup.
- Give dynamic errors and save results appropriate announcements and visible placement.
- Keep visible keyboard focus on navigation, chips, icon actions, reorder controls, and overlays.
- Verify the contrast of muted labels and data marks in every supported skin/mode.
- Support readable text enlargement, long labels, and narrow screens without clipping controls.
- Provide explicit alternatives to drag, hover-only tooltips, and color-only information.
- Add a skip-to-content route and check sticky elements against focused content.
- Respect reduced motion and make timers understandable without animation.

Use a small automated accessibility suite alongside manual keyboard, screen-reader, and real-phone checks. Passing a static scan is useful evidence, not proof that the live workflow is accessible.

## 11. Establish one design system before expanding skins

The skin proposal identifies a structural issue: color-named tokens such as cyan currently serve several roles. Introduce semantic roles for primary action, focus, success, danger, surfaces, and chart categories before creating many palettes.

Standardize record rows, page actions, field hints, status panels, and empty states. Define how long names wrap and how numeric values align. These patterns should work with original PULSE and the light-mode concepts.

Then build a small, coherent identity across one complete journey: workout cover → live-session progress → completion card. Prototype Alpine and Clay after the shared semantics work, followed by Track if the stronger style remains usable on forms and charts.

Keep optional visual libraries confined to the components that benefit from them. Favor static SVG and existing primitives for the first pass. Do not make skin selection change measurement meaning, navigation structure, or interaction behavior.

## 12. Strengthen CI around user-visible failure modes

**Observed:** [CI](../../.github/workflows/ci.yml) runs backend tests and frontend tests. The production build occurs in an advisory Lighthouse job that does not block merging, and Lighthouse audits the public shell.

Make a deterministic production-build/type-check path blocking independently of advisory performance checks. Keep the existing fast domain tests. Add a small number of high-value browser journeys rather than a large collection of snapshots that merely mirror the markup.

Recommended browser coverage:

| Journey | Failure worth preventing |
| --- | --- |
| Start, log a set, reload, resume | Loss or corruption of entered work |
| Finish with interrupted response | Duplicate or missing Logged Session |
| Build, reload, deploy | Lost draft or incorrect performed-prefix mutation |
| Correct a record | Drift between history, personal records, and Protocol advancement |
| Search, open detail, return | Lost filter and navigation context |
| Switch skin/mode | Unreadable controls or flash of the wrong appearance |

Add a targeted integration lane against the actual database engine for concurrency, transactions, and migration behavior. The existing offline/fake dependencies are valuable; production-database tests should complement them where the semantics differ.

Keep performance reporting advisory until stable enough to enforce. A reproducible build failure is different from a noisy lab score and should not share the same tolerance.

## 13. Measure performance on the screens users actually use

Long catalog lists, record feeds, charts, and whole-page server rendering deserve measurement with representative account sizes. Public-homepage Lighthouse results cannot establish authenticated training performance.

Measure before optimizing: navigation latency, server/API time, query counts, interaction responsiveness, rendered list size, and client bundle contribution. Use representative low-end phones and slow connections. Track improvement against a baseline rather than inventing an unmeasured target.

Paginate or progressively disclose long histories. Load charts and decorative assets where needed. Avoid refreshing unrelated screen data after a small interaction. Review repeated history reads before adding caches that create invalidation complexity.

Preserve the authenticated-navigation policy in [ADR-0028](../adr/0028-web-pwa-is-installable-and-offline-aware-but-caches-no-authenticated-navigation.md). Do not cache private rendered pages as a shortcut to better repeat-load scores.

## 14. Turn operational visibility into useful decisions

Extend the existing monitoring around a small set of operational questions:

- Are session saves failing or timing out?
- Are generation jobs stuck, failing, or producing unusable output?
- Which generation failures are transient and which need input correction?
- How much provider usage is spent on results that users cannot use?
- Are cache reuse and catalog lookup reducing unnecessary generation calls?
- Are telemetry delivery failures visible without blocking the product?

Use correlation identifiers across web, API, and worker boundaries. Keep cache hits distinct from provider calls, consistent with ADR-0039. Provide operator views for failed jobs and safe retries, with enough context to investigate and bounded access to sensitive content.

Verify backups by restoring them in an isolated environment. Document deployment, migration, rollback, and worker-recovery procedures. An export feature and a database backup solve different problems; retain both.

## 15. Improve project documentation as part of delivery

**Observed:** The README still presents a walking skeleton, while later documentation describes a much richer application. The feature-gap document contains layered historical updates, and the screenshots differ from this checkout.

Create a short current-capabilities page with implemented, experimental, and proposed sections. Link to historical decisions rather than asking readers to infer current state from a sequence of updates.

Attach a capture date, application revision, skin, mode, viewport, and representative fixture to future screenshot boards. Label missing states explicitly. Keep a small reproducible demo dataset for design and browser tests without real personal information.

Resolve decision status when implementation lands. For example, the correction ADR is labeled proposed while the inspected source contains correction routes; document whether the code is experimental or the ADR status needs updating.

## 16. Features worth exploring after the core is stronger

### A Protocol library and explicit switching

This could be one of the most useful domain additions. Users would see prior Protocols and intentionally select which one to continue.

It changes the current rule that chooses the most recently adopted unfinished Protocol. Define explicit selection, behavior when it is completed, and handling of an unfinished Live Session before implementation. Preserve all settled records. This is not a small navigation-only change; see ADR-0037.

### Cross-device resume

Potentially valuable for people who build on desktop and train on a phone. It requires server-side draft/session ownership, synchronization, conflict resolution, and a reliable definition of the active performance. Start with a handoff use case before promising concurrent editing.

### More capable offline training

First explain the existing offline boundary accurately. Later, investigate an account-scoped training payload and outbox designed for offline entry, with explicit sign-out behavior and safe reconciliation. This deliberately revisits the current architecture; it is not equivalent to caching authenticated pages.

### Units, import, and portability

Verify the current unit-conversion paths before expanding them. Make display preferences consistent at all boundaries and preserve historical quantities. A first import should include preview, mapping, validation, duplicate detection, and a clear result report.

### Optional reminders

If requested by users, make reminders opt-in and user-scheduled. Keep them separate from the self-paced Protocol sequence. Do not imply that an uncompleted Session is overdue simply because time passed.

### Explainable progression assistance

Show a proposed next prescription, the previous performance it uses, and why it differs. Let the user inspect and accept changes. Preserve the underlying domain rules and distinguish recorded facts from suggestions. Avoid opaque composite scores that the available data cannot justify.

### Sharing and collaboration

Begin with a user-initiated, previewable completion card or reusable Session export. Consider coach collaboration only after defining roles, visibility, edit permissions, and ownership. A public feed or leaderboard is not necessary to make personal progress rewarding.

## 17. What I would deliberately defer

- A broad social network, public rankings, or engagement mechanisms that reward training through rest.
- Native applications or wearable integrations before a demonstrated limitation of the web workflow warrants the maintenance cost.
- More AI providers solely for breadth; first improve output quality, evaluation, and recovery across existing seams.
- Automated global catalog merges without review and reference-preservation rules.
- A new database, event ledger, or state-management library without a concrete problem the current architecture cannot solve.
- Many skins, 3D scenes, and permanent animated backgrounds before the shared interaction patterns are reliable.
- Medical-style recovery or fatigue scores inferred from incomplete training logs.

These are sequencing judgments, not permanent exclusions.

## Delivery sequence

| Phase | Deliverable | Exit evidence |
| --- | --- | --- |
| A — Establish facts | Current capability inventory, reproducible screenshots, interruption tests | Source/design differences are documented; key failure scenarios are reproducible |
| B — Protect the record | Recoverable saves, safe retries, storage handling, draft recovery | Failure-injection tests preserve work and prevent duplicates |
| C — Clarify core tasks | Correct metrics, responsive forms, accessible feedback, action hierarchy | Users complete representative training/editing tasks with fewer misunderstandings |
| D — Improve quality and control | Catalog cleanup, export/deletion lifecycle, generation evaluation | Data changes and lifecycle operations are traceable and tested |
| E — Make PULSE distinctive | Cover/timer/completion identity and a small skin collection | One complete journey feels coherent across modes and remains usable |
| F — Expand deliberately | Selected Protocol library, sync, offline, or import feature | User need and revised domain decisions justify each addition |

Run documentation, CI, and observability improvements alongside these phases. Avoid treating visual polish as a final cleanup, but do not let it hide an unresolved save or measurement defect.

## How to judge whether the app is improving

Use a small set of measurements with defined denominators. Establish a baseline before assigning numeric targets.

| Question | Candidate measure | Interpretation caution |
| --- | --- | --- |
| Can users get started? | Time and wrong turns from Home to the intended Session | Separate new and returning users |
| Is recording dependable? | Confirmed saves, recovered interruptions, duplicate submissions | Distinguish user cancellations from technical failures |
| Is generation useful? | Valid outputs, adoption, feedback, reason for regeneration | A regeneration is not automatically a failure |
| Are results understandable? | Task-based questions about units and comparison basis | More chart views do not prove comprehension |
| Is the catalog improving? | Unclassified used sets, unresolved duplicate reports, successful searches | Track commonly used content, not only total catalog size |
| Are changes sustainable? | Build regressions, failed deployments, recovery time | Compare equivalent release sizes and conditions |
| Do people return voluntarily? | Repeated Logged Sessions over several weeks | Respect rest, vacations, and individual training frequency |

Pair these with direct conversations. Ask what users were trying to do, what they expected, and what surprised them. The strongest future PULSE is one whose appearance is memorable and whose behavior earns trust every time someone trains.
