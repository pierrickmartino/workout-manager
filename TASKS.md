# TASKS

All the open actions and tasks planned across `docs/` and the GitHub tracker, each
with its current status. Reviewed on **2026-10-10** against `main` at `4b0be41`.

Status was checked against the code, the GitHub issues and PRs, and later audits
that verified earlier items. Done items have been removed; see the git history of
this file for them.

**Legend**

| Mark | Meaning |
| --- | --- |
| 🟡 | Partly done (what is left is described in the row) |
| ⬜ | To do (not found in the code or still unchecked) |
| ❔ | Can't check from the repo (owner, ops or device task); still unchecked |
| 🚫 | Decided against (deliberately not adopted or parked) |

---

## 1. Do now: security and dependencies

Sources: [research 2026-10-05](docs/research/2026-10-05.md) → *Next actions*,
[audit 2026-10-05](docs/research/audit/2026-10-05.md) → rank 1–2,
[incident 2026-09-25](docs/security/incidents/2026-09-25-codex-tool-state.md).

- ❔ **Re-pull `postgres:16-alpine` (≥16.15) and move the VPS to `redis:8-alpine` on the next deploy.**
- ⬜ **Decide on dependency automation:** Renovate or Dependabot with exact-pin PRs, a weekly `npm audit` / `pip-audit` job, and maybe `uv lock` for the API (open since 08-14, Q2). There is no `.github/dependabot.yml`.
- 🟡 **Close the 09-25 credential incident.** Repository containment is done: `.codex` was removed, Gitleaks added, and a pre-push hook installed. Four owner items are still open:
  - ❔ Confirm the exposed refresh credential was revoked at the provider.
  - ❔ Put the cleanup commit on every retained branch tip.
  - ❔ Turn on GitHub native secret scanning and push protection.
  - ❔ Confirm GitHub rejects a push containing its official dummy secret.

## 2. Product reliability and trust (latest audit)

Source: [audit 2026-10-05](docs/research/audit/2026-10-05.md).

