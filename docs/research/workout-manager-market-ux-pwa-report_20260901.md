# Workout Manager: Market and UX Research Refresh

**Research date:** 1 September 2026  
**Repository reviewed:** [`pierrickmartino/workout-manager`](https://github.com/pierrickmartino/workout-manager)  
**Commit reviewed:** [`27a5703cda6509916d49b4e0f79bb577ac7a2454`](https://github.com/pierrickmartino/workout-manager/commit/27a5703cda6509916d49b4e0f79bb577ac7a2454)  
**Previous report:** 28 August 2026, commit `2b67eb6634aee291a2e3b5ff9f1c0a2452e1b5bf`

## Executive summary

Workout Manager has closed two concrete gaps since the previous review: users can now choose kilograms or pounds throughout the product, and they can export their data as JSON or CSV. It also added deletion for empty standalone sessions. These are meaningful trust and usability improvements.

The highest-risk gap remains workout completion under unreliable connectivity. The repository now contains accepted architecture decisions for account-scoped local state, an IndexedDB finish outbox, idempotent writes, and explicit sync status—but the implementation is not present at the reviewed commit. For a workout product, “Finish” must be immediately believable even in a dead zone.

The strongest next product gap is no longer unit support or export. It is the speed and expressiveness of everyday programming: duplicate/import/copy/apply actions, reusable templates, bulk editing, RPE/RIR, set types, exercise notes, and practical lifting tools. Hevy, Strong, Boostcamp, and professional coaching builders make these conventions table stakes.

Recommended position: **the safest and most trustworthy self-paced adaptive workout planner**. Preserve Workout Manager’s good foundations—calendar-free progression, separation between plans and logged facts, broad activity modalities, and transparent projections—while making offline completion and routine authoring exceptionally dependable.

## What changed since 28 August

### Shipped in the repository

| Change | Evidence in the reviewed commit | Market impact |
|---|---|---|
| kg/lb preference | Migration `0034_weight_unit.py`, settings toggle, conversion/formatting utilities, and updated builder, live-session, history, and analytics surfaces | Closes the prior unit-preference gap; also unlocks plate and warm-up calculators |
| JSON and CSV export | `/api/export`, JSON export, CSV export with one row per logged set, and tests | Closes the prior export gap and improves user trust; import remains absent |
| Delete empty standalone sessions | Session action and count support | Removes a cleanup dead end; logged sessions remain appropriately protected |

### Decided, but not yet shipped

| Accepted decision | Intended behavior | Status at reviewed commit |
|---|---|---|
| ADR 0059 | Scope the live-session slot and pending work to the current account; reject and purge mismatches | Architecture only |
| ADR 0060 | Make finish immediately durable via IndexedDB outbox plus client-generated idempotency key; retry later | Architecture only |
| ADR 0061 | Keep projections server-computed and explain temporary lag through sync state | Architecture only |
| ADR 0064 | Introduce a progression-scheme registry: Double Progression, Greyskull-style Linear, Session-Count-Based, and Static/Manual; retire Pin | Architecture only |

The distinction matters: these ADRs substantially improve the plan, but users still experience the old behavior until code, migrations, UI, and recovery tests land.

### Market movement

No category-level shift was found in the four days since the previous report. Fresh official product pages reinforce the same competitive pressure:

- Hevy foregrounds workout notes, rest timers, warm-up and plate calculators, set types, RPE, supersets, live PRs, routine folders, social discovery, coaching, and routine sharing. ([Hevy features](https://www.hevyapp.com/features/))
- Strong continues to position CSV export, RPE, warm-up calculations, Apple Health, Apple Watch, charts, scheduling, sharing, timers, and Siri shortcuts as core capabilities. ([Strong](https://www.strong.app/))
- Boostcamp now describes more than 11,000 programs, over 130 coach-designed programs, RPE/RIR on every set, set-type conventions, an unlimited multi-week builder, program forking and sharing, Apple Watch support, and offline logging that syncs later. ([Boostcamp features](https://www.boostcamp.app/features))
- Fitbod remains the reference point for equipment-aware, recovery-informed adaptive programming. ([Fitbod](https://fitbod.me/))

## Competitive gap analysis

### Capability snapshot

This is a directional product comparison based on public feature pages and repository inspection, not an exhaustive SKU audit.

| Capability | Workout Manager | Competitive signal | Assessment |
|---|---|---|---|
| Self-paced, calendar-free progression | Strong | Less central in mainstream trackers | Differentiator worth protecting |
| Broad exercise modalities and typed quantities | Strong | Many competitors remain lifting-centric | Differentiator |
| kg/lb preference | **Shipped** | Baseline in major trackers | Gap closed |
| Data export | **JSON + CSV shipped** | Strong and others promote export | Gap closed; import still open |
| Reliable offline finish and deferred sync | ADR accepted; not implemented | Boostcamp explicitly markets offline logging and later sync | **Critical gap** |
| Account-safe local workout state | ADR accepted; not implemented | Expected privacy baseline | **Critical gap** |
| RPE/RIR and set types | Not evident | Hevy, Strong, Boostcamp | High-frequency gap |
| Notes at exercise/set level | Limited or not evident | Hevy promotes exercise notes | High-frequency gap |
| Duplicate/import/copy/apply/templates/bulk edits | Limited | Hevy Coach and Everfit make these primary actions | Builder-efficiency gap |
| Multiple selectable progression schemes | ADR accepted; not implemented | Competitors mix static plans, programs, and automated progression | Strategic gap |
| Plate/warm-up calculators | Not evident | Hevy and Strong | Useful lifting gap; now easier after unit work |
| Offline/install/update PWA UX | Partial | Installable PWAs should set clear offline and update expectations | Trust gap |
| Wearables and health-platform sync | Not evident | Strong, Boostcamp, Fitbod | Strategic/native-platform gap |
| Social, coach, marketplace, nutrition | Not core | Hevy, Boostcamp, Fitbod ecosystems | Deliberate product-choice gap, not an immediate defect |

### Where Workout Manager can win

Trying to match every social, coaching, nutrition, and wearable feature would dilute the product. The more defensible wedge is:

1. **Completion you cannot lose.** Finishing a workout should survive connection loss, app suspension, reauthentication, retry, and duplicate submission.
2. **Progression users can understand.** Every next-target change should name the scheme, the evidence used, and what will happen next.
3. **Fast planning without calendar pressure.** Users should create and revise routines at their own pace, with duplication and bulk tools rather than date-driven administration.
4. **Honest records and projections.** Preserve the repository’s distinction between planned prescriptions, logged facts, and derived projections.

## UX patterns for a visual workout builder

The strongest builders behave like structured editors, not long forms.

### 1. Keep the workout hierarchy visible

Use a stable hierarchy—program → workout → section or superset → exercise → set prescription. The current card-based approach is a reasonable base, but each level needs a clear label, drag handle, action menu, and insertion point. Keep exercise identity visually separate from fields such as sets, reps, load, rest, tempo, and effort.

### 2. Make duplication a first-class workflow

High-value actions should be adjacent to the object they affect:

- duplicate workout;
- duplicate exercise and its set prescription;
- copy/paste between workouts;
- apply a change to selected exercises or sets;
- save a workout or section as a reusable template;
- import an existing routine before editing.

Everfit exposes copy/paste, drag-and-drop, section duplication, moving, bulk tracking-field changes, and superset linking. ([Everfit Master Planner](https://help.everfit.io/en/articles/11142555-master-planner-in-client-s-training-calendar)) Hevy Coach emphasizes Build, Duplicate, Import, drag-and-drop, and prescription fields such as rep range, weight, rest, and RPE. ([Hevy Coach workout program builder](https://hevycoach.com/features/workout-program-builder/))

### 3. Treat drag-and-drop as an enhancement

Dragging is efficient for pointer users but must not be the only way to reorder. Provide keyboard-accessible Move up, Move down, Move to workout/section, and position controls. WCAG 2.2 requires a single-pointer alternative for functionality that uses dragging. ([W3C: Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html))

On touch screens, use an explicit drag handle, autoscroll near edges, a clear drop indicator, and enough separation from editable fields to prevent accidental moves.

### 4. Use compact defaults and progressive disclosure

The frequent path should stay fast: exercise, sets, rep or time target, and optional load. Put tempo, rest, RPE/RIR, set type, unilateral rules, notes, and progression scheme behind an expandable “More” area. Preserve advanced values after collapse and summarize them on the card.

### 5. Support workout-domain semantics

Free text is flexible but weak for analytics and live-session speed. Add structured choices for:

- effort: RPE or RIR;
- set type: warm-up, working, drop, failure, AMRAP;
- rest interval;
- superset/circuit grouping;
- exercise and set notes;
- progression scheme, with a plain-language preview.

Do not force these fields. Defaults should keep a simple three-sets-of-ten workflow simple.

### 6. Design for small screens first

Use a sticky action bar for Save/Add/Undo, bottom sheets for exercise search and object actions, and large touch targets. WCAG 2.2’s AA minimum is 24×24 CSS pixels, while 44×44 is the stronger target for primary touch actions. ([W3C: Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [Target Size Enhanced](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html))

Avoid horizontal tables for set editing. A vertical set row with a persistent set number and compact, correctly labelled inputs scales better to phones.

### 7. Make destructive editing reversible

Prefer immediate local edits with Undo for removal and reordering. Autosave drafts, show Save/Saved/Retrying states, warn only when data will truly be lost, and announce reorder/save status to assistive technology.

## PWA UX best practices

### Offline behavior must be product behavior

A service worker is not enough. Define an explicit capability matrix:

| State | Must work | May be deferred |
|---|---|---|
| First visit offline | Branded offline explanation and recovery action | Application data |
| Returning user offline | Open shell, view locally available current session, edit and finish safely | Server projections and cross-device updates |
| Reconnected | Retry pending finish automatically and visibly | Background refresh of nonessential content |

Store structured workout and outbox data in IndexedDB, not only localStorage. Avoid claiming automatic background delivery as the sole guarantee: the Background Sync API has limited browser availability. Retry when the app regains focus or connectivity and provide a manual Retry action. ([web.dev: Offline data](https://web.dev/learn/pwa/offline-data), [MDN: Background Synchronization API](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API))

### The finish flow needs a durable state machine

Implement the accepted ADRs as observable states:

`In progress → Saved on this device → Syncing → Synced`

Failures should become `Needs attention`, never silently revert to “not finished.” Generate an idempotency key before the first network attempt; use the same key for every retry. Bind local records to the authenticated account and purge or quarantine mismatches at sign-out/account switch.

### Installation should be contextual

Do not show an install prompt on first paint. Offer installation after the user completes a meaningful action, such as saving a plan or finishing a workout, and explain the benefit: quicker launch and safer gym use. Keep a persistent install action in settings when supported. Browser install UI differs, especially on iOS, so provide platform-appropriate instructions. ([web.dev: Installation prompt](https://web.dev/learn/pwa/installation-prompt))

The manifest should include stable identity, appropriate icons, theme/background colors, display mode, screenshots, and useful shortcuts such as “Start workout.” ([web.dev: Web app manifest](https://web.dev/learn/pwa/web-app-manifest), [MDN: Web app manifest](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest))

### Updates must not interrupt active workouts

Check for updates after the current screen renders. If an update arrives during a live session, defer activation until the session is safely persisted, or offer “Update after workout.” Never replace the app mid-entry. Explain when refresh is required and preserve the local draft across it. ([web.dev: Updating a PWA](https://web.dev/learn/pwa/update))

### Mobile polish affects perceived reliability

- Respect safe-area insets for sticky controls and installed-mode navigation.
- Set explicit input modes for numeric fields and avoid unwanted zoom or keyboard switching.
- Maintain focus and scroll position across add/reorder actions.
- Use short status copy: “Saved on this device,” “Waiting for connection,” and “Synced.”
- Provide a branded offline fallback rather than a browser error. ([MDN: PWA best practices](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Best_practices), [web.dev: PWA checklist](https://web.dev/articles/pwa-checklist))
- Treat notifications as optional and user-initiated. iOS/iPadOS web push is available for Home Screen web apps, but permission still requires direct user interaction. ([WebKit: Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/))

## Prioritized recommendations

### P0 — make workout completion trustworthy

1. **Implement ADRs 0059–0061 end to end.** Add account-scoped IndexedDB storage, a durable finish outbox, server-side nullable-unique idempotency keys, online/foreground/manual retry, and explicit sync states.
2. **Test the failure modes, not only the happy path.** Cover offline finish, timeout after server commit, repeated retries, closing/reopening, sign-out/account switch, and multiple queued completed workouts.
3. **Guard updates during live sessions.** Persist before activation and defer refresh until safe.

**Success measures:** zero duplicated logged sessions in retry tests; zero lost completed sessions in forced-offline tests; pending-sync state recoverable after relaunch.

### P1 — improve daily authoring and logging

4. **Add structured effort and set semantics.** Start with RPE/RIR, warm-up/working/drop/AMRAP/failure, rest, and notes. Keep all optional.
5. **Ship builder power actions.** Duplicate workout/exercise, copy/paste, save as template, import existing workout, bulk-edit selected fields, and undo delete/reorder.
6. **Implement ADR 0064’s progression registry.** Show the selected scheme per prescription and preview the next-target rule in plain language. Migrate Pin deliberately rather than maintaining two overlapping models.
7. **Improve exercise discovery.** Add recent, favorites, equipment/muscle/modality filters, and a quick custom-exercise path without losing builder context.

**Success measures:** median taps and elapsed time to build a four-exercise workout; rate of builder abandonment; undo usage; proportion of prescriptions with an explicitly chosen scheme.

### P2 — capitalize on the new foundations

8. **Add plate and warm-up calculators.** Unit conversion is now available; these are bounded features with strong competitive precedent.
9. **Add a PWA install and offline-readiness surface.** Show install availability contextually and expose cached/sync/update status in settings.
10. **Consider JSON import after export stabilizes.** Use schema versioning, preview, validation, and dry-run conflict reporting.
11. **Choose one ecosystem bet only after retention evidence.** Health platform sync, wearables, coach tooling, social sharing, and a program marketplace are separate strategies. Validate which materially supports the self-paced adaptive position before committing.

## Suggested implementation sequence

1. Land the account-scoped IndexedDB/outbox/idempotency vertical slice with recovery tests.
2. Add visible sync and safe-update states across the live-session shell.
3. Implement set semantics and notes in the data model, builder, live entry, history, and export.
4. Add duplicate/copy/template/bulk/undo actions to the builder.
5. Implement the progression registry and migrate Pin.
6. Add calculators, exercise discovery improvements, and contextual PWA installation.

This order reduces data-loss risk first, then improves the two highest-frequency workflows—building and completing workouts—before pursuing ecosystem breadth.

## Research limitations

- Competitor capabilities were taken from public first-party product pages; paid-tier limits and platform-specific differences can change.
- Repository conclusions reflect the exact commit above. Accepted ADRs were counted as decisions, not shipped behavior.
- No usability study or production analytics were available. Priority therefore combines task frequency, failure severity, repository readiness, and competitive prevalence.

## Sources

### Competitors and builder patterns

- [Hevy features](https://www.hevyapp.com/features/)
- [Strong](https://www.strong.app/)
- [Boostcamp features](https://www.boostcamp.app/features)
- [Fitbod](https://fitbod.me/)
- [Hevy Coach workout program builder](https://hevycoach.com/features/workout-program-builder/)
- [Everfit Master Planner](https://help.everfit.io/en/articles/11142555-master-planner-in-client-s-training-calendar)

### PWA and accessibility guidance

- [web.dev: PWA checklist](https://web.dev/articles/pwa-checklist)
- [web.dev: Offline data](https://web.dev/learn/pwa/offline-data)
- [web.dev: Installation prompt](https://web.dev/learn/pwa/installation-prompt)
- [web.dev: Updating a PWA](https://web.dev/learn/pwa/update)
- [web.dev: Web app manifest](https://web.dev/learn/pwa/web-app-manifest)
- [MDN: Progressive Web App best practices](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Best_practices)
- [MDN: Background Synchronization API](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API)
- [MDN: Web app manifest](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest)
- [W3C WCAG 2.2: Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html)
- [W3C WCAG 2.2: Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- [WebKit: Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
