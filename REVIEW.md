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
from the **record** (what the user did). See `GLOSSARY.md` §"Plan vs. Record".

- 🔴 **Reject** any change that writes performance data onto a plan object, or
  derives a plan value from a bare record without going through the defined
  concepts (Logged Session/Set → Progression, etc.).
- 🔴 **Reject** edits that rewrite or reorder a **performed** Session. Protocol
  edits and the builder may only touch the **un-performed tail** (ADR-0020/0021).
- 🟠 **Reject** collapsing the two feedback concepts. **Generation Feedback**
  ("was the plan good?") and **Performance Feedback** (perceived effort on a
  Session I did) are distinct and must never merge into one "Feedback"
  (GLOSSARY §Feedback).

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
  to a numeric weight (GLOSSARY §Load).
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

- 🟠 `GLOSSARY.md` fixes every term and its **_Avoid_** list. **Reject**
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
- 🟡 Icons come from `@/components/pulse/icons`, never from `lucide-react` — the
  design system owns the icon set (ADR-0092, enforced by `icon-import-policy.ts`).
- 🟡 A `useState` seeded from a prop must be a prop that cannot change. On a route
  a server action revalidates, the form follows the prop and overlays only the
  fields the user touched, or it shows stale text and edits from it (see CLAUDE.md,
  `lib/admin-editor-props-refresh.test.ts`).
- 🟡 Form controls come from `components/ui/input.tsx` / `select.tsx` /
  `textarea.tsx`, which declare `autoComplete` and derive the numeric keypad from
  `type`/`step` (ADR-0093, enforced by `form-input-policy.ts`). A hand-rolled native
  control states both itself; a numeric pad is never forced on a field whose value
  carries a colon, a hyphen or letters.
- 🟡 Anything that opens a section is a heading (ADR-0094): a `SectionHeader` (the ▸
  rule — reject a hand-rolled one) or a group eyebrow like Train's `TRAIN // …`. Reject
  a level skip, and reject card titles promoted above the label of the group that holds
  them (`SessionCard` takes `level={3}` inside a headed group).
- 🟡 An image reserves its box before its bytes arrive (ADR-0095, enforced by
  `image-policy.ts`): render it through `components/pulse/illustration.tsx`, and reject a
  raw `<img>` with no `width`/`height` ratio hint and no `loading`. A `max-h-*` is not a
  height.
- 🟠 An **instant** is written in the reader's clock (ADR-0096, enforced by
  `server-locale-policy.ts` and `api-instant-policy.ts`): reject `toLocaleString()` on a `Date` in a Server Component,
  and reject parsing an API timestamp with a bare `new Date(...)` — the offsetless strings
  the API emits parse as *local* time, so the moment is wrong before it is formatted. Use
  `lib/instant.ts` + `components/pulse/local-instant.tsx`; calendar dates stay with
  `lib/date-format.ts`.
- 🟡 A filter over an unpaged list stays off the keystroke (ADR-0097): hoist what the
  filters don't affect, defer the filter pass with `useDeferredValue` (not a debounce —
  there is no request to collapse), give rows `.list-row-defer`, and read the summary copy
  off the deferred value so the header never describes a list that is not on screen.
- 🟠 A destructive or one-way-door action confirms through
  `components/pulse/confirm-dialog.tsx` (ADR-0098, enforced by `native-dialog-policy.ts`) —
  reject `window.confirm`, whose answer the browser takes over once the reader suppresses
  further dialogs. Reject a new dialog surface that no audit journey mounts: it is unmeasured
  at 320px, 200% text and 1440px.
- 🟡 A tap target is reached by the `touch-action: manipulation` rule in `globals.css`
  (ADR-0099, enforced by `tap-target-policy.ts`): a native control or a `[role="button"]`.
  Reject a widget role on an element the rule does not name, and reject a
  `-webkit-tap-highlight-color: transparent` that replaces the flash with nothing.
- 🟡 A client-side filter is in the URL (ADR-0100): `parse*Filters`/`*FiltersToQuery` in the
  view-model, seeded once from `useSearchParams`, mirrored with `replaceFilterQuery`, the
  component under `Suspense`. Reject a router push (it re-fetches per keystroke), and reject a
  parse that admits a value outside the facet's closed vocabulary.
