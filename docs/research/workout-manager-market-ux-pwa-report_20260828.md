# Workout Manager: Market Gaps, Visual Builder UX, and PWA Best Practices

**Research date:** 28 August 2026  
**Repository reviewed:** [`pierrickmartino/workout-manager`](https://github.com/pierrickmartino/workout-manager) at commit `2b67eb6634aee291a2e3b5ff9f1c0a2452e1b5bf` (26 August 2026)

## Executive summary

Workout Manager is already more than a basic workout logger. Its strongest assets are the separation of planned and performed work, AI-assisted generation, an editable multi-week protocol model, an accessible drag-and-drop builder, a strong live-session flow, typed strength/endurance quantities, honest analytics, and explicit safety/provenance rules.

The clearest market gaps are not “more AI.” They are the practical conveniences mature fitness apps have normalized:

1. **Reliable offline training and deferred sync.** A loaded live session survives refreshes, but users cannot reliably load a session offline or finish it into a durable cross-browser outbox.
2. **Account-scoped local state.** The unfinished live-session record uses one origin-wide `localStorage` key. On a shared browser, another signed-in account could receive the first account's resume affordance. Scope it to the user and purge it on sign-out.
3. **Fast manual programming.** The builder needs duplicate/copy/apply-to-weeks, saved templates or blocks, richer catalog filters, and bulk editing to compete with mature visual planners.
4. **Lifting conventions.** RPE/RIR, warm-up/drop/failure set types, notes, lb/kg preferences, plate calculation, and data export are routine expectations in Strong, Hevy, and Boostcamp.
5. **Distribution and ecosystem.** Competitors add watch logging, Apple Health/Health Connect, program discovery, community, coaching, or nutrition. These are strategic forks, not all mandatory features.

The recommended near-term position is: **the safest, most trustworthy self-paced workout system that adapts without pretending to know more than the data supports**. That makes the product's “honest projections,” broad training types, plan/record integrity, and safety handling visible rather than copying every social, calendar, or recovery-score feature.

## Scope and method

This report combines:

- direct inspection of the repository's current UI, domain model, ADRs, PWA manifest, service worker, and live-session persistence;
- current official product pages and help material for Hevy, Strong, Fitbod, Boostcamp, TrainHeroic, Trainerize, Everfit, and wger;
- primary platform guidance from MDN, web.dev, W3C/WAI, and WebKit.

Marketing pages show declared capabilities, not independently measured usability. Competitive gaps below therefore mean “capability or experience not evident in the reviewed repository,” not a claim that every competitor executes it well.

## 1. Current product baseline

### Strong capabilities already present

- AI-generated standalone sessions and multi-week protocols.
- Manual standalone session authoring and ad-hoc workout logging.
- A visual protocol builder that edits only the unperformed tail and commits changes atomically.
- Reordering by drag-and-drop plus button alternatives, screen-reader announcements, and explicit superset grouping.
- Exercise catalog search, provenance/completeness labels, substitution, insertion/removal, and harder-variation offers.
- Live set-by-set execution with previous performance, elapsed time, rest countdowns, superset-aware round rests, wake lock, progress, and resume after refresh or phone lock.
- Correctable history, duplication, favorites, naming, share-by-copy links, and reusing a logged session as a plan.
- Analytics for volume, PRs, estimated 1RM, strength trajectories, muscle distribution/coverage, distance, heatmaps, streaks, achievements, and body metrics.
- A broad training-type model: strength, cardio, HIIT, yoga, and mobility.
- Installable PWA foundations: manifest, regular/maskable icons, Apple touch metadata, service worker, and a branded offline page.
- Strong privacy and safety intent: secure cookie authentication, no authenticated navigation caching, constraint-aware generation, exercise provenance, and plan/record separation.

### Differentiators worth preserving

| Differentiator | Why it matters |
| --- | --- |
| Plan and record are separate | Editing a future protocol cannot silently rewrite training history. This is stronger than the loose “routine becomes log” model common in trackers. |
| Self-paced protocols | Users are not punished by a calendar for travel, illness, or legitimate rest. |
| Typed load and quantity | Reps, distance, duration, bodyweight, percentages, and qualitative loads are not forced into misleading numeric fields. |
| Honest analytics | Coverage and conversion limits are disclosed instead of fabricating complete volume or recovery scores. |
| Safety/provenance posture | Sensitive constraints bypass shared AI caches; unreviewed exercises are visibly labeled; safety copy and imagery are not fabricated. |
| Broad modality model | The architecture can treat yoga, mobility, endurance, HIIT, and strength as first-class, while leading loggers are primarily strength-centric. |

## 2. Market contestants and capability gaps

### Competitive reference set

- **Hevy:** simple strength logging, routine creation, social feed/community, offline watch workouts, Apple Watch/Wear OS, and desktop access. [Hevy features](https://www.hevyapp.com/features/), [Hevy social features](https://www.hevyapp.com/features/social-features/)
- **Strong:** strength logging with custom routines, set types, charts, warm-up and plate calculators, lb/kg support, Apple Watch/Health, sharing, and CSV export. [Strong product page](https://www.strong.app/), [Strong App Store listing](https://apps.apple.com/nl/app/strong-workout-tracker-gym-log/id464254577)
- **Fitbod:** adaptive strength programming based on goals, equipment, performance, and recovery, with Health and wearable integrations. [Fitbod](https://fitbod.me/), [Fitbod recovery model](https://fitbod.me/blog/tracking-volume-intensity-and-recovery-with-fitbod/)
- **Boostcamp:** a large program catalog, coach/community programs, manual multi-week building, RPE/RIR, auto-progression, set types, plate calculator, offline use, weekly reports, and advanced analytics. [Boostcamp features](https://www.boostcamp.app/features)
- **TrainHeroic:** athlete/coach ecosystem, program marketplace, calendar control, video guidance, readiness/recovery, reusable program content, and community. [TrainHeroic athlete features](https://www.trainheroic.com/athlete/)
- **Trainerize / Everfit:** coach-oriented all-in-one platforms with program libraries, nutrition/habits, messaging, client monitoring, scheduling, automation, copy/paste, multi-view planning, and bulk operations. [Trainerize features](https://www.trainerize.com/features/), [Everfit Master Planner](https://help.everfit.io/en/articles/11142555-master-planner-in-client-s-training-calendar)
- **wger:** open-source and self-hostable workout, exercise, nutrition, measurements, progress-photo, API, and multi-user platform. [wger repository](https://github.com/wger-project/wger)

### Capability comparison

Legend: **Yes** = clearly present; **Partial** = limited or adjacent support; **No** = not evident; **Choice** = deliberately excluded by the current product model.

| Capability | Workout Manager | Market signal | Interpretation |
| --- | --- | --- | --- |
| AI-generated programming | **Yes** | Fitbod and Trainerize emphasize automated programming | Competitive strength, especially across multiple training types. |
| Adaptive progression | **Yes, but quiet** | Fitbod sells adaptation and recovery prominently | Explain each adjustment in plain language; make the existing logic visible. |
| Visual multi-week builder | **Yes** | Boostcamp, Everfit, Hevy Coach | Solid base; missing speed features such as duplicate, copy/apply, reusable blocks, and bulk editing. |
| Blank-slate multi-week protocol | **No** | Boostcamp supports uncapped manual programs | A meaningful gap for advanced users who do not want AI as the starting point. |
| RPE/RIR and set types | **Partial** | Hevy, Strong, and Boostcamp treat these as standard | Add warm-up, working, drop, failure, AMRAP, and RPE/RIR semantics without collapsing them into notes. |
| lb/kg preference | **No** | Strong explicitly supports metric and imperial | High-value, low-concept gap for international adoption. Store canonical values; convert at every input/output boundary. |
| Plate/warm-up calculators | **No** | Strong and Boostcamp | Useful strength conveniences, but secondary to units and set semantics. |
| True offline workout flow | **Partial** | Hevy watch and Boostcamp advertise offline use | A loaded session persists locally, but loading and durable finish/sync remain network-dependent. |
| Wearable logging | **No** | Hevy and Strong support phone-free watch logging | Large reach gap; expensive for a web-only architecture. |
| Apple Health / Health Connect | **No** | Strong and Fitbod integrate health platforms | Strategic mobile-shell decision, not a quick PWA feature. |
| Program discovery/marketplace | **No** | Boostcamp and TrainHeroic use program catalogs as acquisition loops | Potential growth engine, but introduces curation, licensing, moderation, and creator economics. |
| Social feed, profiles, challenges | **Partial** | Hevy makes social a core pillar | Share-by-copy is useful but not a network effect. Add shareable result cards before building a feed. |
| Coach/client workflow | **No** | Trainerize, Everfit, TrainHeroic, Hevy Coach | Different customer segment. Only pursue with an explicit B2B strategy. |
| Nutrition/habit coaching | **No** | Trainerize and wger combine these domains | Avoid by default; it dilutes the product unless “whole-health coaching” is the chosen position. |
| Data export/import | **No** | Strong exports CSV; wger exposes an API | High-trust, relatively contained gap. Export raw records and plans as CSV/JSON. |
| Exercise video depth | **Partial** | Fitbod/TrainHeroic/Trainerize emphasize video instruction | Curated media would improve confidence, particularly for yoga/mobility, while preserving the no-fabricated-safety-media rule. |
| Calendar scheduling | **Choice** | Most coach platforms and TrainHeroic use calendars | Keep protocols self-paced. If users need reminders, schedule notifications around intent, not missed-day guilt. |
| Recovery percentage/HRV | **Choice** | Fitbod centers muscle recovery | The current three-state readiness model is a defensible differentiator; do not invent precision without wearable and validated recovery inputs. |
| Self-hosting/open API | **No** | wger differentiates here | Not necessary for consumer positioning, but export/API access can capture much of the trust benefit. |

### Highest-value gaps

#### P0 — Reliability and trust

1. **Account-scope the live-session slot.** The current key, `workout-manager.live-session`, is shared across all accounts using the same browser profile. Store an account identifier with the slot or use an account-derived key, reject mismatches, and purge the slot on sign-out. This is more important than encrypting same-origin storage because it addresses the practical shared-device boundary.
2. **Add an offline outbox for finished sessions.** A failed finish currently restores the live snapshot, which prevents immediate data loss. Improve this into a visible state: “Saved on this device — sync pending,” with idempotency keys, retry on foreground/online, and manual retry. Do not rely solely on Background Sync because it has limited cross-browser support and is unavailable in Safari/iOS. [MDN Background Synchronization API](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API)
3. **Add data export.** Export plans, logged sessions, sets, metrics, and exercise references as JSON and analysis-friendly CSV. This reduces lock-in concerns and complements the product's honest-data position.

#### P1 — Authoring speed and daily usefulness

4. **Add lb/kg preferences and conversion.** Keep canonical storage in kilograms, but accept and display the user's selected unit consistently in builders, live logging, history, and charts.
5. **Add set semantics and effort fields.** Support RPE or RIR, warm-up, working, drop, failure, AMRAP, and per-exercise notes. Start with strength without forcing these concepts onto yoga or distance work.
6. **Make builder repetition cheap.** Duplicate a session, copy/paste a week, apply an edit to selected future weeks, save a session or superset as a reusable block, and offer “repeat with progression.” Mature planners optimize for reuse rather than repeated data entry; Everfit exposes copy/paste, duplicate, saved-library, and bulk actions in its planner. [Everfit Master Planner](https://help.everfit.io/en/articles/11142555-master-planner-in-client-s-training-calendar)
7. **Explain adaptation.** Show concise causes such as “All target reps completed at low effort; next load increased 2.5 kg.” This converts an invisible algorithm into a user-facing reason to trust the plan.

#### P2 — Growth and platform reach

8. **Improve exercise discovery.** Add muscle, equipment, training type, difficulty, favorites, recent exercises, and “used in this protocol” filters. Search-only scales poorly as the catalog grows.
9. **Add shareable progress artifacts before a social network.** Generate privacy-controlled PR, streak, achievement, and completed-session cards using the native share sheet where available. This tests acquisition value without building moderation-heavy feeds.
10. **Decide on a mobile bridge.** A native or hybrid wrapper becomes justified when Apple Health/Health Connect, watch apps, background delivery, or richer platform integrations are strategic. Do not promise these from the web architecture alone.

### Strategic non-goals to keep explicit

- **No forced calendar:** preserve self-paced sequencing. Optional reminders can say “Your next session is ready,” not “You missed Tuesday.”
- **No fabricated recovery precision:** retain qualitative readiness until validated data supports more.
- **No broad coach CRM, payments, nutrition, or messaging without a segment decision:** these can turn a focused consumer product into a weaker Trainerize clone.
- **No unreviewed instructional media:** curated video and images are valuable; AI-generated anatomy or safety cues are not worth the risk.

## 3. UX patterns for visual workout builders

### What the best builders optimize

Successful builders reduce three kinds of cost:

1. **Orientation cost:** users always know which week, session, section, or exercise they are editing.
2. **Repetition cost:** common structures can be duplicated, templated, or applied in bulk.
3. **error-recovery cost:** drag, grouping, deletion, and bulk edits are previewable, undoable, or committed explicitly.

Everfit's planner illustrates the mature pattern: week/day/custom views, workout and section libraries, copy/paste, duplicate, drag-and-drop, bulk field editing, and linked/unlinked supersets. [Everfit Program Master Planner](https://help.everfit.io/en/articles/10448762-introducing-program-master-planner)

### Recommended information architecture

| Viewport | Recommended structure |
| --- | --- |
| Mobile | Sticky protocol context → horizontally scrollable week/session selector → selected session editor → contextual “Add exercise” button opening a full-height sheet → sticky review/deploy bar. |
| Tablet | Week/session rail beside the editor; exercise catalog in a dismissible drawer. |
| Desktop | Three panes: protocol outline, selected session canvas, exercise/field inspector. Keep the primary canvas centered and constrain pane widths. |

Do not render the entire multi-week program as simultaneously editable cards on a phone. The week matrix should orient and select; the session editor should do the detailed work.

### Builder interaction patterns

#### 1. Overview → session → exercise progressive disclosure

- Keep the week/session matrix compact: session name, training type, exercise count, set count, and state.
- Expand detailed sets, quantity, load, rest, tempo, and notes only for the selected exercise.
- Preserve context when opening an exercise: “Week 3 · Session 2 · Barbell Back Squat.”
- Allow the user to collapse completed sections and remember that presentation preference locally.

#### 2. In-context adding

- Put **Add exercise** at the intended insertion point, not only at the bottom of a global catalog.
- Open the catalog with the current session context and return the user to the exact insertion point.
- Offer recents, favorites, current equipment, and muscle filters before requiring text input.
- After adding, keep the picker open for multi-add and show a lightweight “Added” state.

#### 3. Reuse and bulk operations

- Duplicate a session into selected weeks.
- Copy/paste a whole week or selected exercises.
- “Apply to future occurrences” for load, quantity, rest, tempo, and exercise substitutions.
- Save sessions, supersets, warm-ups, and finishers as reusable blocks.
- Preview the number and location of affected sessions before applying a bulk edit.

These operations produce a larger speed improvement than making drag animation more elaborate.

#### 4. Drag-and-drop as enhancement, never the only path

The current builder is directionally strong: it uses drag handles, delayed touch activation, move buttons, and live announcements. Preserve that baseline.

WCAG 2.2 requires a non-dragging single-pointer alternative for dragging operations. Up/down buttons, “Move to…” menus, or a two-step select-and-place interaction satisfy the need more reliably than expecting all users to drag. [W3C understanding of dragging movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html), [WCAG 2.2 quick reference](https://www.w3.org/WAI/WCAG22/quickref/)

For pointer and touch drag:

- use a dedicated handle rather than making the whole form row draggable;
- delay touch activation enough to preserve vertical scrolling;
- enlarge drop zones and show insertion lines before release;
- auto-scroll near viewport edges;
- announce pickup, target, commit, and cancellation;
- provide an immediate Undo action after reorder/group/ungroup;
- keep move up/down or “Move to position” available at all times.

#### 5. Supersets and sections as visible containers

- Render a superset as one bounded container with a clear label and shared round-rest control.
- Keep member exercise fields visually subordinate to the group.
- Make “Add to superset,” “Remove from superset,” and “Move to superset…” explicit menu actions in addition to drag targets.
- Preview the execution order: `A1 → A2 → rest → repeat`.
- Reject invalid states immediately, such as a one-member superset, but explain the repair when the system dissolves it.

#### 6. Numeric input optimized for the gym

- Use appropriate mobile keyboards (`inputmode="decimal"` or `numeric`).
- Put units in or next to fields; never depend on placeholder text.
- Offer large ± controls with sensible increments and allow press-and-hold acceleration.
- Show last performance and prescribed target together without pre-filling an impossible value.
- Support “same as previous set” and “apply to all sets.”
- Keep destructive icons away from increment controls and require confirmation only for high-impact deletions.

#### 7. Draft, validation, and commit

The staged draft plus atomic **Deploy** is a good model. Improve its feedback:

- show a persistent “Unsaved changes” state;
- make leaving with changes explicit: Keep editing / Discard / Deploy;
- validate next to the affected session or field, not only in a page-level error;
- display a preflight summary: sessions added/removed, exercises changed, frozen performed sessions unaffected;
- make the balance preview update automatically after a short debounce, or rename **Simulate** to **Preview balance** so it does not imply physiological prediction;
- preserve a local recovery draft if the tab crashes, scoped to the current user and protocol.

#### 8. Terminology and learnability

The internal vocabulary is precise, but first-time users know “program,” “workout,” and “exercise” better than “protocol,” “session,” and “prescription.” Keep the domain model, but teach it progressively:

- “Protocol — your multi-week training plan” on first use;
- “Session — one workout” in empty states;
- reserve “prescription” for advanced details or explanatory copy rather than primary buttons.

This reduces onboarding friction without compromising the backend's conceptual integrity.

### Builder usability metrics

Instrument the builder around tasks, not clicks alone:

- median time to create a four-session week;
- exercises added per search;
- search-with-no-result rate;
- undo rate after drag, group, and deletion;
- deploy validation failure rate by rule;
- abandonment with an unsaved draft;
- percentage of programs using duplicate/copy/template operations;
- time from opening the builder to first successful deploy.

## 4. UX best practices for the PWA

### Current PWA assessment

| Area | Current state | Assessment |
| --- | --- | --- |
| Manifest and icons | Name, short name, description, start URL, standalone display, colors, 192/512 icons, maskable icon | Good installability baseline. |
| iOS metadata | Apple touch icon and standalone metadata | Good baseline; needs real-device regression testing. |
| Service worker | Precaches only `/offline`; authenticated navigations are network-only | Privacy-conscious and safe, but not a useful offline workout experience. |
| In-progress resilience | One live session persists in `localStorage`; failed finish restores it | Good loss prevention for a loaded session; not a durable sync model. |
| Install UX | No contextual install affordance evident | Missed retention opportunity. |
| Update UX | No user-facing new-version flow evident | Low risk today, but required before broader asset caching. |
| Connectivity UX | Offline fallback only | Users need in-app online/offline/sync-pending state. |
| App-like layout | Sticky header/bottom navigation and standalone display | Solid; safe-area and viewport edge handling are not evident. |
| Performance QA | Lighthouse warning budgets exist | Useful start, but only the public root is measured and warnings do not gate regressions. |

### Recommended PWA work

#### P0 — Make workout completion resilient

Implement a small, explicit offline state machine:

`editing locally → finish queued → syncing → synced` or `sync failed → retry`.

Requirements:

- persist queued finish payloads in IndexedDB, not an ever-growing `localStorage` blob;
- attach a client-generated idempotency key so retries cannot duplicate a logged session;
- retry on the `online` event and whenever the app returns to the foreground;
- use Background Sync only as a progressive enhancement;
- always provide a visible manual retry because Background Sync is not broadly available, including in Safari/iOS. [MDN Background Synchronization API](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API)
- prevent starting another session when an unsynced finish would violate the one-session invariant, or explicitly model multiple queued records;
- communicate local durability accurately: “Saved on this device; keep the app installed until sync completes.”

web.dev recommends defining which actions must work offline, storing data locally, and using background sync to defer communication where supported. [PWA checklist](https://web.dev/articles/pwa-checklist), [offline data guidance](https://web.dev/learn/pwa/offline-data)

#### P0 — Partition and clear local data

- Key live drafts and outbox entries by authenticated account ID.
- On hydration, reject data whose account does not match the current session.
- Purge live drafts, queued writes, and any user-specific caches on sign-out.
- Apply an expiry to abandoned live sessions and show the date/time before resuming.
- Document exactly which workout fields are stored locally.

This complements the existing rule not to cache authenticated navigation responses. Encrypting browser storage alone would not solve same-origin script access or cross-account mix-ups; partitioning and lifecycle control do.

#### P1 — Add a contextual install experience

Do not prompt on first page load. Offer installation after a value moment, such as the first completed session, the first saved protocol, or the second return visit. Explain the concrete benefit: faster launch, home-screen access, and improved workout resilience. Use `beforeinstallprompt` where supported and platform-specific instructions on iOS. web.dev recommends delaying the browser prompt until the app can explain the value in context. [Installation prompt guidance](https://web.dev/learn/pwa/installation-prompt)

Track: prompt eligibility, prompt shown, accepted, dismissed, installed, and 7-day return by display mode.

#### P1 — Enrich the manifest

Add, after validating routes and artwork:

- stable `id` and explicit `scope`;
- `lang` and fitness-related `categories`;
- screenshots for richer install UI;
- shortcuts ordered by importance: **Start next session**, **Log activity**, **Open history**;
- consider `display_override` with graceful fallbacks.

Manifest metadata can include identity, shortcuts, screenshots, orientation, and display preferences. [web.dev manifest guidance](https://web.dev/learn/pwa/web-app-manifest), [MDN web app manifest](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest)

#### P1 — Add connectivity and sync feedback

- Show a non-blocking offline banner while the app is open.
- Show “last synced” only when it reflects a real successful server acknowledgment.
- Distinguish **offline**, **saved locally**, **syncing**, and **failed**; do not collapse them into one error.
- Keep all local actions available that can be safely queued.
- Disable or annotate network-only features such as AI generation and catalog search before the user fills a form and submits it.

#### P1 — Handle updates without disrupting workouts

- Detect a waiting service worker or incompatible app version.
- Never force a refresh during a live session.
- Offer “Update after workout” or apply the update on the next clean launch.
- Version local schemas and migrate or safely reject stale live drafts/outbox entries.
- Once shell caching expands, use content-hashed assets and an explicit cache-retirement policy.

web.dev recommends checking for updates after rendering rather than delaying initial display, and choosing an update moment that does not interrupt the user. [PWA update guidance](https://web.dev/learn/pwa/update)

#### P1 — Finish the mobile app shell

- Apply `env(safe-area-inset-top/right/bottom/left)` to fixed and sticky navigation in standalone mode.
- Test small iPhones, large Android devices, split-screen tablets, zoom at 200%, and landscape.
- Use dynamic viewport units where full-height panels are needed.
- Ensure all primary tap targets meet at least the WCAG 2.2 minimum and ideally 44×44 CSS pixels for gym use.
- Respect `prefers-reduced-motion` for drag overlays, progress animation, and screen transitions.
- Preserve focus after dialogs, drawers, deploy, and inline validation.

#### P2 — Notifications and badges, only with user intent

Home Screen web apps on iOS/iPadOS support Web Push and badging, but notifications should be requested only after installation and after the user opts into a specific benefit. [WebKit: Web Push for iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)

Good uses:

- “Your next session is ready” at a user-selected cadence;
- sync-failure follow-up if a queued workout still needs attention;
- optional rest-day-neutral consistency reminders.

Avoid generic engagement pushes, permission prompts during onboarding, or calendar language that conflicts with the self-paced model.

#### P2 — Expand performance and quality measurement

- Run Lighthouse against representative authenticated routes in a safe test account, not only `/`.
- Convert stable budgets from warnings to CI failures gradually.
- Add real-user Core Web Vitals segmented by browser, device, display mode, and route.
- Measure cold start, repeat start, builder responsiveness, and live-session input latency.
- Run offline and update end-to-end scenarios on real Chrome Android and Safari iOS devices; lab tooling does not replace installed-mode tests.

Service workers should remain optional enhancements and core flows should degrade cleanly when unsupported. [web.dev service worker guidance](https://web.dev/learn/pwa/service-workers)

## 5. Recommended delivery sequence

### Phase 1 — Trustworthy gym use

1. Account-scope and purge the live-session slot.
2. Add IndexedDB finish outbox, idempotent API write, foreground/online retry, and sync-state UI.
3. Add connectivity awareness and accurate offline messaging.
4. Add lb/kg preference and consistent conversions.
5. Ship CSV/JSON export.

**Success test:** a user can start online, lose connectivity, complete the workout, close/reopen the app, reconnect, and get exactly one server record under the correct account.

### Phase 2 — Fast visual programming

1. Duplicate session and copy/apply across future weeks.
2. Reusable session/superset blocks.
3. Catalog filters, favorites, recents, and multi-add.
4. Inline validation, unsaved-change protection, local recovery draft, and preflight diff.
5. Set types, RPE/RIR, notes, and bulk set editing.

**Success test:** an experienced lifter can build a four-day, four-week protocol in under five minutes without repetitive re-entry.

### Phase 3 — Make differentiation visible

1. Explain progression decisions on the next-session and exercise views.
2. Rewrite onboarding around broad training types, safety, and self-paced planning.
3. Add curated exercise video where confidence and form instruction matter most.
4. Add contextual PWA installation, manifest shortcuts/screenshots, safe-area support, and non-disruptive updates.
5. Test shareable progress cards as the first acquisition loop.

### Phase 4 — Explicit strategic bets

Choose only after usage data validates the need:

- native/hybrid bridge for health platforms and wearables;
- blank-slate protocol authoring for advanced users;
- curated/community program catalog;
- coach/client product line;
- social feed or challenges.

## 6. Product decisions to validate with users

1. Do users choose Workout Manager because it creates a plan, because it tracks well, or because it supports several training types?
2. How many users want a calendar versus a self-paced queue? Test reminders without changing the core model first.
3. What proportion of strength users need RPE/RIR and set types in every session?
4. Is manual protocol authoring blocked mainly by missing blank-slate creation or by repetitive editing after AI generation?
5. Would users install the PWA after a completed workout if offline completion and home-screen shortcuts were explained clearly?
6. Are wearable/health integrations a purchase blocker or merely requested by vocal power users?

## Conclusion

Workout Manager does not need to imitate the largest all-in-one fitness platforms. It needs to remove the reliability and authoring friction that makes those products feel mature.

The most defensible path is:

> **Offline-resilient execution + fast visual programming + transparent adaptation, built on a trustworthy plan/record model.**

That sequence strengthens daily use first, exposes the product's existing intelligence second, and postpones expensive ecosystem bets until the evidence justifies them.

