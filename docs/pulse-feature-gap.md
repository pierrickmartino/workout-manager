# Pulse — Unimplemented Feature Gap Analysis

A comparison of the **Pulse** design variant (`docs/design/pulse.pen`, 11 screens) against the
current Workout Manager web app (`apps/web/app`).

**Legend:** ❌ missing · 🟡 partial (data/model exists, designed UX does not) · ✅ shipped since this analysis · ⭐ highest-leverage gap

> **Key finding:** The API is complete for the plan/record loop (generate, log, feedback,
> regenerate, substitute, progress, metrics). Almost every Pulse gap is **frontend experience**,
> plus two net-new capabilities: a **PR/1RM/volume engine** and a **gamification layer**.

> **Update (2026-07-03):** The Pulse **presentation layer has since shipped** — the full dark
> "operator" theme is transcribed into `app/globals.css` (`@theme` tokens, Space Grotesk +
> JetBrains Mono via `next/font`), backed by a shadcn `components/ui/*` primitive set and a
> custom `components/pulse/*` component library, applied across **every** page. A fixed bottom
> `TabBar` and a slim branded top bar are wired into the root layout. This closes the two
> **Foundational** presentation gaps and the Home greeting; it does **not** close any feature
> capability — there is still no charting dependency, no live-session/timer, and no PR or
> gamification logic. The remaining gaps below are the *capabilities* the styling now frames.

---

## Onboarding & Auth (FO1–FO4)

Current state: a single Clerk modal sign-in + one flat profile form (`app/onboarding`).

- ❌ **Welcome / splash screen** (FO1) — branding, tagline ("Train by the numbers"), `INITIALIZE` / `LOG IN`.
- 🟡 **Favorite training-types step** (FO2) — multi-select of the domain's `TRAINING_TYPES` (strength / cardio / hiit / yoga / mobility). The chosen set becomes the keys of `fitness_levels`; the model exists and the profile-edit form already writes these, but the onboarding multi-select UX does not.
- 🟡 **Per-type level calibration** (FO3) — a 1–10 level for each selected training type. Maps **directly** onto `fitness_levels: Record<string, number>`; `app/profile/edit` already renders `level_<type>` inputs, so only the designed stepper/scale onboarding UX is missing.
- ❌ **Multi-step onboarding wizard** — the `01/03 → 03/03` stepper; current onboarding is one flat form.
- ❌ **Social auth** (FO4) — "Continue with Apple / Google".

## F1 — Home / Dashboard

Current state: styled dashboard with greeting, a hero CTA card, a nav-row list, and a `DataList` profile snapshot (`app/dashboard/page.tsx`).

- 🟡 **"Today's Protocol" hero card** — a styled hero card now exists, but it's a **generate-training CTA** (Generate a program / a workout), not the designed session hero (`INITIATE SESSION` with duration, volume, target kcal). Backing "Next up" data exists in program detail; surfacing a real *today's session* still needs building.
- ❌ **Readiness score** ("87% READY") — a *static* `READY` / `EXTRA CAUTION` badge (derived from `is_sensitive`) now renders in the header, but the computed percentage score does not exist.
- ❌ **Week Cycle strip** — M–S day dots with current position (`04/05`).
- ❌ **Queued Protocols list** — upcoming sessions with per-session completion/readiness %.
- ✅ **Personalized greeting** ("Hey, {display_name}") — shipped.

## F2 — Active / Live Session ⭐ (largest gap)

Current state: logging is a static, after-the-fact form (`LogSessionForm`). No live workout mode.

- ❌ **In-progress session screen** — module `03/07`, `43% COMPLETE`.
- ❌ **Live set-by-set table** — previous-performance column, editable kg/reps, per-set completion check, `COMPLETE SET`.
- ❌ **Rest timer** — countdown with `−15 / SKIP / +15`, auto-resume next set. No timer anywhere in the app.
- ❌ **Elapsed workout timer** (`12:48`).
- ❌ **Next-exercise preview** ("Incline Dumbbell Press").

## F3 — Analytics

Current state: no analytics surface. `app/metrics` is a (now styled) body-metric table; `app/history` is a (now styled) session list. Both are lists/tables, not charts — no charting dependency installed.

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
- ❌ **Settings panel** — units (kg/lb), default rest-timer duration, appearance. *(The app is now committed dark-only via `globals.css` `color-scheme: dark`; a light theme would be net-new.)*
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

- ✅ **Bottom tab bar navigation** — a fixed `TabBar` (`components/pulse/tab-bar.tsx`) is wired into the layout for signed-in users. **Deviation:** it collapses Pulse's five tabs into **four** — Home / Train / Stats / Profile — mapping onto *existing* routes (`/dashboard`, `/sessions`, `/history`, `/profile`), because the dedicated Session / Analytics / Builder destinations don't exist yet. Re-expanding to five tabs is a follow-up once F2–F4 land.
- ✅ **Design system** — Pulse's dark, mono-accented "operator" theme is transcribed into `app/globals.css` as `@theme` tokens (`--color-*`, `--radius-*`, `--spacing-shell`, fonts via `next/font`), consumed through shadcn `components/ui/*` + custom `components/pulse/*` primitives across all pages. Replaces the former `system-ui` + inline styles.
- ❌ **Personal Records (PR) engine** — 1RM estimation, PR detection/history. Feeds Analytics, Home, and Exercise Detail; no backing logic today.
- ❌ **Readiness / target-calorie metrics** — surfaced across Home & Active Session.
- ❌ **Streak tracking** — appears on Profile and implicitly in Analytics ("active days").

---

## Highest-leverage missing capabilities (suggested build order)

1. **Live Active Session + rest timer** (F2) — the core loop; currently the biggest functional hole (logging is post-hoc only).
2. **PR / 1RM / volume analytics engine** — a shared backend capability powering F3 (Analytics), F6 (Exercise Detail), and F1 (Home).
3. **Gamification layer** (XP / levels / streaks / achievements) — powers F5 and recurs on Home & Analytics.

With the Pulse presentation layer now in place (theme, shell, tab bar, styled screens), the
remaining work is **capability, not styling**: the three items above are net-new logic, and the
lower-leverage gaps (Analytics charts F3, Program Builder F4, Exercise Detail tabs/charts F6) are
mostly *wiring already-existing data* (programs, sessions, prescriptions, logs, metrics, exercise
catalog, the `/exercises/[id]/progress` time series) into the styled components — the main missing
dependency there is a charting library, which is not yet installed.
