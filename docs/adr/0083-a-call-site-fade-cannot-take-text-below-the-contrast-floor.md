# 0083 — A call-site fade cannot take text below the Contrast Floor

ADR-0081 guarantees the *tokens*: every text-bearing Skin token, and every
declared text-on-fill pairing, clears **4.6:1** in both Modes. It does not
guarantee what a component renders. A fade applied where a token is used —
`text-cyan/80`, or an `opacity-70` on the same element — composites that token
back toward its surface and can undo the guarantee without touching a token.

The Contrast Floor therefore binds on **rendered text**, not only on palette
values. A conforming token faded at its call site is a Floor violation, and
[`faded-text-policy.ts`](../../apps/web/lib/faded-text-policy.ts) enforces it in
the existing `web` CI job. It reproduced all four violations before the fix and
reports none after.

## Why this is a source rule

The defect is computable without a browser. Compositing `text-cyan` at 80% over
each Skin's `--color-surface` reproduces #562's rendered measurement exactly:
minimum 3.88:1, and 7 of 12 variants failing — which is the 28 of 48 captures
that report recorded, since it sampled two engines and two orientations. A
guard that needs the 4,224-capture browser matrix could not gate a pull request;
one that reads Tailwind class strings can, and Tailwind declares the fade at the
call site, so the rule is a source property. This follows ADR-0082's shape: a
fail-closed sweep over component sources, with a reason-carrying registry.

## What it measures

The faded foreground is composited against each of the three surfaces, and the
**worst** binds — source cannot say which surface an element sits on, so all
three are checked. This is stricter than any one layout, which is the right
direction for a floor.

Both spellings are one rule: a colour alpha (`text-cyan/80`), a same-class-string
element opacity (`text-text-muted opacity-40`), and their product when both
appear. Which one an author reaches for is a habit, not a decision, and a guard
that covered only one would make its own coverage depend on that habit.

Unknown colour tokens and unreadable alphas fail closed, as in ADR-0081.

## The `disabled:` exemption is a rule, not an allowlist

Tailwind's `disabled:` compiles to `:disabled`, which matches only form
controls. A fade behind it therefore really does sit on an inactive user
interface component — the case WCAG 1.4.3 exempts — so `disabled:`,
`group-disabled:` and `peer-disabled:` are exempt by rule, for every such fade
rather than for the ones someone remembered to register. ADR-0082 exempts
`transition-colors` the same way and for the same reason.

That same claim is what **failed** for the two disabled pagers this work found.
Both render as a `<span>`, which is not a user interface component, so the
exemption did not apply; one of them carried no `aria-disabled` at all. They
measured 1.68:1. They were fixed, not exempted, and the exemption registry
ships **empty**.

## Scope, and what is deliberately outside it

**Element backgrounds are out.** The faded foreground is measured against the
bare Skin surfaces, ignoring any tint the element paints behind itself. The
codebase carries undeclared accent tints — `bg-cyan/15`, `bg-violet/15`,
`bg-magenta/20` and others — which ADR-0081's composite registry does not
declare. Those are a *pairing* question (which text on which tint), not an alpha
question, and belong to that registry rather than to this sweep; #567 carries
them, along with `danger`, a colour referenced by `text-danger` and
`border-danger/60` at `ProtocolBuilder.tsx:665` but never declared. Guessing at
element backgrounds here would make this module wrong in a way nobody could see.

**Ancestor fades are out**, as ADR-0081 said they would be. An `opacity-*` on a
container whose text colour lives on a descendant is not decidable from one
class string. Two such sites exist and are named here rather than implied to be
covered:

- `apps/web/components/pulse/achievement-wall.tsx:22` — locked cards at `opacity-70`
- `apps/web/components/ProtocolBuilder.tsx:641` — locked rows at `opacity-70`

Both dim content a user is meant to read. Neither is a disabled control. They
remain the browser harness's responsibility, and this record exists partly so
that the next person to measure them finds the reason written down.

## Rejected alternatives

- **Extend the rendered browser matrix instead.** The audit's own proposal. But
  the 4,224-capture runner is not CI, and #562's remediation already recorded
  that WebKit cannot be installed in the remediating container — so the guard
  would arrive half-evidenced and could not gate a change. A guard that cannot
  run in CI is documentation.
- **Register the fade as a declared composite pairing in ADR-0081.** That
  registry pairs a text token with a *fill* token. A foreground alpha is not a
  fill, and modelling it as one would blur the distinction the registry exists
  to make.
- **A new per-Skin dim accent token.** Preserves the designed de-emphasis at full
  opacity, but adds twelve-plus hand-tuned values and a token family for one
  call site. ADR-0081 rejected a parallel Accent family for the same reason.
- **Keep the fade and lower the floor for secondary text.** This would make one
  pairing the only text in the codebase held below 4.6, and every future fade
  would cite it. ADR-0081 enforces 4.6 precisely to catch what sits between 4.5
  and 4.6.
- **Line-numbered exemption keys.** More precise than `(file, utility)`, but a
  registry that churns on every edit above it trains people to update it
  mechanically, which is the opposite of what a reason field is for.
