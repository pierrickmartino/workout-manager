# TASKS

All the actions and tasks planned across `docs/` and the GitHub tracker, each with
its current status. Reviewed on **2026-10-07** against `main` at `70a85c2`.

Status was checked against the code, the GitHub issues and PRs, and later audits
that verified earlier items. A ✅ means the work is in the source. It does not
mean it was tested on a real device or in production.

**Legend**

| Mark | Meaning |
| --- | --- |
| ✅ | Done (in source, or the issue is closed) |
| 🟡 | Partly done (what is left is described in the row) |
| ⬜ | To do (not found in the code or still unchecked) |
| ❔ | Can't check from the repo (owner, ops or device task); still unchecked |
| 🚫 | Decided against (deliberately not adopted or parked) |

---

## 1. Do now: security and dependencies

Sources: [research 2026-10-05](docs/research/2026-10-05.md) → *Next actions*,
[audit 2026-10-05](docs/research/audit/2026-10-05.md) → rank 1–2,
[incident 2026-09-25](docs/security/incidents/2026-09-25-codex-tool-state.md).

- ✅ **Bump `next` 16.2.12 → 16.3.8.** Fixes 3 critical advisories (GHSA-2xp9, GHSA-p293, GHSA-vcvr) plus 7 others. `package.json` pinned 16.2.12.
- ✅ **Patch `@clerk/nextjs` 6.39.5 → 6.39.7** in the same PR.
- ✅ **Set `images: { unoptimized: true }` in `next.config.js`.** We only render plain `<img>` (ADR-0095).
- ✅ **Raise the `pyjwt[crypto]` floor to `>=2.15.1`.** It was `>=2.9`, which allowed 15 advisories. The stale floor was first flagged in the 08-14 report.
- ✅ **Raise the `python-multipart` floor to `>=0.0.31`.** It was `>=0.0.12`, and the image upload parses the body before admin auth runs.
- ✅ **Optionally set a `cryptography>=49` runtime floor.**
- ✅ **Broaden the `except` in `verify_clerk_jwt`** to catch any decode error (e.g. `RecursionError`), and add a unit test with a deeply nested header. It caught only `jwt.PyJWTError`; raw decode errors now map to a fixed-message `AuthError`.
- ✅ **Make `apps/web/Dockerfile` use the lockfile** (`COPY package-lock.json` + `npm ci`). It ran `npm install`.
- ✅ **Pin the `ghcr.io/astral-sh/uv` image tag.** Was `:latest`; now `0.12.23` by tag and digest.
- ❔ **Re-pull `postgres:16-alpine` (≥16.15) and move the VPS to `redis:8-alpine` on the next deploy.**
- ⬜ **Decide on dependency automation:** Renovate or Dependabot with exact-pin PRs, a weekly `npm audit` / `pip-audit` job, and maybe `uv lock` for the API (open since 08-14, Q2). There is no `.github/dependabot.yml`.
- 🟡 **Close the 09-25 credential incident.** Repository containment is done: `.codex` was removed, Gitleaks added, and a pre-push hook installed. Four owner items are still open:
  - ❔ Confirm the exposed refresh credential was revoked at the provider.
  - ❔ Put the cleanup commit on every retained branch tip.
  - ❔ Turn on GitHub native secret scanning and push protection.
  - ❔ Confirm GitHub rejects a push containing its official dummy secret.

## 2. Product reliability and trust (latest audit)

Source: [audit 2026-10-05](docs/research/audit/2026-10-05.md).

