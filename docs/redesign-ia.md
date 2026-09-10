# Redesign: Role-aware, intent-first information architecture

Status: **plan / agreed** (design session, 2026-09-10). Implementation is a follow-up.
Companion decision record: [`docs/adr/0071-role-aware-intent-first-information-architecture.md`](./adr/0071-role-aware-intent-first-information-architecture.md).

This is the agreed output of a `grill-with-docs` design session. It reshapes how the
three intended audiences reach what they came for, cuts clicks on the recurring verbs,
and audits every page for features that were added incrementally but never earned their
prominence. It introduces **no new domain term** and **no new data model** — every change
here is information architecture and progressive disclosure over capabilities the domain
(`CONTEXT.md`) already defines.

## Who we are designing for

The brief named "three kinds of users." The sharpened model (see ADR-0071) is:

- **User types #1 (AI-protocol follower) and #2 (hand-made author) are intents, not
  accounts.** The same person adopts an AI Protocol *and* logs the occasional ad-hoc
  session. We do **not** branch the app into two persona modes; we keep one unified UI
  and re-optimize its default paths so each intent is near-instant.
- **Admin (#3) is a genuine, orthogonal role** (the Clerk `role=admin` claim, ADR-0046)
  layered on top of an ordinary trainee. It gets its own home instead of hiding in
  Appearance.

## Canonical core intents

The redesign optimizes the paths for these. Core intents (the recurring verbs) must be
near-instant; periodic and browse intents may sit deeper.

| #  | Intent                                   | Type   | Tier    |
|----|------------------------------------------|--------|---------|
| I1 | Start my next prescribed Session         | 1      | **core** |
| I2 | Generate a new Protocol                  | 1      | periodic |
| I3 | Generate a one-off AI workout            | 1      | periodic |
| I4 | **Build a hand-made Session (to run later)** | 2  | **core** |
| I5 | Log a past / ad-hoc workout              | 1 & 2  | **core** |
| I6 | Re-run a saved / recent Session          | 1 & 2  | **core** |
| I7 | Review progress / analytics              | 1 & 2  | browse   |
| I8 | Admin: publish Skin / run enrichment     | 3      | admin    |

## Click budget (the objective definition of "straight to the point")

The redesign must hit these, and they are the acceptance test for implementation:

- **I1** (start next Session): **≤ 1 tap** from app launch — the single most-repeated verb.
- **I4, I5, I6** (core): **≤ 2 taps** from app launch.
- **I2, I3** (periodic): ≤ 2 taps is fine; they need not be on the launch surface.
- **Rare / destructive actions**: exactly **1 tap behind a disclosure** (overflow / "Advanced"),
  never on the primary surface, never removed.

## Two defects this fixes

1. **Hand-authoring is conflated with logging.** Today the *only* door to a hand-made
   Session is **"Log a past workout"** (`/sessions/log`), which builds a plan **and** logs a
   performance in one submit. A user who wants to author a plan to run *later* is forced
   through a past-tense framing. → We split **I4 "Build a workout"** (plan created, no
   Logged Session) from **I5 "Log a past workout"** (records now). This needs no new term
   or model: the domain already supports a Hand-Authored Session with zero Logged Sessions
   (My Sessions lists them; the Delete guard is `Logged Count == 0`). I4 is a new entry
   point plus a mode of `HandAuthoredSessionForm` that skips the "record a performance now"
   step.
2. **Admin has no home.** Two admin-only capabilities exist — Skin publishing (buried in
   `Profile → Appearance`) and **enrichment-backfill** (`POST /exercises/enrichment-backfill`,
   which has **no UI at all**, reachable only by raw API call). → A dedicated `/admin`
   route, reached by an admin-only nav row in Profile, surfaces both.

## Target information architecture

The 4-tab shell (`HOME / TRAIN / STATS / PROFILE`) is **kept** for everyone; a 5th tab for
a role most users never have is a mobile-nav smell. Admin is reached by a conditional nav
row, not a tab.

### HOME (`/dashboard`)

- **Add** a persistent **quick-action row** — `Start next` · `Build` · `Log` · `Recent` —
  rendered in **both** the active-protocol state *and* the empty state (today the empty
  state shows only the AI-generation launchpad, stranding the hand-made author). These are
  *shortcuts* that deep-link straight into each flow. `Start next` satisfies the I1 ≤1-tap
  budget.
- **Keep**: readiness badge, Current Protocol hero + week strip + queue (or the generate
  CTA when there is no Current Protocol), Operator status (Level / XP / Streak), latest PR.
- **Remove from Home**: the full **Fitness Profile snapshot** (11 rows — duplicates Profile)
  and the **"OPERATIONS" nav card** (training history / metric history / edit profile — all
  reachable from STATS and Profile).

### TRAIN (`/train`)

- Stays the **full "start & reuse" hub**, distinct from Home's shortcuts. Launchpad gains a
  **"Build a workout"** card (I4) alongside Generate protocol / Generate workout / Log a
  past workout. Then Recent Sessions → My Sessions → Browse Catalog. Deliberate, intentional
  redundancy with Home's quick actions: the daily verbs are one tap from the launch surface;
  the exhaustive menu lives here. (Thinning Train would make I2/I3 *harder* to find.)

### STATS (`/analytics`) and the record surfaces

- Analytics is content-heavy but coherent; the audit only **demotes duplicated navigation**
  (the "OPERATIONS" card here overlaps Home's now-removed one — keep exactly one home for
  Training history / Metric history).

### PROFILE (`/profile`)

- **Receives** the Fitness Profile snapshot demoted from Home.
- **Gains** an admin-only nav row → **`/admin`** (rendered only for `role=admin`,
  server-resolved; the backend independently gates the underlying actions).

### `/admin` (new, admin-only)

- A simple admin home surfacing **both** power features: **publish the Active Skin**
  (relocated from Appearance) and **run enrichment-backfill** with job status (net-new UI
  over the existing endpoint).

## Per-page feature inventory

Verdicts: **Promote** (make more prominent) · **Keep** (leave as-is) · **Demote** (behind
progressive disclosure / relocate) · **Retire** (remove the affordance; capability, if any,
stays reachable elsewhere). Nothing in the domain is deleted; "Retire" removes a *duplicate
or misplaced affordance*, not a feature.

### HOME (`/dashboard`)

| Feature | Serves | Now | Verdict | Rationale |
|---|---|---|---|---|
| Current Protocol hero (Start next) | I1 | primary | **Promote** | Keep as hero; ensure it is the ≤1-tap Start. |
| Quick-action row (Start/Build/Log/Recent) | I1,I4,I5,I6 | — | **Promote (new)** | The core-verb launch surface; also fills the empty state. |
| Week strip + queue | I1 | primary | Keep | Positional progress, no calendar (ADR-0008). |
| Generate launchpad (empty state) | I2,I3 | primary (empty only) | Keep | Still the no-Protocol CTA; now beside quick actions. |
| Operator status (Level/XP/Streak) | I7 | secondary | Keep | Read-time projection; agrees with Profile. |
| Latest PR | I7 | secondary | Keep | Hidden when none — correct. |
| **Fitness Profile snapshot (11 rows)** | — | secondary | **Retire (from Home)** | Duplicates Profile; demoted there. |
| **"OPERATIONS" nav card** | I7 | secondary | **Retire (from Home)** | Duplicated navigation; single home elsewhere. |

### TRAIN (`/train`)

| Feature | Serves | Now | Verdict | Rationale |
|---|---|---|---|---|
| Generate a protocol | I2 | primary | Keep | Periodic; belongs in the full hub. |
| Generate a workout | I3 | primary | Keep | Periodic. |
| **Build a workout** | I4 | — | **Promote (new)** | Splits plan-authoring out of "Log a past workout". |
| Log a past workout | I5 | primary | Keep | Now clearly "records now" vs Build's "run later". |
| Recent Sessions | I6 | primary | Keep | One-tap re-run; strong. |
| My Sessions link | I6 | secondary | Keep | The library. |
| Browse the Catalog | I7 | secondary | Keep | Discovery, distinct from generation. |

### SESSION DETAIL (`/sessions/[id]`) — the density hotspot (~13 affordances)

| Feature | Serves | Now | Verdict | Rationale |
|---|---|---|---|---|
| Start (Live Session) | I1/I6 | primary | Keep | Primary action. |
| Log this session | I5 | primary | Keep | Primary action. |
| Rename | manage | inline | **Demote** | Into an overflow "⋯" menu. |
| Favorite | manage | inline | Keep | Cheap, frequent toggle. |
| Share | manage | inline | **Demote** | Rare; overflow. |
| Delete | manage | inline | **Demote** | Rare + destructive; overflow, 1 tap deeper. |
| Duplicate | manage | secondary | **Demote** | Rare; overflow. |
| Regenerate | I3 | secondary | **Demote** | Rare; overflow (AI-generated Sessions only). |
| Insert exercise (AddExercise) | edit | secondary | Keep | Core to shaping a standalone plan. |
| Substitute exercise | edit | per-row | Keep | In-context per prescription. |
| Remove exercise | edit | per-row | **Demote** | Behind the per-row disclosure. |
| Scheme control | edit | per-row | Keep | In-context; already collapsed. |
| Harder-variation offer | edit | conditional | Keep | Shown only when relevant. |

Primary surface after: **Start**, **Log**, **Insert**, and the per-row edit controls.
Everything else collapses behind an overflow "⋯" menu (destructive/rare exactly one tap
deeper), per the click budget.

### PROFILE (`/profile`)

| Feature | Serves | Now | Verdict | Rationale |
|---|---|---|---|---|
| Level / Lifetime / Heatmap / Achievements | I7 | primary | Keep | The Profile's reason to exist. |
| Appearance: Mode / Keep-awake / Weight unit | prefs | primary | Keep | The only prefs an ordinary user sets. |
| **Skin publisher (admin)** | I8 | buried here | **Relocate → `/admin`** | Admin power feature; wrong home. |
| Fitness Profile snapshot | — | — | **Promote (received)** | Demoted here from Home. |
| Admin nav row → `/admin` | I8 | — | **Promote (new)** | Admin-only, server-resolved. |
| Edit fitness profile / Sign out | account | primary | Keep | Correct home. |

### `/admin` (new)

| Feature | Serves | Now | Verdict | Rationale |
|---|---|---|---|---|
| Publish Active Skin | I8 | in Profile | **Relocate (here)** | Admin's home. |
| Run enrichment-backfill + job status | I8 | **no UI** | **Promote (new)** | Give the UI-less endpoint a real surface. |

## Explicit non-goals

- **No persona/mode switch.** One unified UI; intents are shortcuts, not account types.
- **No new domain term and no `CONTEXT.md` change.** Every capability already exists.
- **No feature deletion.** "Retire" only removes duplicated/misplaced *affordances*.
- **No 5th tab.** Admin is a conditional nav row, not a tab.
- **No change to plan/record separation, read-time projections, or any load-bearing
  invariant** (`CLAUDE.md`).

## Implementation slices (for the follow-up)

1. **Home quick-action row** + remove the profile snapshot & OPERATIONS card; demote the
   snapshot into Profile. (Delivers I1 ≤1 tap, I5/I6 ≤2 taps.)
2. **"Build a workout"** entry point + `HandAuthoredSessionForm` deferred-logging mode.
   (Delivers I4.)
3. **Session-detail overflow menu** — collapse Rename/Share/Delete/Duplicate/Regenerate/
   Remove behind disclosure. (Delivers the density fix + destructive-behind-disclosure.)
4. **`/admin`** route + admin nav row in Profile; relocate Skin publisher; add
   enrichment-backfill UI. (Delivers I8.)
5. Sweep duplicated navigation (single home for Training/Metric history).
