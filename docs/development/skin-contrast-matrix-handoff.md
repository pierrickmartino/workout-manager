# Skin contrast matrix — issue #559

Spec: [#559](https://github.com/pierrickmartino/workout-manager/issues/559),
with pairing conventions and agreed test seams in parent
[#558](https://github.com/pierrickmartino/workout-manager/issues/558).
Base: `9704303face33fde3a2282eaeb08ecaa0436a6c1`. Branch: `main`.
Implementation and review use the current GPT-6 Codex session and independent
review agents.

## Generate evidence

From `apps/web`, run `npm run --silent contrast:report > /tmp/skin-contrast.md`
using Node 22. The command writes the complete Markdown matrix to stdout, offline,
without a browser, database, or network. Known contrast failures do not change
its exit status: this ticket adds reporting, not widened CI enforcement.

`lib/skin-contrast-matrix.ts` owns parsing, inherited token resolution, flat and
registry-declared composite pairings, alpha blending, binding-surface selection,
and report formatting. `scripts/skin-contrast-report.ts` is the filesystem/stdout
adapter. `lib/skin-contrast.test.ts` consumes the extracted parser but still
asserts only the three Text Ramp rungs. The WCAG utility and CSS are unchanged.

The parser covers the twelve explicit Skin × Mode variants and six System Light
media-query copies. System Dark uses the explicit dark blocks (or the PULSE
`@theme` defaults). All eighteen authored blocks appear in the report so a
System Light copy that drifts remains observable. Summary counts refer to the
twelve explicit variants, counting each token/fill pairing once at its worst
surface, rather than counting failing surface rows or duplicate System copies.

The supported token source is the app's nested CSS blocks with literal hex
colours. Tint tokens carry eight-digit hex alpha; solid colours support three-
or six-digit hex. Blending uses rounded 8-bit sRGB channels before the unchanged
WCAG utility linearizes them. PASS/FAIL uses unrounded ratios against 4.5:1.

Flat text covers the three Text Ramp rungs and six ordinary text accents.
`on-accent` is the label colour for an accent fill, rather than ordinary text
on neutral surfaces; it is declared against the primary `cyan` button fill in
`COMPOSITE_PAIRINGS`. The same registry declares five accents on their own dim
tints. Blue has no dim token. Extend this registry when a new text/fill convention
is introduced. Ancestor opacity remains outside this token-only computation.

## Evidence discrepancy

The complete matrix finds **50 failing pairings: 18 flat and 32 composite**.
The **29 failures specified in #559 (8 flat, 21 composite)** are reproduced as
an explicitly labelled earlier-audit subtotal. That audit omitted:

- Amber and green inherited from PULSE Dark by Aurora, Vercel, Alpine, Clay and
  Track Light: ten flat and ten tint pairings fail.
- The white `on-accent` label on PULSE Light's cyan button fill: one composite
  pairing fails at 3.75:1.

The report includes these additional failures instead of silently dropping
inherited tokens or the declared button pairing. No token values are retuned.
Magenta on its own tint reproduces the prior browser measurements exactly:
PULSE Light **3.51**, Vercel Light **3.74**, Track Light **3.85**.

## Validation and review

Focused command (from `apps/web`):
`node --test --experimental-test-coverage lib/skin-contrast-matrix.test.ts lib/skin-contrast.test.ts lib/wcag-contrast.test.ts`.
All 20 tests pass; the new pure module has 100% line/function and 98.67% branch
coverage. Tests cover inheritance, System copies, flat and composite enumeration,
alpha endpoints and rejection, binding surfaces, missing/malformed colours,
browser-audit values, and written report output.

Typecheck: `npx tsc --noEmit`. Full frontend suite: `npm test`.
Both checks pass: 1,290 frontend tests passed with none skipped. After the
review fix, the 13 module/guard tests and typecheck were rerun successfully.
Node 22.23.3 was used, matching CI's Node 22 requirement; the shell's default
Node 20 cannot run the repository's native TypeScript tests.

Standards review found one advisory violation of the immutable-array convention
in the parser's local accumulator. It was fixed by assigning a new array rather
than calling `push`. Security review found no vulnerabilities in the fixed-path
filesystem adapter or pure module. Spec review found no actionable issues and
explicitly recorded the 50-versus-29 acceptance-count discrepancy above. There
are no remaining review blockers. The follow-up enforcement ticket must account
for all 50 failures; the inherited-token failures must not be hidden to obtain
the older audit count.