- 🟡 Authored text is typeset (ADR-0101, enforced by `display-heading-policy.ts` and
  `copy-typography-policy.ts`): a `font-display` heading states `text-balance`, and an apostrophe
  in **any** authored string — rendered copy, a `lib/` view-model, a guard's own failure message —
  is `’`. A placeholder reading as an instruction ends in `…`; one showing a value or a single
  token (`mm:ss`, `70`, `e.g. 2`) does not; a placeholder restating its own `hint` is deleted.
- 🟡 The browser chrome follows the rendered Theme (ADR-0102): a new or re-tuned Skin updates
  `SKIN_BASE_COLORS` beside `--color-base`, and `theme-color.test.ts` holds the two to one number.
  Reject a hardcoded `themeColor`, and reject reading the Skin anywhere but the cached resolvers.
- 🟡 A field arrives quiet (ADR-0103, enforced by `autofocus-policy.ts` and
  `spellcheck-policy.ts`): reject `autoFocus`, including one gated on a viewport check, and reject
  a value field (tempo, duration, Load, authored name) that does not declare `spellCheck`. A set
  note and a movement cue are prose — reject turning the checker off on those.
- 🟡 A focus indicator is drawn, not tinted (ADR-0104): an `outline-none` is only defensible
  beside a ring of its own. On an SVG surface, reject a fill/colour change as the indicator and
  reject a stroke on a path whose stroke is an inline style — the stylesheet cannot win there.
- 🟠 Shared row state travels by context, not through intermediaries (ADR-0105): reject a callback
  a component only forwards, and reject the same prop block re-declared at two levels. The contract
  is `{ state, actions, meta }` with **one** `dispatch` over a vocabulary derived from the reducer's
  event union — reject a hand-re-declared copy of it, and reject a row that names a `sessionId`
  (addressing belongs to the screen). Props stay where each is a leaf's own closure over one
  position, or the component is shared presentation. A context is not sweepable, so reject one
  whose deepest consumer no test mounts.
- 🟡 Two renderings are two names (ADR-0108): reject a boolean that selects between renderings
  sharing no markup — a caption over several controls is `FieldGroup` (a `<fieldset>`/`<legend>`,
  each control naming itself), a caption over one is `FieldLabel`. Reject re-adding a flag the
  field-control guard would then have to evaluate from source. `FieldGroup` publishes no wiring, so
  reject reading one as a boundary: controls nested in one inside a `Field` claim that field's id.
- 🟡 An extra card is composed, not flagged (ADR-0109): reject a `show*` boolean gating a whole
  child one caller offers and another does not — that child is written at the call site that offers
  it, in a `children` slot. Two flags are four states and three are eight, and the corners nobody
  renders exist only in the type. A flag toggling a detail *inside* a component's own rendering
  (`showBodyWeight`, `showValues`, `showOverflowCount`) is a different thing and stays. There is no
  sweep: reject a flag whose absence no test reads from the props interface, since one added and not
  yet passed renders as nothing. And reject a new surface that no `audit/` journey renders — that
  is the fourth finding in a row whose real cost was the missing journey, not the refactor.
- 🟡 A context is read with `use()` (ADR-0110, enforced by `context-api-policy.ts`): reject
  `useContext`, `<Ctx.Provider>` and `<Ctx.Consumer>` — React 19 reads a context with `use(Ctx)`
  and renders the context itself as the provider, and the 18-era pair draws no warning, so a
  codebase reading a context two ways reports nothing. `createContext` is unchanged. The guard
  keys on the member's **name** with no receiver check, since a context object has no canonical
  one: reject naming a compound family's member `Provider` or `Consumer` (ADR-0106's two
  providers are top-level exports for this reason) rather than adding the exemption registry it
  deliberately does not have. It cannot see whether a context is provided above its consumers —
  reject one whose provider no test mounts.

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
item here should link the ADR/GLOSSARY reference so the fix is unambiguous.