- ⬜ **Handle uncertain Calibration results** (rank 3; the audit's suggested "small change" for this week). `calibration-control.tsx` has no `catch`. Add: catch transport errors, show "could not confirm" with a retry, re-read the canonical Calibration, and test both fault paths.
- ❔ **Run the installed-PWA Live and Finish recovery matrix** (rank 4) on iOS Safari and Android Chrome: offline logging, reload or update during a Live Session, lost finish acknowledgement, account switch, and a "Safari tab idle 8 days" row.
- 🟡 **Make AI spend and failures visible to the operator** (rank 5, tracked in [#270](https://github.com/pierrickmartino/workout-manager/issues/270), the only open issue). The recorder, Langfuse compose, lineage and erasure sub-issues (#271–#276) are closed. Still to do: reconcile against production and verify retention and erasure in operation.
  - ⬜ Update #270's acceptance criteria: pin the Langfuse server to `3.x` (compose still uses floating `:3`), note that SDK v2 loses support after v4, and restrict OTel spans to LLM calls.
- ⬜ **Open question:** can users predict what a Calibration re-pitch will change? Observe a few users before adding a preview.

## 3. PWA and platform

Sources: [research 2026-10-05](docs/research/2026-10-05.md), [market report 08-28](docs/research/workout-manager-market-ux-pwa-report_20260828.md), [refresh 09-01](docs/research/workout-manager-market-ux-pwa-report_20260901.md), [next-feature](docs/research/next-feature.md) §6.

- ✅ **Offline-resilient finish:** account-scoped slot, idempotent IndexedDB outbox, sync-state UI (#407–#414, ADR-0059/0060/0061).
- ✅ **Atomic finish:** a Logged Session and all its sets are written in one transaction (audit 09-24, rank 2).
- ✅ **Live Session storage hardening** (ADR-0035, ADR-0059) and an SW that never caches authenticated pages (ADR-0028). These cover the HIGH and MEDIUM risks from the 07-19 to 08-14 reports.
- ✅ **Keep Screen Awake during a Live Session** (#383–#386).
- ⬜ **Call `navigator.storage.persist()`** when the finish outbox first holds a pending entry, and show `persisted()` in the sync-status view-model (P-1). Not found in the code.
- ⬜ **Enrich the manifest** with `id`, `scope`, `shortcuts` and `screenshots` (P-7).
- ⬜ **Add a contextual install prompt.** There is no `beforeinstallprompt` handling.
- ❔ **Make sure SW updates don't interrupt an active workout** (skipWaiting during a Live Session; not tested on a device).
- ⬜ **Notifications and badges**, only when the user asks for them (P2).
- 🟡 **iOS storage-eviction resilience** for a paused Live Session. The outbox exists; the `persist()` call and a long-pause warning are missing.
- ⬜ **Offline cold-start decision:** write an ADR choosing between caching the training path, accepting the gap and saying so, or a native client (Gript audit P0-2, audit 09-24 question).
- ⬜ **Native shell vs PWA-only:** answer it in an ADR (Gript audit §7, research 10-05 Q2).

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

- ✅ **Builder manipulation layer:** Superset container, self-healing drag, 44px targets, accessible feedback (#214–#220, ADR-0023/0027).
- ✅ **Always-visible hierarchy spine and tail-only reordering** (ADR-0068).
- ✅ **Compact defaults and progressive disclosure** for the Prescription editor (#462–#469, ADR-0067).
- ✅ **Workout semantics:** Set Type, typed Effort (RPE/RIR), notes, Scheme Preview (#448–#454).
- ✅ **Selectable Progression Schemes** (#427–#434, ADR-0064).
- ✅ **Duplicate a Session** (ADR-0043), Insert/Remove a prescription on a standalone Session (ADR-0051/0052).
- ⬜ **Next builder slice:** drop-onto-row grouping, plus checkbox-select-then-group as the WCAG 2.5.7 alternative.
- ⬜ **Triset/circuit (N-member) grouping.**
- ⬜ **Undo for remove and reorder** in the un-performed tail.
- ⬜ **"Save as template"** built on duplication, plus bulk edit.
- ⬜ **Cite WCAG SC 2.5.7 (not 2.5.1)** in any future builder issue.

## 6. polish.pen review backlog

Sources: [polish-ui-ux-review](docs/design/polish-ui-ux-review.md), [polish-ui-ux-decisions](docs/design/polish-ui-ux-decisions.md).

**P1: correctness**
- ✅ UX-01 Volume axis ordering (resolved before the review).
- ✅ UX-02 / #1 Mobile containment at 320px and 200% text (#570, #572, ADR-0085/0087).
- ⬜ #2 **Kind-aware Load placeholder.** `PrescriptionFieldStack.tsx:339` still always shows `60 kg`.
- ❔ #3 **Push-up prescribed as absolute kg:** generation-parse finding; not checked.

**P2: clarity and IA**
- ✅ #4 Creation IA ("Generate a Protocol · multiple weeks", etc.) on `/train`.
- ⬜ #5 **One shared `record-row` view-model** (`apps/web/lib/record-row.ts`) for My Sessions, Analytics and Strength. Not found.
- ❔ #6 Primary action (Start / Save / Edit) at the top of every task page.
- 🟡 #7 Charts state unit, aggregation and window. Every datum is now available as text (ADR-0084); labels weren't audited one by one.
- ✅ #8a Superset rendered as one round-rest group (#469).
- ❔ #8b Non-absolute Load at log time shows "≈ N kg (est.)" when an Estimated 1RM exists.
- ✅ #9 Equipment vocabulary (ADR-0077, `domain/equipment.py`).
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

- ✅ §1 **Resilient Live Session completion:** stable retry identity, idempotent finish, no duplicates (ADR-0060, #410–#413).
- 🟡 §1 **Explicit storage-failure state** ("Progress cannot be saved on this device") and multi-tab protection. Not checked.
- 🟡 §2 **Protect editing work:** form drafts done for hand-authored, ad-hoc and Log Correction (ADR-0080). **Still to do:** Protocol Builder draft recovery and Undo.
- 🟡 §3 **Every metric understandable:** chart text parity is done. **Still to do:** shared display rules per metric, plus a fixture showing table, chart, header and feed agree.
- 🟡 §4 **Shorter training journey:** completed sets can be reopened (ADR-0089), set table (ADR-0114), keypads (ADR-0093). Previous-performance suggestions aren't checked.
- ⬜ §5 **Explain the self-paced model before consequential actions** (advancement, supersede, blocked corrections).
- 🟡 §6 **First use and progressive disclosure:** onboarding exists. **Still to do:** fitness anchors and better empty-state next steps.
- ✅ §7 **Catalog quality:** equipment vocabulary, admin curation, retire/delete, enrichment (#501–#508, #305–#309, ADR-0075/0076/0077).
  - ⬜ **User correction channel** ("Wrong equipment", "Duplicate", "Unclear steps" reports feeding a review queue).
- 🟡 §8 **Inspectable generation:** async job states exist. **Still to do:** a generation **evaluation set** and explaining substitutions.
- 🟡 §9 **User control over data:** JSON/CSV export is done (#409, ADR-0062).
  - ⬜ **Account deletion flow** covering identity, DB, telemetry, local state and backups.
- ✅ §10 **Accessibility through shared components** (ADR-0093/0103/0104/0107, form accessibility, contrast floor, reduced motion).
- ✅ §11 **One design system before more skins:** semantic tokens, skins (Pulse, Alpine, Clay, Track, Aurora, Vercel), contrast floor (ADR-0050/0070/0081).
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
  - ⬜ Protocol library and explicit switching (needs an ADR; changes ADR-0037).
  - ⬜ Cross-device resume.
  - ⬜ More capable offline training (see §3).
  - 🟡 Units, import and portability: kg/lb is done (#408); **import** is still to do.
  - ⬜ Optional, user-scheduled reminders.
  - 🟡 Explainable progression: Scheme Preview exists; the "why this load" sentence doesn't.
  - ✅ Sharing: revocable share-by-copy (ADR-0057/0058).
- 🚫 §17 **Deliberately deferred:** social network, native/wearables, more AI providers for breadth, automatic catalog merges, a new DB or ledger, lots of skins and 3D, recovery scores.

## 8. Research-sourced feature backlog (July 2026)

Source: [next-feature](docs/research/next-feature.md).

- ⬜ **Conversational coach layer** (natural-language front end to regenerate, substitute and adjust).
- 🟡 **Adaptive progression narration:** Scheme Preview shipped; a per-decision "why" on the Next Session card hasn't.
- ⬜ **Type-neutral coaching narrative** (copy that presents yoga and mobility users as first-class).
- ⬜ **Voice-guided Live Session** (Web Speech API).
- ⬜ **On-device rep counting** (exploratory).
- ✅ **Rest timer and Superset round cues.**
- ⬜ **Apple Health / Health Connect write-out** (a PWA can't reach HealthKit; ties to the native question).
- 🚫 **Recovery signals / readiness %:** deliberately not adopted (ADR-0001). Carried as open question Q1 in 10-05: hold the line, or add a bounded lane feeding only the 3-state signal?
- ✅ **Strength Analytics** (ADR-0024).
- ✅ **Data export** (JSON + CSV).
- ✅ **Muscle Group Coverage**, reframed as a neutral signal (ADR-0025), then the per-muscle **Atlas** (#539–#545, ADR-0079).
- 🟡 **Weekly consistency and streak surfacing:** Streak, heatmap, achievement wall and Home fan-out are done (#165–#167, #377). "Progress toward next unlock" isn't checked.
- 🚫/⬜ **Social comparison and challenges:** treated as a large separate effort; Gript audit says not to build a feed.
- ⬜ **Shareable milestone cards** (PR, Streak, Level image).
- 🟡 **iOS storage resilience:** see §3.
- ✅ **Accessibility pass** (contrast, reflow, charts, forms, motion; validation docs under `docs/development/`).
- ✅ **Offline-first logging:** finish outbox.
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
- ✅ P2-11 **Don't build a social feed** (share-by-copy already shipped).
- ❔ §10 **Phone verification checklist** for the Gript claims.

## 10. View Transitions

Source: [view-transitions-audit](docs/research/audit/vercel/view-transitions-audit.md). All eight steps are in the source (ADR-0118 to ADR-0124). Each was checked with real components in Chromium. None has been checked through the Next router in the running app, and no CI journey drives a navigation yet (audit §11).

- ✅ 0. Turn on `experimental.viewTransition` and add the type shim. Already covered by the dependency bumps: Next 16.3.8 removed the flag (VTs are on by default, so adding it now only triggers an unrecognized-key warning), and `react`/`@types/react` 19.3.0 export and type `ViewTransition` and `addTransitionType`. No shim is needed. See the audit's §1 addendum.
- ✅ 1. Reduced-motion CSS, its ADR, and a guard that fails closed. The off switch is in `app/globals.css` (`@layer base`, `animation: none !important` on all four `::view-transition-*` pseudo-elements). The rule is ADR-0118, and the guard is `lib/view-transition-motion-policy.ts`, which also covers stylesheet movement and `<ViewTransition>` callbacks. Checked once in Chromium, but no journey covers it yet (audit §11).
- ✅ 2. Isolate persistent shell elements (`viewTransitionName`). The header, tab bar, sidebar and sync toast are pinned through `lib/persistent-transition.ts` and frozen in `globals.css` (chrome at z-index 100, toast at 200). The three blurred elements drop their old snapshot. The rule is ADR-0119, and `persistent-transition-policy.ts` guards the CSS and the call sites. Checked once in Chromium, not in the running app. The toast's own enter/exit is still step 7.
- ✅ 3. Workout Signature sigil morph across the three surfaces (fix the `/train` collision). `WorkoutSigil morphSessionId` claims `session-sigil-<id>`. The detail page always claims, My Sessions rows claim through `claimsSigilMorph`, and the Home hero claims only for a real Next Session. The root is live, so the page swaps instantly under the moving sigil. `/sessions/[id]` dropped its route-level `loading.tsx` so the header and sigil commit with the navigation, the prescription cards stream behind an in-page `<Suspense>`, and `/log` got its own skeleton. The `/train` collision no longer exists (no library on `/train`), and the claim is opt-in so it can't come back. The rule is ADR-0120, guarded by `view-transition-boundary-policy.ts`. Checked through React in Chromium, not through the Next router in the running app.
- ✅ 4. Directional page transitions (`nav-forward` / `nav-back`); fix `NavigationGuardProvider.tsx:146`. One `RouteTransition` keyed on the pathname in the root layout, instead of a wrapper per page. Links spread `NAV_FORWARD`, and `BackLink` spreads `NAV_BACK` once for every back control. Untagged navigations (tabs, query swaps, redirects) stay instant. The guard now reads the clicked link's `data-nav-direction`, so a confirmed Discard slides the same way the click would have. The rule is ADR-0121, guarded by `nav-direction-policy.ts`. Checked through React in Chromium, not through the Next router in the running app.
- ✅ 5. Strength pager as a sequential slide. `Older →` spreads `NAV_FORWARD` and `← Newer` spreads `NAV_BACK`. `TimelinePageTransition` wraps only the Personal Records card, keyed on `offset`, because the path-keyed `RouteTransition` doesn't remount on a query change. `loading.tsx` stays: Next keys the segment's loading boundary without search params, so a page turn keeps the current records on screen until the next page is ready. The rule is ADR-0122. Checked through React in Chromium.
- ✅ 6. Suspense reveals on the seven `loading.tsx` routes. Extended to all 15 route skeletons and to the in-page card skeleton on Session detail. Every `loading.tsx` returns `SkeletonPage`: the header stays in the live root and is swapped instantly, and only the data region fades off (250ms, opacity only) over content that is already painted. The header was pixel-identical mid-reveal when measured. The two `fallback={null}` boundaries are left alone, as the audit asks. The rule is ADR-0123, guarded by `skeleton-reveal-policy.ts`. Checked through React in Chromium.
- ✅ 7. Enter and exit animations for the resume banner and sync toast. The banner sets its slot in `startTransition`. The toast mounts on `useDeferredValue` of its visibility, because its inputs are plain state updates. Both rise in over 200ms and sink out over 150ms, with the toast at the overlay z-index. The toast's pinned `role="status"` region now stays mounted and the body animates inside it, because React overrides a pinned name on a boundary's own root. The rule is ADR-0124, and a new check in `persistent-transition-policy.ts` enforces it. Checked through React in Chromium.

## 11. PULSE identity and microinteractions

Sources: [pulse-creative-directions](docs/design/pulse-creative-directions.md), [microinteraction-ideas](docs/design/microinteraction-ideas.md).

**Creative directions: first release**
- ✅ Workout Signature sigil (`lib/workout-sigil.ts`) as each workout's recognizable mark.
- ⬜ Collectible **completion card** at the end of a workout.
- ❔ Signature **rest-timer instrument**.
- ✅ Compact **training route** on Home (`pulse/training-route`).
- 🟡 Exercise "field guide": catalog taxonomy and drawer are done; the visual field-guide treatment isn't.
- ⬜ Progress stories and the personal **training passport**.
- ✅ Atlas instead of anonymous muscle bars.
- ✅ Skins: Alpine, Clay, Track and more.

**Microinteractions: suggested order** (none found in the code; implementation not confirmed)
- ⬜ 1. Tactile set-completion check, plus a calm handoff to the next exercise.
- ⬜ 2. Workout signature stamp, plus quiet sync acknowledgement.
- ⬜ 3. Builder placement feedback, plus superset connection.
- ⬜ 4. Route, atlas selection, heatmap day inspection, achievement stamp, favorite confirmation, menu emergence, generation resolving into a signature.

## 12. Validation and accessibility follow-ups

Sources: `docs/development/*`, [audit 09-28](docs/research/audit/2026-09-28.md).

- ✅ Narrow-screen reflow at 320px and 200% text (#570, #572).
- ✅ Every plotted value exposed as text (ADR-0084, #569).
- ✅ Previous-attempt / faded-text contrast (#566, #567, #568).
- ✅ Reduced motion while loading (#565, ADR-0082).
- ✅ Widened Contrast Floor, retuned accents, contrast matrix (#558–#563).
- ✅ Completed set stays legible (#560).
- ✅ Form labels, hints, errors and announcements (form-accessibility handoff).
- ✅ Catalog stale-response ordering guard (audit 09-24, rank 3).
- ⬜ **CH-F3 Atlas heat-magnitude gap:** the heat uses emphasis-weighted volume but the text shows set counts. Needs owner sign-off on the wording first.
- ❔ **Manual accessibility journeys** (AUTH, CAT, PROF, LOG, SAVE in [accessibility-journeys](docs/development/accessibility-journeys.md)) with a real screen reader.
- ❔ **WebKit / real iPhone runs** for reflow, resilience and charts (Chromium only so far).

## 13. Deployment: Hostinger VPS migration

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

## 14. Already delivered (closed GitHub epics)

For reference: every one of these epics and its slices is closed.

- ✅ MVP slices 1–12: auth, profile, generation, logging, Protocols, cache, async, progression, level folding (#2–#14).
- ✅ Pluggable LLM providers: Anthropic, OpenAI, Google, OpenRouter (#33–#37).
- ✅ Program → Protocol rename and terminology guard (#44–#48).
- ✅ F1 Home, F2 Live Session, F3 Analytics, F4 Builder, F5 Profile gamification, F6 Exercise Detail (#54–#135).
- ✅ Supersets (#152–#157), Strength Analytics (#175–#179), Coverage (#186–#189), calisthenics and bodyweight (#195–#209).
- ✅ Plan-less logs and the Quantity axis (#233–#239), Log Correction (#247–#250), nonce CSP (#254, #257).
- ✅ Hand-Authored Session (#285–#301), Catalog Completeness and Enrichment (#305–#309), Theme and Skins (#328–#332).
- ✅ Prescribed Quantity (#340–#345), Repeat, Capture and Insert (#356–#360), Pin, later retired (#368–#371), Training Heatmap (#377–#379).
- ✅ My Sessions: name, favorite, share and redeem (#393–#399), offline finish, units and export (#407–#419).
- ✅ Progression Schemes (#427–#434), set semantics (#448–#454), Prescription editor (#462–#469).
- ✅ Admin catalog curation (#501–#508), per-muscle Atlas (#539–#545), Contrast Floor (#558–#567), reflow (#570, #572).
- ✅ Calibration (ADR-0111), Declared vs Effective Fitness Level (#603–#606), reopenable live set (ADR-0089), Logged Set built once (ADR-0115).