- ❔ **Run the installed-PWA Live and Finish recovery matrix** (rank 4) on iOS Safari and Android Chrome: offline logging, reload or update during a Live Session, lost finish acknowledgement, account switch, and a "Safari tab idle 8 days" row.
- 🟡 **Make AI spend and failures visible to the operator** (rank 5, tracked in [#270](https://github.com/pierrickmartino/workout-manager/issues/270), the only open issue). The recorder, Langfuse compose, lineage and erasure sub-issues (#271–#276) are closed. Still to do: reconcile against production and verify retention and erasure in operation.
  - ⬜ Update #270's acceptance criteria: pin the Langfuse server to `3.x` (compose still uses floating `:3`), note that SDK v2 loses support after v4, and restrict OTel spans to LLM calls.
- ⬜ **Open question:** can users predict what a Calibration re-pitch will change? Observe a few users before adding a preview.

## 3. PWA and platform

Sources: [research 2026-10-05](docs/research/2026-10-05.md), [market report 08-28](docs/research/workout-manager-market-ux-pwa-report_20260828.md), [refresh 09-01](docs/research/workout-manager-market-ux-pwa-report_20260901.md), [next-feature](docs/research/next-feature.md) §6.

- ⬜ **Call `navigator.storage.persist()`** when the finish outbox first holds a pending entry, and show `persisted()` in the sync-status view-model (P-1). Not found in the code.
- ⬜ **Enrich the manifest** with `id`, `scope`, `shortcuts` and `screenshots` (P-7).
- ⬜ **Add a contextual install prompt.** There is no `beforeinstallprompt` handling.
- ❔ **Make sure SW updates don't interrupt an active workout** (skipWaiting during a Live Session; not tested on a device).
- ⬜ **Notifications and badges**, only when the user asks for them (P2).
- 🟡 **iOS storage-eviction resilience** for a paused Live Session. The outbox exists; the `persist()` call and a long-pause warning are missing.
- ⬜ **Offline cold-start decision:** write an ADR choosing between caching the training path, accepting the gap and saying so, or a native client (Gript audit P0-2, audit 09-24 question).
- ⬜ **Native shell vs PWA-only:** answer it in an ADR (Gript audit §7, research 10-05 Q2). If the ADR picks React Native / Expo, start from the rule shortlist in the [React Native skills audit](docs/research/audit/vercel/react-native-skills-2026-10-10.md). There is no native code today, so that audit added no tasks.

## 4. Dependency majors

- ⬜ Re-run the ADR-0036 Trusted Types check on the signed-in flows with a real Clerk instance; post the result on #254.
- ⬜ Run the WebKit half of `audit/charts.mjs`.
- ⬜ Test sign-in, refresh and sign-out on a live Clerk Core 3 instance, and an offline cold start of the installed PWA.
- ⬜ Decide the Postgres 16 → 19 migration (ADR-0117).
- ⬜ Return 401/503 instead of 500 when the JWKS fetch fails.
- ⬜ Add a Trusted Types policy for the service-worker registration.
- ⬜ Make the CI checks required on `main`.

## 5. Builder (visual workout builder)

Sources: research reports 07-19 → 10-05, [market report 08-28](docs/research/workout-manager-market-ux-pwa-report_20260828.md), [refresh 09-01](docs/research/workout-manager-market-ux-pwa-report_20260901.md).

- ⬜ **Next builder slice:** drop-onto-row grouping, plus checkbox-select-then-group as the WCAG 2.5.7 alternative.
- ⬜ **Triset/circuit (N-member) grouping.**
- ⬜ **Undo for remove and reorder** in the un-performed tail.
- ⬜ **"Save as template"** built on duplication, plus bulk edit.
- ⬜ **Cite WCAG SC 2.5.7 (not 2.5.1)** in any future builder issue.

## 6. polish.pen review backlog

Sources: [polish-ui-ux-review](docs/design/polish-ui-ux-review.md), [polish-ui-ux-decisions](docs/design/polish-ui-ux-decisions.md).

**P1: correctness**
- ⬜ #2 follow-up: **move `SetEntry.Load`** (the stacked log forms) onto `LoadValueInput`, dropping its caller-chosen placeholder (`70`, `0`, `15`); it is the one exemption in `lib/load-value-policy.ts`.
- ❔ #3 **Push-up prescribed as absolute kg:** generation-parse finding; not checked.

**P2: clarity and IA**
- ⬜ #5 **One shared `record-row` view-model** (`apps/web/lib/record-row.ts`) for My Sessions, Analytics and Strength. Not found.
- ❔ #6 Primary action (Start / Save / Edit) at the top of every task page.
- 🟡 #7 Charts state unit, aggregation and window. Every datum is now available as text (ADR-0084); labels weren't audited one by one.
- ❔ #8b Non-absolute Load at log time shows "≈ N kg (est.)" when an Estimated 1RM exists.
- ⬜ #10 **Metric history:** offer to update the profile weight after a new weight reading, store a unit per reading, keep dates consistent.
- ⬜ #11 **Fitness Level anchors:** replace the bare 1–10 select with labelled levels. `ProfileForm.tsx` still shows "1–10". The Declared/Effective split shipped separately (#603–#606).
- 🟡 #12 Strength analytics exercise selector and pager are done; distinct Muscle-Group hues plus a numeric breakdown aren't checked.
- 🟡 #13 Catalog filters: shareable URL and drawer are done (ADR-0100); collapsed secondary filters, active-filter chips and a reset aren't checked.
- 🟡 #14 Admin catalog-health breakdown (Stub / Listable / Enriched) is done. **Still to do:** split Settings into Appearance vs Workout preferences (Profile still has one "APPEARANCE" card), and show the skin's next-visit scope.

**P3: polish**
- ⬜ #15 Reword "Trained N×" as performances logged (still "Trained N×" in `session-card.ts`).
- ❔ #15 Hide the Author in My Sessions, make "NEW" mean never-performed, show a short muscle summary in catalog rows, keep dates consistent.

**Cross-cutting**
- ⬜ **Terminology-guard entry for leaked UI synonyms** (deferred until the copy audit lists the offending strings).
- 🟡 **Missing-states coverage checklist** (pending, empty, error/retry and unsaved states for each journey). Draft recovery shipped (ADR-0080); the full checklist isn't done.
- ❔ **Usability test with real users** (start a workout, repeat one, build a push-up session, record weight, find the latest pull-up).

## 7. Future improvements (11 Sept recommendations)

Source: [future-improvements](docs/design/future-improvements.md).

- 🟡 §1 **Explicit storage-failure state** ("Progress cannot be saved on this device") and multi-tab protection. Not checked.
- 🟡 §2 **Protect editing work:** form drafts done for hand-authored, ad-hoc and Log Correction (ADR-0080). **Still to do:** Protocol Builder draft recovery and Undo.
- 🟡 §3 **Every metric understandable:** chart text parity is done. **Still to do:** shared display rules per metric, plus a fixture showing table, chart, header and feed agree.
- 🟡 §4 **Shorter training journey:** completed sets can be reopened (ADR-0089), set table (ADR-0114), keypads (ADR-0093). Previous-performance suggestions aren't checked.
- ⬜ §5 **Explain the self-paced model before consequential actions** (advancement, supersede, blocked corrections).
- 🟡 §6 **First use and progressive disclosure:** onboarding exists. **Still to do:** fitness anchors and better empty-state next steps.
- ⬜ §7 **Catalog quality, user correction channel** ("Wrong equipment", "Duplicate", "Unclear steps" reports feeding a review queue).
- 🟡 §8 **Inspectable generation:** async job states exist. **Still to do:** a generation **evaluation set** and explaining substitutions.
- 🟡 §9 **User control over data:** JSON/CSV export is done (#409, ADR-0062).
  - ⬜ **Account deletion flow** covering identity, DB, telemetry, local state and backups.
- 🟡 §12 **CI around user-visible failures:**
  - ⬜ A **blocking** production build (`next build` only runs in the advisory Lighthouse job).
  - 🟡 Browser journeys exist in `apps/web/audit/` but don't run in CI.
  - ⬜ An integration lane against real Postgres.
- 🟡 §13 **Measure performance on real screens:** #585–#587 removed serial reads and deferred chart bundles. No authenticated measurements yet.
- 🟡 §14 **Operational visibility:** see #270. Correlation IDs, a failed-job operator view and a **backup restore drill** are still to do.
- 🟡 §15 **Documentation:**
  - ⬜ A current-capabilities page.
  - ⬜ **Fix stale ADR statuses:** 0013, 0014, 0020, 0021, 0034, 0111 and 0112 still say "proposed" but are implemented.
- §16 **Explore later:**
  - 🟡 Protocols index, Switch, and delete-if-un-started (amends ADR-0037).
  - ⬜ Cross-device resume.
  - ⬜ More capable offline training (see §3).
  - 🟡 Units, import and portability: kg/lb is done (#408); **import** is still to do.
  - ⬜ Optional, user-scheduled reminders.
  - 🟡 Explainable progression: Scheme Preview exists; the "why this load" sentence doesn't.
- 🚫 §17 **Deliberately deferred:** social network, native/wearables, more AI providers for breadth, automatic catalog merges, a new DB or ledger, lots of skins and 3D, recovery scores.

## 8. Research-sourced feature backlog (July 2026)

Source: [next-feature](docs/research/next-feature.md).

- ⬜ **Conversational coach layer** (natural-language front end to regenerate, substitute and adjust).
- 🟡 **Adaptive progression narration:** Scheme Preview shipped; a per-decision "why" on the Next Session card hasn't.
- ⬜ **Type-neutral coaching narrative** (copy that presents yoga and mobility users as first-class).
- ⬜ **Voice-guided Live Session** (Web Speech API).
- ⬜ **On-device rep counting** (exploratory).
- ⬜ **Apple Health / Health Connect write-out** (a PWA can't reach HealthKit; ties to the native question).
- 🚫 **Recovery signals / readiness %:** deliberately not adopted (ADR-0001). Carried as open question Q1 in 10-05: hold the line, or add a bounded lane feeding only the 3-state signal?
- 🚫/⬜ **Social comparison and challenges:** treated as a large separate effort; Gript audit says not to build a feed.
- ⬜ **Shareable milestone cards** (PR, Streak, Level image).
- 🟡 **iOS storage resilience:** see §3.
- 🚫 **Nutrition integration:** parked as long-term.
- ⬜ **"Send to an AI" hand-off** for one Logged Session (Hevy parity; 10-05 Q3, needs a decision).
- ⬜ **Positioning and freemium narrative** (carried in every report since 07-21).

## 9. Gript competitive audit (3 Oct)

Source: [gript-competitive-audit](docs/research/audit/gript-competitive-audit-2026-10-03.md). Note: its claim that Gript has "no AI generation" was corrected by the 10-05 audit.

- ⬜ P0-1 **Inbound CSV import** (Hevy, Strong, JEFIT) into plan-less Logged Sessions. There is no import route.
- ⬜ P0-2 **ADR on offline training** (see §3).
- ⬜ P0-3 **Guest mode** or a frictionless first run.
- ⬜ P1-4 **Plate calculator and warm-up calculator** (pure `app/domain/` functions).
- ⬜ P1-5 **Gym-floor set-entry keypad:** weight steppers and one-tap RPE/RIR on top of `SetEntry` (ADR-0106).
- ⬜ P1-6 **Body metrics surface:** charts, a goal, more named parts (still a dated table).
- ⬜ P1-7 **Show progression reasoning** ("72.5 kg because…").
- ⬜ P2-8 **Publish the differentiation** (comparison pages, plan-vs-record explainer).
- ⬜ P2-9 **Lead with the safety invariant** in marketing copy.
- ⬜ P2-10 **Decide on pricing** (free tier limited by generation volume).
- ❔ §10 **Phone verification checklist** for the Gript claims.

## 10. PULSE identity and microinteractions

Sources: [pulse-creative-directions](docs/design/pulse-creative-directions.md), [microinteraction-ideas](docs/design/microinteraction-ideas.md).

**Creative directions: first release**
- ⬜ Collectible **completion card** at the end of a workout.
- ❔ Signature **rest-timer instrument**.
- 🟡 Exercise "field guide": catalog taxonomy and drawer are done; the visual field-guide treatment isn't.

**Microinteractions: suggested order** (none found in the code; implementation not confirmed)
- ⬜ 1. Tactile set-completion check, plus a calm handoff to the next exercise.
- ⬜ 2. Workout signature stamp, plus quiet sync acknowledgement.
- ⬜ 3. Builder placement feedback, plus superset connection.
- ⬜ 4. Route, atlas selection, heatmap day inspection, achievement stamp, favorite confirmation, menu emergence, generation resolving into a signature.

## 11. Validation and accessibility follow-ups

Sources: `docs/development/*`, [audit 09-28](docs/research/audit/2026-09-28.md), [view-transitions-audit](docs/research/audit/vercel/view-transitions-audit.md) §11.

- ⬜ **CH-F3 Atlas heat-magnitude gap:** the heat uses emphasis-weighted volume but the text shows set counts. Needs owner sign-off on the wording first.
- ❔ **Manual accessibility journeys** (AUTH, CAT, PROF, LOG, SAVE in [accessibility-journeys](docs/development/accessibility-journeys.md)) with a real screen reader.
- ❔ **WebKit / real iPhone runs** for reflow, resilience and charts (Chromium only so far).
- ⬜ **View Transitions in the running app:** all eight steps (ADR-0118 to ADR-0124) were checked with real components in Chromium, but none through the Next router in the running app, and no CI journey drives a navigation yet.

## 12. Vercel React best-practices audit (10 Oct)

Source: [react-best-practices-2026-10-10](docs/research/audit/vercel/react-best-practices-2026-10-10.md). Each fix is measured against the build output before and after.

- ⬜ V-1 **History list:** add `.list-row-defer` to each history card (XS), then map records to a slim view-model on the server (S). Windowing `GET /api/logs` with "show more" needs an ADR, because filtering is client-side today.
- ⬜ V-2 **Stop preloading every Skin's fonts:** 9 files (235 KB) are preloaded on every route. Set `preload: false` on the Aurora and Vercel families, or preload only the active Skin's fonts. Fix the layout comment and add a note to ADR-0050.
- ⬜ V-3 **Shrink the atlas client data** (36.4 KB gz on `/analytics`): round `reference-data.ts` coordinates to 1 decimal place, and send only the resolved figure's paths (split by gender, or render the base silhouette on the server).
- ⬜ V-4 **Protocol edit page:** fetch the Protocol, Profile and appearance in one `Promise.all`, then call `notFound()`.
- ⬜ V-5 **Batch harder-variation offers:** one `GET /api/sessions/{id}/harder-variations` instead of one request per prescription.
- ⬜ V-6 **Strength analytics:** read appearance in the same `Promise.all` as the main fetch.
- ⬜ V-7 **`ProtocolBuilder`:** derive the shown preview during render instead of clearing it in an effect.
- ⬜ V-8 **`ExerciseLibrary`:** move the query-change state resets into `onChange`.
- ⬜ V-9 **`useWideViewport` / `useChartTheme`:** move to `useSyncExternalStore` with one shared subscription (low priority).

## 13. Vercel composition patterns audit (10 Oct)

Source: [composition-patterns-2026-10-10](docs/research/audit/vercel/composition-patterns-2026-10-10.md).

- ⬜ C-1 **Split `HandAuthoredSessionForm`** (1,103 lines, over the 800 max) into two explicit forms, `LogHandAuthoredSessionForm` and `PlanHandAuthoredSessionForm`, built on a shared exercise-list editor. Drop the `mode` and `showPerformedSets` props.
- ⬜ C-2 **Redesign `PrescriptionFieldStack`'s 30-prop interface:** replace the handlers that control visibility by being present, and the per-surface flags, with a compound component or an explicit field set per surface. Write an ADR first (ADR-0067/0069).
- ⬜ C-3 **Remove the dead `advancedNonDefault` prop** from `PrescriptionFieldStack` (no caller passes it).
- ⬜ C-4 **Split `ReferenceAtlasFigure`** into a static figure (empty state, could be a Server Component) and an interactive one. This pairs with V-3.

## 14. Deployment: Hostinger VPS migration

Source: [hostinger-vps](docs/deployment/hostinger-vps.md) → *Completion checklist*. All unchecked in the doc; owner tasks.

- ❔ Same production Clerk identities and application data verified.
- ❔ Final database dump taken after all Railway writes stopped.
- ❔ Queue drained; failed or deferred work accounted for.
- ❔ DNS and HTTPS work on desktop, mobile and an installed PWA.
- ❔ Existing history, a new saved workout and an uncached generation tested.
- ❔ Only the SSH and Caddy ports reachable from outside.
- ❔ Backup schedule, encrypted off-server storage, alerts and a restore drill verified.
- ❔ Reboot recovery tested; release, configuration and rollback images kept.
- ❔ Langfuse migrated, or its temporary status documented.
- ❔ Railway retired only after the observation period and rollback decision.
