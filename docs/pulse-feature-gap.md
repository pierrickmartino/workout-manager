# Pulse — Unimplemented Feature Gap Analysis

A comparison of the **Pulse** design variant (`docs/design/pulse.pen`, 11 screens) against the
current Workout Manager web app (`apps/web/app`).

**Legend:** ❌ missing · 🟡 partial (data/model exists, designed UX does not) · ⭐ highest-leverage gap

> **Key finding:** The API is complete for the plan/record loop (generate, log, feedback,
> regenerate, substitute, progress, metrics). Almost every Pulse gap is **frontend experience**,
> plus two net-new capabilities: a **PR/1RM/volume engine** and a **gamification layer**.
> The current app is a functional, unstyled, form-driven prototype.

---

## Onboarding & Auth (FO1–FO4)

Current state: a single Clerk modal sign-in + one flat profile form (`app/onboarding`).

- ❌ **Welcome / splash screen** (FO1) — branding, tagline ("Train by the numbers"), `INITIALIZE` / `LOG IN`.
- 🟡 **Favorite training-types step** (FO2) — multi-select of the domain's `TRAINING_TYPES` (strength / cardio / hiit / yoga / mobility). The chosen set becomes the keys of `fitness_levels`; the model exists and the profile-edit form already writes these, but the onboarding multi-select UX does not.
- 🟡 **Per-type level calibration** (FO3) — a 1–10 level for each selected training type. Maps **directly** onto `fitness_levels: Record<string, number>`; `app/profile/edit` already renders `level_<type>` inputs, so only the designed stepper/scale onboarding UX is missing.
- ❌ **Multi-step onboarding wizard** — the `01/03 → 03/03` stepper; current onboarding is one flat form.
- ❌ **Social auth** (FO4) — "Continue with Apple / Google".

## F1 — Home / Dashboard

Current state: profile fields in a `<dl>` + text links (`app/dashboard/page.tsx`).

- 🟡 **"Today's Protocol" hero card** — `INITIATE SESSION`, duration, volume, target kcal. Backing data exists (program detail computes self-paced "Next up"); needs a dashboard surface.
- ❌ **Readiness score** ("87% READY").
- ❌ **Week Cycle strip** — M–S day dots with current position (`04/05`).
- ❌ **Queued Protocols list** — upcoming sessions with per-session completion/readiness %.
- ❌ **Personalized greeting** ("Hey, Pierrick").

## F2 — Active / Live Session ⭐ (largest gap)

Current state: logging is a static, after-the-fact form (`LogSessionForm`). No live workout mode.

- ❌ **In-progress session screen** — module `03/07`, `43% COMPLETE`.
- ❌ **Live set-by-set table** — previous-performance column, editable kg/reps, per-set completion check, `COMPLETE SET`.
- ❌ **Rest timer** — countdown with `−15 / SKIP / +15`, auto-resume next set. No timer anywhere in the app.
- ❌ **Elapsed workout timer** (`12:48`).
- ❌ **Next-exercise preview** ("Incline Dumbbell Press").

## F3 — Analytics

Current state: none. `app/metrics` is a body-weight table; `app/history` is a plain list. No charting dependency installed.

- ❌ **Total volume chart** with trend + % delta ("128,400 KG · +12%").
- ❌ **Range toggle** (7D / 30D / 1Y).
- ❌ **Bento stats** — sessions, avg time, new PRs, active days.
- ❌ **Muscle distribution** (Chest 28% / Back 24% / Legs 30% / Arms 18%).
- ❌ **Recent Records / PR feed**.

## F4 — Program Builder

Current state: AI generation form + read-only program view (`app/programs/new`, `app/programs/[id]`). No manual/visual builder.

- ❌ **Visual week matrix** — M–S grid with per-day module counts.
- ❌ **Day/module editor** — add, remove, edit Exercise Prescriptions (sets×reps, load) directly.
- ❌ **`ADD MODULE`** interaction.
- ❌ **Exercise Library browser** — searchable catalog ("420 movements", `QUERY MOVEMENTS…`). No exercise-search UI exists.
- ❌ **Protocol config panel** — frequency / cycle length / mode as editable knobs.
- ❌ **`SIMULATE` / `DEPLOY PROTOCOL`** flow.

## F5 — Profile

Current state: a profile-edit form (`app/profile/edit`).

- ❌ **Gamification** — user Level + XP with progress-to-next ("LVL 12 · 760 XP → LEVEL 13"). *(Separate from the domain's per-type `fitness_levels`.)*
- ❌ **Lifetime stats** — total workouts, total hours, current streak.
- ❌ **Achievements / badges** — locked & unlocked states, "See all".
- ❌ **Settings panel** — units (kg/lb), default rest-timer duration, appearance (dark/light).
- ❌ **Health integrations** — Apple Health linking.
- ❌ **Account section** — notifications, privacy & data, help & support, log out (only Clerk's `UserButton` today).

## F6 — Exercise Detail

Current state: name, description, difficulty, muscles, variations/alternatives (`app/exercises/[id]`).

- ❌ **Tabbed layout** — Specs / History / Records.
- ❌ **Numbered execution steps** — instructions exist in the catalog but aren't rendered step-by-step.
- ❌ **Muscle map** — primary/secondary visualization.
- ❌ **Per-exercise stats** — Personal Best, estimated 1RM, total logs count.
- 🟡 **Top-set trend chart** — last N sessions ("+7.5KG"). `/exercises/[id]/progress` returns the time series; needs charting.
- ❌ **`ADD TO PROTOCOL`** action.

## Cross-cutting / Foundational

- ❌ **Bottom tab bar navigation** — Pulse's `F-TabBar` (Home / Session / Analytics / Builder / Profile). Today nav is a single top header link.
- ❌ **Design system** — Pulse's dark, mono-accented "operator" theme + tokens (`$f-text-primary`, `$f-r-md`, …). App uses default `system-ui` with inline styles.
- ❌ **Personal Records (PR) engine** — 1RM estimation, PR detection/history. Feeds Analytics, Home, and Exercise Detail; no backing logic today.
- ❌ **Readiness / target-calorie metrics** — surfaced across Home & Active Session.
- ❌ **Streak tracking** — appears on Profile and implicitly in Analytics ("active days").

---

## Highest-leverage missing capabilities (suggested build order)

1. **Live Active Session + rest timer** (F2) — the core loop; currently the biggest functional hole (logging is post-hoc only).
2. **PR / 1RM / volume analytics engine** — a shared backend capability powering F3 (Analytics), F6 (Exercise Detail), and F1 (Home).
3. **Gamification layer** (XP / levels / streaks / achievements) — powers F5 and recurs on Home & Analytics.

Everything else is largely presentation over data models that already exist (programs, sessions,
prescriptions, logs, metrics, exercise catalog).
