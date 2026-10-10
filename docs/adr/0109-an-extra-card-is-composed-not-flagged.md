# 0109 — An extra card is composed, not flagged

`components/pulse/generate-training-launchpad.tsx` gated its two no-AI entry points with a
boolean each:

```tsx
export function GenerateTrainingLaunchpad({
  eyebrow, from, showBuild = false, showLogPastWorkout = false,
}: GenerateTrainingLaunchpadProps) { … }
```

Two flags describe four states. Two are rendered: the Home empty state passes neither (Home's
quick-action row already carries Build and Log, ADR-0071), the TRAIN launchpad passes both. The
other two corners — Build without Log, Log without Build — exist only in the type, and a third
card would make it eight. That is the `patterns-explicit-variants` case the composition audit
filed as finding #5, and the same rule ADR-0108 answered for `FieldLabel({ group })`: a flag that
selects between renderings is replaced by a name a call site writes.

The cards are now `children`, composed after the two generation links in the one stack that
spaces them:

```tsx
<GenerateTrainingLaunchpad eyebrow="TRAIN // START SOMETHING NEW" from="/train">
  <BuildWorkoutLink />
  <LogPastWorkoutLink />
</GenerateTrainingLaunchpad>
```

`BuildWorkoutLink` and `LogPastWorkoutLink` are exported from the launchpad's own module and take
no props: each is one fixed destination with one authored label, so there is nothing for a caller
to decide beyond whether to offer it. They are not a `SetEntry`-style namespace (ADR-0106) — there
is no shared contract between them and the launchpad, only a shared place in a stack, which is
what `children` already is.

A note on the word: "card" is the finding's, and it is kept here so the two documents read as one,
but what each of these actually renders is a full-width secondary **link** inside the launchpad's
one real `Card` — which is why the exports are `*Link`.

**What is shared is that link's styling, and it is named once.** The two generation links and both
composed ones ask for `buttonVariants({ variant: "secondary", className: "w-full" })`; that is now
`LAUNCH_LINK`, a module constant, for the reason ADR-0106 made `SET_ENTRY_CARD` one: a link that
disagreed with its neighbours would read as a different kind of thing, and four call sites of the
same variant arguments is where that drift starts. The primary protocol CTA keeps its own inline
call, because it is deliberately the one link in the stack that differs.

## What this does not claim

- **The two rendered compositions are unchanged.** Same cards, same order, same classes, same
  hrefs — the TRAIN launchpad renders four links and Home's empty state two, exactly as the flags
  produced. `/dashboard` did not change at all: passing no children is what passing neither flag
  was.
- **The names carry a standing GLOSSARY divergence, and do not create it.** GLOSSARY lists
  *Workout* under _Avoid_ for both 'Session' and 'Hand-Authored Session', and binds the avoid-lists
  in code as well as on screen — so `BuildWorkoutLink` and `LogPastWorkoutLink` are named after
  copy that is itself the divergence. The copy is what the launchpad has always rendered ("Build a
  workout", "Log a past workout"), it is user-visible text rather than a refactor's business, and
  the terminology guard cannot see it for exactly the reason ADR-0106 recorded: a JSX text node is
  not the quoted label its regex matches. Naming the component something GLOSSARY prefers while the
  button it renders says "workout" would hide that, so the names mirror the labels and the
  divergence is stated once, here, where whoever retires the copy will find it.
- **The three `show*` booleans left in the app are not this finding.** `showValues`
  (`TopSetTrendChart`), `showBodyWeight` (`LoggedSetTable`) and `showOverflowCount`
  (`EquipmentSymbol`) each toggle one detail *inside* a component's own rendering — a values
  table, a stat line, a `+N` badge — rather than selecting which independent children sit in a
  slot. `children` is not an answer for any of them, and the audit's verdict on
  `architecture-avoid-boolean-props` was already a pass.

## What is held, and by what

`lib/generate-training-launchpad.test.ts` renders both compositions and holds what the flags used
to decide: the two generation links are the launchpad's own and always present (with the caller's
route threaded onto the standalone-workout link as `?from=`), a composed card lands *after* them
as a sibling in the same stack rather than inside a wrapper that would show as a double gap, and
each card names one destination. It also holds the "same classes" claim above literally: the three
secondary links must carry one identical class string, that string must name `w-full` and the
secondary surface, the primary CTA must differ, and each link must still render its icon —
otherwise an edit to `LAUNCH_LINK` could drift a composed link away from its neighbours with every
other assertion still green. Its last test reads the props interface through the TypeScript AST and
requires no boolean member at all: a flag that is added but not yet passed is the regression, and
it renders as nothing, so a rendering test cannot see it.

## The surface had never been rendered by an audit journey

This is the part worth recording, and it is the fourth time the same lesson has been paid for
(ADR-0098's `confirm`, ADR-0106's `adhoc`, ADR-0108's performed-set fieldset). Neither launchpad
composition was in `audit/reflow.mjs` or `audit/wide.mjs`. The `home` journey mounts Home's
**protocol-present** path — `SessionHero` plus `TrainingRouteCard` — so the branch that renders a
launchpad at all never rendered, and `/train` had no journey of its own. A stack of full-width
buttons whose labels are authored sentences ("Log a past workout") is the shape a doubled root
font is most likely to push past a 320px viewport, and the only claim available for it was that
the markup had not changed.

`launchpad` is now a journey in both harnesses, holding both compositions in one capture: the
TRAIN stack of four above the Home stack of two.

- `audit/reflow.mjs`: clean with the journey added — 0 of 960 cases overflow at 320px/100% text, 0
  of 960 at 200%, 0 of 9,840 controls cramped. Read from the DOM rather than argued: at 320px the
  six links are 230×44 with `document.scrollWidth` 320, and at 200% text they are 142×88 with
  `scrollWidth` still 320. The labels wrap rather than widen the document, which they can because
  the links carry no `whitespace-nowrap`.
- `audit/wide.mjs`: 0 of 60 cases overflow a 1440px viewport, 0 exceed the wide shell cap, and the
  content column holds 416px (26rem) inside the 1152px frame — the launchpad is an unconverted
  surface, so staying narrow in the wide frame is the gate it has to pass (ADR-0088).

### What the journey surfaced, and why it is not fixed here

At 200% text three of the four labels need **103–104px of height in an 88px box**: `h-11` is a
*fixed* height, so a wrapped label overflows it and the link's border crosses its own text. That
is app-wide and pre-existing — the same probe finds it on `creation`, a journey gated since the
matrix began, at "Group with next" and "Save reusable session" — because `buttonVariants`' `size`
variants pin a height rather than a floor, and the reflow harness measures horizontal overflow and
cramped *inputs*, so vertical spill has never been gated. It is identical before and after this
change: these are the same links the flags rendered.

Replacing `h-11` with a minimum height is a change to every button on every surface, which a
refactor of one component's prop shape is the wrong place to make — the same judgement ADR-0106
made about the amount-kind picker's option order and ADR-0108 about the two caption treatments. It
is recorded here so the next change to `components/ui/button.tsx` has the measurement, and so the
clean reflow numbers above are not read as saying more than they do.

## Consequences

The component is 89 lines where it was 93, with a 124-line test beside it where it had none, and the question a reader of a call site had to answer
— "which of the four combinations is this?" — is gone: the cards offered are the cards written.
`patterns-explicit-variants` now passes with no boolean-mode component left, which closes the last
of the composition audit's structural findings; #6 (React 19's `use()` at the app's one legacy
context call site) is a two-line change and all three contexts added since were written against
the current API anyway.
