# 0091 — The live tick lives in the leaf that displays it

The Live Session screen shows two running figures: the elapsed timer and, between
sets, the rest countdown. Both are derived wall-clock (ADR-0014) — a stored
timestamp compared against a live "now" — so something has to advance that "now"
once a second.

That "now" was `useState` in `LiveSessionScreen`, ticked by one `setInterval`. So
once a second the whole 830-line shell re-rendered, and with it everything derived
in its body: `progressPercent`, `currentUnit`, `currentSuperset`, `onDeckExercise`,
`nextExercise`, `finishAdvisory`, the completed-set count, and `groupUnits` — which
allocates a `Map`, an order array, a fresh `LiveUnit[]`, a fresh `sets` array and a
computed summary string per unit, and returned **entirely new object identities
every second for data that had not changed**.

That fresh array went straight into `<LiveSessionSets>`, alongside an inline
`onSkipSet={() => dispatch(...)}` arrow that was a new function identity each tick.
Neither was memoized, so every set card — each with its own reps, RPE, load-kind and
load inputs and its own local edit state — re-rendered sixty times a minute.

This is the one screen in the app where that is not merely wasteful. It runs on a
phone, mid-workout, with a Screen Wake Lock deliberately held (ADR-0055) so the
display never sleeps, while the user taps reps and load between sets. Sustained
wasted work there costs real battery, and re-rendering the inputs is the worst place
in the app to spend a frame.

So the rule: **a per-second tick belongs in the leaf component that renders the
figure, never in a screen that renders anything else.**

## Two clocks that render a string

`<ElapsedClock startedAt>` and `<RestCountdown endAt onElapsed>` each own their own
tick via `useSecondTick`, and each returns a bare fragment — no element, no classes.
The caller keeps the styling and the accessible name (`aria-label="Elapsed time"`,
`aria-label="Rest remaining"`), so the sticky bar's markup is unchanged. They sit in
`components/pulse/` beside the screen's other parts, but they are not design-system
primitives and should not grow into them: they render a string and hold a timer, and a
component that *styles* a clock would be a different thing, with the accessible name
buried inside it.

`LiveSessionScreen` no longer holds `now` at all. It re-renders when the performance
changes — a set completed, a set reopened, a rest started or skipped, a unit
expanded, a finish going in flight — and at no other time. The two clocks re-render
once a second each and render a string.

Nothing about ADR-0014 changes: the tick is still wall-clock, still `Date.now()`
compared to a stored timestamp, never a decrementing counter, so a backgrounded or
locked tab still reads correctly on return. It moved; it was not replaced.

## The countdown owns "rest is over"

The screen used to re-test that condition in an effect keyed on the ticking `now`:

```ts
useEffect(() => {
  if (restEndAt !== null && restRemainingSeconds(restEndAt, now) === 0) {
    setRestEndAt(null);
  }
}, [restEndAt, now]);
```

Because `now` was a dependency, that effect tore down and re-ran sixty times a minute
to evaluate a condition that is true at most once per rest period — and it was a state
update in an effect responding to a value derivable during render.

`RestCountdown` already knows the answer: `remaining === 0` is a boolean it computes
anyway. The effect now keys on that boolean, so it fires exactly once, on the
transition.

Keying on the transition *alone* is the whole point, and it is what the ref is for.
`onElapsed` in the dependency list would re-arm the effect whenever the handler's
identity changed — for a caller that hands a fresh arrow each render, every render, so
a settled countdown would re-fire once per render of its owner. Reading the handler
through a ref is what makes the `[isOver]` dependency list honest rather than a
suppressed lint rule, and it is why the caller is free to write `onElapsed` however it
likes. The test holds that: it re-renders the owner both before and after zero with a
fresh arrow each time, and fails if the ref is removed in favour of a dependency.

What this does not do is abolish the effect. The ref is refreshed in a
dependency-array-free effect, so one assignment still runs per render of the
countdown — once a second, in the one component whose job is to tick, doing no work
and tearing nothing down. That is the residue of R3's shape, and it is not worth
pretending otherwise: what was removed is a 60-times-a-minute teardown-and-re-run in
the *screen*, re-deriving a condition from a value it had no other reason to hold.

## A memo boundary is worth nothing without stable props

`LiveSessionSets` is now `React.memo`, and this is the half that is easy to get
wrong: the boundary only holds if the props survive a shallow compare. A `React.memo`
added on its own would have been defeated on every render by the fresh `units` array
and the inline arrow, and would have read as working.

So the two land together. `units` is `useMemo`'d on `[state]`; `onCompleteSet`,
`onSkipSet`, `onReopenSet` and `onExpandUnit` are `useCallback`'d; `expandedUnits` is
already state and so already stable. The result is that a re-render the *record* did
not cause — skipping a rest, a finish going in flight — skips the set table's whole
subtree, and a re-render the record *did* cause reaches it, which is exactly right.

`onCompleteSet` keeps `state` in its dependency list and so does change identity when
the performance changes. That is not a leak: when the performance changes, `units`
changes too and the table must re-render regardless.

## What is guarded, and what is not

`lib/live-session-tick.test.ts` renders the real `LiveSessionScreen` offline (JSDOM,
mocked timers, the existing Node runner — no browser, no build) with the set table
replaced by a **deliberately un-memoized** probe, so a re-rendering parent cannot
hide behind a memo boundary. It asserts that five seconds of wall-clock advance the
elapsed face and produce **zero** renders of the set table, and that skipping a rest
re-renders the screen while handing the table props with identical identities. Two
smaller tests hold the clocks themselves: the elapsed face advances without its owner
re-rendering, and the countdown reports reaching zero exactly once and does not
re-fire each second afterwards.

**What that proves, and what it does not.** It proves the tick does not reach the set
table and that the props a memo boundary depends on are stable. It is not a
measurement: no frame timing, no battery figure, and no profile of what a render of
that subtree actually costs. The mechanism is removed and the removal is held by a
test; the user-facing size of the win is asserted nowhere and this record does not
let the green test imply one.

It is also a test of *this* screen, not a sweep. Unlike `motion-policy.ts` or
`recharts-import-policy.ts` there is no executable rule stopping a second screen from
putting an interval in its shell — a sweep for "`setInterval` in a component that is
not a clock leaf" would be a heuristic about component size, not a fact about the
AST, and would fail closed on the wrong things. The rule is written here and in
`lib/use-second-tick.ts`, where the next person to want a tick will read it.

## Consequences

- Two more component files and one more hook, for what was four lines of `setInterval`
  in the screen. The screen is smaller and its render is now a pure function of the
  performance, which is the trade.
- The clocks render fragments, so they are invisible to the contrast, reflow and
  accent-tint sweeps — correctly, since they carry no colour, no box and no track. The
  span that styles them is still swept, and is unchanged.
- **The other large client components are deliberately untouched, and that is an open
  item rather than a closed one.** `prescription-rows.tsx`,
  `HandAuthoredSessionForm.tsx`, `ProtocolBuilder.tsx` and `CorrectLogForm.tsx` are
  bigger than the set table but have no timer driving them — they re-render on user
  input, which is the render they exist to serve. Memoizing them now would be
  speculative, and `rerender-simple-expression-in-memo` warns against exactly that.
  They are a profiling question, and it is still on the list.
