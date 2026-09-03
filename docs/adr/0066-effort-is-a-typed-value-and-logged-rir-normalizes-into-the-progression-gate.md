# 0066 — Effort is a typed value (RPE or RIR), and logged RIR normalizes into the progression gate

The record already carries `LoggedSet.perceived_difficulty`, an "RPE-style 1–10" int
that is the user's Performance Feedback *and* the signal Double Progression's
`_low_effort` gate reads (a load step needs every set at the rep ceiling **and**
`perceived_difficulty ≤ 7`, ADR-0004/0064). But effort has two common scales — **RPE**
(rate of perceived exertion, higher = harder) and **RIR** (reps in reserve, higher =
easier) — and users want to log and prescribe in whichever they think in. We make
**Effort a typed value** `{scale: "rpe" | "rir", value}` — the same typed-value pattern
as **Load** (ADR-0010) and **Quantity** (ADR-0032), never a bare number whose scale is
guessed — and add a plan-side **Target Effort**. The surprising, load-bearing part is
that this touches the *existing progression gate*: a logged RIR must **normalize** so
that gate keeps working, and Target Effort deliberately does **not** become a new
progression input.

## The typed value

`Effort = {scale, value}` where:

- **`rpe`**: `0–10`, half-steps allowed (`6`, `6.5`, `7`, …) — the conventional RPE
  resolution.
- **`rir`**: integer `0–5`, with `5` read as a "5+" ceiling (reps-in-reserve past five
  is not meaningfully distinguished).

The scale is stored, never inferred; display is a **read-time projection** that can
render either scale for the reader, the same species as Tempo's phase expansion or the
kg/lb Weight-Unit projection (ADR-0047). The relationship the domain uses is the
standard `rpe ≈ 10 − rir`.

## Two distinct concepts, not one

- **Target Effort** is a **plan** target on the `ExercisePrescription` — "aim for RPE 8"
  / "leave 2 in reserve". It is prescription-level (ADR-0065's homogeneous plan), a
  *plan* value carried across Duplicate/Redeem/Share/Substitution and unset by Capture.
- **Effort** (the logged one) is a **record** value on the `LoggedSet` — what the user
  actually felt — and *is* Performance Feedback. It replaces the role of the 1–10
  `perceived_difficulty` int while keeping that column readable.

These are never collapsed, the same discipline that keeps Generation Feedback and
Performance Feedback separate (CONTEXT: Feedback).

## Logged RIR must normalize into the existing gate

This is the decision that earns the ADR. Double Progression already reads the record's
effort (`_low_effort`, `perceived_difficulty ≤ LOW_EFFORT_MAX = 7`). Once a user can log
effort as **RIR**, the gate can no longer read a raw int:

- The gate reads the typed **Effort**, normalizing any `rir` value to its RPE-equivalent
  (`10 − rir`) before comparing to `LOW_EFFORT_MAX`. A set logged at "3 RIR" is
  low-effort (≈ RPE 7) exactly as "RPE 7" is; the scheme behaves identically whichever
  scale the user logged in.
- The legacy int keeps reading as an `rpe`-scale Effort, so existing records step
  exactly as before.

**Target Effort is not a progression input in v1.** Progression stays a function of
logged reps + *logged* effort, as today; the *prescribed* target feeds the Scheme
Preview and the UI, not the stepping maths. Feeding a plan target into progression is a
real behavioural change (it would let the plan, not the record, move the load) and is
deferred deliberately.

## Migration and back-compat

Additive, nullable, one Alembic migration:

- **`ExercisePrescription`**: `target_effort: dict | None` (typed Effort JSON).
- **`LoggedSet`**: `effort: dict | None` (typed Effort JSON). `perceived_difficulty:
  int | None` is **retained** and read as an `rpe`-scale Effort.

For one release new writes **dual-write**: they populate `effort` and mirror an
RPE-scale value into `perceived_difficulty`, and the progression gate is flipped to read
`effort` in the same change. The `perceived_difficulty` mirror is retired later once no
reader depends on it. Every existing row reads its int as RPE; no backfill.

## Terminology reconciliation

`CONTEXT.md` lists "RPE (loosely)" under **Performance Feedback**'s `_Avoid_` — RPE is
now a legitimate *Effort scale*, so that line is narrowed: RPE/RIR name the Effort
scales; the whole Performance-Feedback concept is still not called "RPE". No new
terminology-guard `BANNED_TERMS` entry is required — nothing is renamed away, only
added.

## Considered options

- **Two columns (`rpe`, `rir`)** — rejected: a bare-number-per-scale shape re-guesses
  meaning and duplicates validation; a typed `{scale, value}` value is the established
  Load/Quantity pattern.
- **Normalize everything to RPE on write** — rejected: it discards which scale the user
  actually used, so display can't honour their mental model; we store the scale and
  project for display, normalizing only *inside* the gate.
- **Make Target Effort a progression input now** — rejected: it lets the plan move the
  load (the record should), a behavioural change worth its own decision later.
- **Leave `perceived_difficulty` as the only effort field** — rejected: it can't express
  RIR and forces every user into one scale.

## Consequences

- **The progression gate reads a typed value.** `_low_effort` normalizes RIR→RPE; its
  threshold and behaviour are otherwise unchanged, so no existing record steps
  differently.
- **Effort is loggable and prescribable in either scale**, displayed per reader.
- **The record gains one nullable column and keeps the old int** for a release; the plan
  gains one nullable column.
- **Back-compat is total**: legacy `perceived_difficulty` reads as RPE Effort, and an
  unset Target Effort prescribes nothing.
