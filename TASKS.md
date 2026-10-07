# TASKS

All the actions and tasks planned across `docs/` and the GitHub tracker, each with
its current status. Reviewed on **2026-10-07** against `main` at `134c9d9`.

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
- ❔ **Re-pull `postgres:16-alpine` (≥16.15) and `redis:7-alpine` on the next deploy.** Once `chore/redis-8` (#627) merges, move Redis to 8 instead, following the VPS guide's "Moving an existing install to Redis 8" steps. A rollback then needs an empty Redis volume.
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

## 4. Dependency majors (plan them; don't bundle them)

Source: [research 2026-10-05](docs/research/2026-10-05.md) → Next action 8. One issue per item.

Status on **2026-10-07**: each item is done on its own pushed branch, **not yet merged**. The
issues were not opened, because the GitHub connector was unavailable. Together the branches pass
typecheck, the 1821 web tests, `next build` and `audit/charts.mjs` parity.

**Merge order:**
1. Merge `chore/typescript-7` first. On `chore/clerk-core-3`, `lib/clerk-import-policy.ts`
   must then import `ts` from `@typescript/typescript6` (ADR-0116), or the type-check fails.
2. Resolve `package.json` / lockfile conflicts by re-running each branch's `npm install`, not by
   hand.
3. `README.md` (node vs python) and `.claude/rules/web/frontend.md` (TS vs Clerk) conflict on
   adjacent lines; keep both sides.

- 🟡 React 19.2.7 → 19.3 (re-run the ADR-0036 Trusted Types check). **Branch `chore/react-19.3`.**
  - Next 16.3.8 already bundles React `19.3.0-canary` for the App Router, so the pin aligns the
    tests, the harness and the types.
  - Trusted Types (new `audit/trusted-types.mjs`, [write-up](docs/development/trusted-types-react-19.3.md)):
    React adds no violations. The blockers are Clerk's script injection and our own
    `serviceWorker.register('/sw.js')`, which needs a TT policy.
  - Still to do: post the result on #254, and re-run over the signed-in flows (sign-in modal,
    dashboard, Live Session, builder DnD) with a real Clerk instance.
- 🟡 recharts 2.15.4 → 3.x (gate on parity with `audit/charts.mjs`). **Branch `chore/recharts-3`, 3.10.1.**
  - Parity in Chromium: 729/729 tooltips, 695 value points, 65/65 tables, the same tab stops.
  - Recharts 3's default `accessibilityLayer` made every chart SVG an unnamed tab stop. It is
    switched off, and `chart-values-policy` now fails a plot root that leaves it on, even in an
    exempt file.
  - Accepted differences: the tooltip comes before the SVG in DOM order, and 7 top-set cases get
    one extra Y tick. Chart chunks grew about +21 KB gz and stay lazy.
  - Still to do: the WebKit half of `charts.mjs` (not available in the sandbox).
- 🟡 TypeScript 5.9.3 → 6 → 7 (add a CI `tsc --noEmit` job first). **Branch `chore/typescript-7`, 7.0.2.**
  - The new `npm run typecheck` CI job runs `next typegen && tsc --noEmit` on Node 24.
  - TS 7 ships no JS compiler API, so the `lib/*-policy.ts` guards and the tsx harness use
    `@typescript/typescript6` (ADR-0116).
  - Still to do: make the job a required check. `main` has no branch protection, so a red run
    doesn't block a merge.
- 🟡 Clerk Core 3 (`@clerk/nextjs` 7). Core 2 LTS ends around March 2027. Offline `getToken()` now throws, so audit every `apiSend`/`apiGet` catch path. **Branch `chore/clerk-core-3`, 7.9.11.**
  - `SignedIn`/`SignedOut` still import but throw on render. They are replaced with `<Show>`, and
    `clerk-import-policy` guards against them.
  - Audit ([write-up](docs/development/clerk-core-3-upgrade.md)): the only `getToken()` is
    server-side and makes no network call, so `ClerkOfflineError` can't reach the transport, and
    no caller catches a Clerk error class.
  - Still to do: a real sign-in, refresh and sign-out against a live instance, and an offline
    cold start of the installed PWA (add it to the §2 matrix).
- 🟡 Node 24/26 for Docker and CI. **Branch `chore/node-24`.**
  - 24 is Active LTS; 26 isn't LTS until late October.
  - npm 11 gates install scripts, and `@clerk/shared`'s telemetry postinstall is denied in
    `allowScripts`.
  - Verified: the image builds and serves `/` with a 200.
- 🟡 Python 3.13/3.14 for the API image. **Branch `chore/python-3.13`, chose 3.14.**
  - 2783/2783 tests pass on both 3.13 and 3.14.
  - The image migrates 0001 → 0044 on Postgres 16 and authenticates a real RS256 token.
  - CI now tests only 3.14, so the `requires-python >=3.11` floor goes untested.
- 🟡 lucide-react 1.23 → 1.52. **Branch `chore/lucide-1.52`.** None of the 62 icons is renamed or deprecated. Only the merge is left.
- 🟡 Redis 7 → 8, and a Postgres 16 → 18/19 decision (Q6). **Branch `chore/redis-8`.**
  - The app's Redis moves to `redis:8-alpine`. Cache and RQ were checked on 8.10.2, and a
    Redis 7 AOF loads in place.
  - Postgres: ADR-0117 is **proposed**. It recommends staying on 16 and doing one 16 → 19
    dump/restore after 19.1 ships, with the restore drill. **Needs the owner's sign-off.**

### Found during the majors work

- ⬜ **Every authenticated API request fetches the JWKS first**, even without a token (`get_jwks` is a FastAPI dependency). If Clerk's JWKS is unreachable, every call returns 500 instead of 401/503.
- ⬜ **A Trusted Types policy for the service-worker registration** (`components/ServiceWorkerRegistrar.tsx`), needed before ADR-0036 enforcement.
- ⬜ **Make the CI checks required** with branch protection or a ruleset on `main`.

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
  - 🟡 A **blocking** production build and type-check (`next build` only runs in the advisory Lighthouse job). A `tsc --noEmit` job is on `chore/typescript-7`, but it isn't a required check yet. `next build` is still advisory.
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

Source: [view-transitions-audit](docs/research/audit/vercel/view-transitions-audit.md). Nothing implemented yet; there's no `ViewTransition` in the code.

- ⬜ 0. Turn on `experimental.viewTransition` and add the type shim.
- ⬜ 1. Reduced-motion CSS, its ADR, and a guard that fails closed.
- ⬜ 2. Isolate persistent shell elements (`viewTransitionName`).
- ⬜ 3. Workout Signature sigil morph across the three surfaces (fix the `/train` collision).
- ⬜ 4. Directional page transitions (`nav-forward` / `nav-back`); fix `NavigationGuardProvider.tsx:146`.
- ⬜ 5. Strength pager as a sequential slide.
- ⬜ 6. Suspense reveals on the seven `loading.tsx` routes.
- ⬜ 7. Enter and exit animations for the resume banner and sync toast.

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
