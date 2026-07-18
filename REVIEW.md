# REVIEW.md

The domain-invariant review checklist for workout-manager. A change that violates
one of these has a bug, not a style preference — the rationale is an ADR, and the
fix is to conform, not to argue. This file exists so that knowing the patterns is
not a prerequisite for contributing: an agent or a first-day engineer can put up a
correct PR, and review (human or automated) catches the rest.

**How to use it:** walk the checklist against the diff. Each item says what to
**reject** and cites the decision that fixes it. Severity follows
[`.claude/rules/common/code-review.md`](./.claude/rules/common/code-review.md):
🔴 CRITICAL blocks merge; 🟠 HIGH should block; 🟡 MEDIUM is advisory.

---

## 1. Plan vs. Record integrity — the cardinal rule

The whole domain rests on keeping the **plan** (what the AI prescribes) separate
from the **record** (what the user did). See `CONTEXT.md` §"Plan vs. Record".

- 🔴 **Reject** any change that writes performance data onto a plan object, or
  derives a plan value from a bare record without going through the defined
  concepts (Logged Session/Set → Progression, etc.).
- 🔴 **Reject** edits that rewrite or reorder a **performed** Session. Protocol
  edits and the builder may only touch the **un-performed tail** (ADR-0020/0021).
- 🟠 **Reject** collapsing the two feedback concepts. **Generation Feedback**
  ("was the plan good?") and **Performance Feedback** (perceived effort on a
  Session I did) are distinct and must never merge into one "Feedback"
  (CONTEXT §Feedback).

## 2. Read-time projections, never stored ledgers

XP, Operator Level, Streak, Achievements, and Personal Records are **pure
projections** of the logged record, computed at read time (ADR-0018/0019).

- 🔴 **Reject** any stored/awarded balance for these: no `xp` column, no
  `achievement` unlock table, no streak counter, no write hook on log creation.
  A corrected or deleted log must simply recompute the value (and may re-lock an
  Achievement or lower a Level — that non-monotonicity is intended).
- 🟠 **Reject** an Achievement catalog that is AI-generated or training-type
  biased. It is **curated, fixed, and type-neutral** (a yoga user must not face
  an all-locked strength wall).

## 3. Safety — Sensitive Constraints (highest priority)

- 🔴 **Reject** any path that can serve **cached / shared** generated content to a
  user with a **Sensitive Constraint** (injury, rehabilitation, postpartum,
  flagged medical). Such users always get a **fresh** generation (hard cache
  bypass, ADR-0003). Getting this wrong is a safety issue, not a quality one.
- 🟠 **Reject** reducing sensitive constraints to a single opaque boolean at
  storage time — the specific constraint *types* must be retained so generation
  can apply the *right* caution; only the bypass gate is derived.
- 🟡 Watch `Provenance`: `ai_generated` content is unvalidated. Don't present it
  as trusted/curated.

## 4. Generation & cache

- 🔴 **Reject** mutating immutable Generated content. Users **adopt-by-copy**;
  mutation (logging, feedback, regeneration, substitution) touches only the
  user's own copy (ADR-0003).
- 🟠 **Reject** adding continuous profile values (exact age/height/weight) or
  similarity/embedding scoring to the cache key. The key is a deliberately
  **coarse** exact-match tuple (ADR-0003).
- 🟠 **Reject** AI calls that bypass the LLM **port**. Every generation goes
  through `StructuredLLM.complete` (built only by `build_llm_client`) with a
  Pydantic schema and its own `parse_*` boundary (ADR-0006). Tests use the fake
  LLM — a change that only works against a live provider is not testable.
- 🟠 **Regeneration** operates on a single Session (never a whole Protocol), on
  the user's copy, conditioned on kept Prescriptions + the negative feedback
  reason, and is limited to once per Session in v1.

## 5. Self-paced & calendar-free

The plan model has **no calendar and no "today"** (ADR-0001).

- 🔴 **Reject** dated schedules, "today's session", a recovery **%**, a readiness
  **score**, or a **daily** streak. Streak is *weekly*; Readiness is a 3-state
  signal (Ready / Caution / Extra Caution); "Next Session" means next in
  *position*, not next by date.
- 🟡 Analytics/builder must carry **no** fatigue / projected-volume / 1RM-curve
  model — the domain has no honest basis for one.

## 6. Typed values & records

- 🟠 **Reject** treating **`Load`** as a bare kg number. It is a typed value
  (absolute / bodyweight / %1RM / qualitative / range); only some kinds resolve
  to a numeric weight (CONTEXT §Load).
- 🟠 **Estimated 1RM** and **Personal Record** may be derived **only** from
  absolute-Load sets with integer reps in a trustworthy rep range — never from a
  plan, never from bodyweight/%/qualitative loads.
- 🟠 **Completion Outcome**: a Session is *Incomplete* only when a prescribed set
  was left **un-attempted**. Missing reps / training to failure is still
  *Completed*. Only a Completed Logged Session advances the Protocol (ADR-0013).
- 🟡 **Live Session** is ephemeral / client-side until finished; **Session
  Duration** excludes idle gaps and is absent for after-the-fact logs
  (ADR-0012/0014).

## 7. Terminology

- 🟠 `CONTEXT.md` fixes every term and its **_Avoid_** list. **Reject**
  reintroducing a retired term. The hard regressions (Program, daily streak,
  personal best, max weight, readiness/recovery score) are enforced automatically
  by `apps/api/app/quality/terminology_guard.py` — if that test fails, the PR
  reintroduced forbidden terminology.
- 🟡 When a change retires/renames a term, add it to the guard's `BANNED_TERMS`
  registry (one line) so the regression can't come back.

## 8. Architecture & seams

- 🟠 Every endpoint returns the **response envelope** (`{success, data, error}`,
  `app/envelope.py`, ADR-0022) — reject hand-rolled response shapes.
- 🟠 All persistence goes through a **repository** (`app/repositories/`) — reject
  raw SQLModel access from routes/domain.
- 🟡 Domain logic that could be pure belongs in `app/domain/` (no I/O) so it is
  unit-testable; frontend logic belongs in `apps/web/lib/` view-models with a
  co-located `*.test.ts`.

## 9. Baseline quality & security

Inherit the standing checklists — don't re-list them here, apply them:

- Quality: [`.claude/rules/common/code-review.md`](./.claude/rules/common/code-review.md)
  and [`coding-style.md`](./.claude/rules/common/coding-style.md) (immutability;
  functions < 50 lines; files < 800 lines; nesting ≤ 4; explicit error handling;
  no debug prints).
- Security: [`.claude/rules/common/security.md`](./.claude/rules/common/security.md)
  (no hardcoded secrets; validate boundaries; authz on every endpoint). Auth,
  user-data, and generation changes warrant the **security-reviewer** agent.
- Tests: [`.claude/rules/common/testing.md`](./.claude/rules/common/testing.md)
  — new behavior ships with tests; keep coverage at the 80% bar; CI must be green.

---

**Approve** when no 🔴/🟠 remain. **Block** on any 🔴. A rejection that cites an
item here should link the ADR/CONTEXT reference so the fix is unambiguous.
