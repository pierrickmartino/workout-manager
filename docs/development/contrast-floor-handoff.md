# Widened Contrast Floor — issue #561

Spec: [#561](https://github.com/pierrickmartino/workout-manager/issues/561).
Dependency #559 is closed. Branch: `main`.
Base: `7dc5e5e4f69ae9f78a36e3d6a740b8298a6d22b1`.
Session model: GPT-6 Codex; implementation with separate Standards and Spec
review agents via the implement/code-review skills.

## Result and scope

The guard consumes the complete matrix at 4.6:1: nine ordinary text tokens on
three surfaces plus all six declared composites, in twelve explicit variants
and six System Light copies. Every colour token must be classified. on-accent
is checked against the primary-button fill, its intended use, rather than
neutral surfaces. The report uses the same threshold and finds zero failures.

37 Accent values are retuned with hue and saturation held fixed before 8-bit
quantization; their dim fills keep alpha 0x1f. Five additional Light Skins now
explicitly override inherited amber/green. Vercel Dark's label becomes black.
The [derivation evidence](accent-retuning.json) records originals, retuned values,
actual surfaces, target lightness and minimum ratio. ADR-0081 and CONTEXT.md
record the widened invariant; CLAUDE.md documents the registry obligation.

The original issue count of 29 describes an incomplete audit; the existing #559
matrix found 50 failures. All 50 are resolved, plus pairings between 4.5 and 4.6.
Dark variants lighten rather than darken because they bind against dark
surfaces. Vercel Dark needs a dark label on its lighter cyan fill. ADR-0081
records these necessary deviations explicitly, including the brand-blue cost.
Ancestor opacity remains the browser harness's responsibility; token compliance
alone cannot guarantee arbitrary opacity applied by a component ancestor.

## Checks

Use Node 22.23.3 (matching CI); the shell defaults to Node 20.

From `apps/web`:

- `node --test lib/accent-retuning.test.ts lib/skin-contrast-matrix.test.ts lib/skin-contrast.test.ts lib/wcag-contrast.test.ts` — 23 passed.
- `npx tsc --noEmit` — passed.
- `npm test` — 1,293 passed, zero failed or skipped.
- `npm run --silent contrast:report` — zero failing pairings.

`git diff --check` passed. The widened guard was observed red against the
original palette before retuning; the unknown-token regression test was also
observed red before classification was implemented. No red state is committed.

## Review

Standards: zero findings. Spec: one gap found and fixed, then independently rechecked with zero remaining findings — a colour override in a
CSS block without a base surface could bypass classification. Such blocks now
fail closed, with a regression test observed red before the fix. Focused tests
and typecheck were rerun after this fix. The full suite passed after this fix. Classification also covers whitespace
before the declaration colon, with a focused regression observed red before
accepting that valid CSS syntax.
