# 0110 — A context is read with `use()`

`components/NavigationGuardProvider.tsx` was written against React 18's context API:

```tsx
const context = useContext(NavigationGuardContext);
// …
<NavigationGuardContext.Provider value={{ setDirty }}>{children}</NavigationGuardContext.Provider>
```

React 19 reads a context with `use()` and renders the context object itself as the provider, so
that is three lines:

```tsx
const context = use(NavigationGuardContext);
// …
<NavigationGuardContext value={{ setDirty }}>{children}</NavigationGuardContext>
```

That is the whole of the composition audit's finding #6, which filed it LOW and called it a
two-line change. It is, and on its own it would be a cosmetic edit — the 18-era pair still works
and React 19 does not warn on it.

## What the cost actually was

Not the old API. The **disagreement**: by the time this landed the app had **four** contexts, and
the three added since the audit were written against `use()` — `PrescriptionDraftContext`
(ADR-0105), `SetEntryContext` (ADR-0106) and `FieldControlContext` (ADR-0107), the first two
recording that they were written that way deliberately so #6 would not become a prerequisite. So
the one context a reader was most likely to open and copy from, being the oldest and the only
app-wide one, was the one written the old way, and nothing reported that the codebase read a
context two different ways.

`createContext` is untouched: it is still how a context is made. Only its reader and its provider
element moved.

## What this does not claim

- **No behaviour changed, and none was meant to.** `use(Ctx)` subscribes exactly as
  `useContext(Ctx)` did, and `<Ctx value>` renders exactly what `<Ctx.Provider value>` rendered.
  The provider's own output is `children` plus the dialog — a context element renders no markup of
  its own — so unlike the five findings before it this one adds no rendered surface, and no audit
  journey is implicated. `audit/`'s `confirm` journey (ADR-0098) already covers the dialog this
  provider mounts.
- **Nothing here relies on what `use()` additionally permits.** `use()` may be called
  conditionally and inside a loop, which `useContext` may not. `useNavigationGuard` reads the
  context unconditionally and still throws when there is no provider above it, because a form
  that silently fails to register its dirty state is the failure this guard exists to prevent.
- **The two providers' `value` identity is unchanged.** `{{ setDirty }}` is a fresh object per
  render either way; `setDirty` is the stable `useCallback` that keeps `useNavigationGuard`'s
  effect from re-firing, and that is what the consumers depend on (ADR-0091's point, not this
  one's).

## What is held, and by what

Two things, at two different altitudes.

**The behaviour** was already pinned, which is why no test was added for it:
`lib/form-accessibility.test.ts`'s "dirty forms guard client departures and browser exits, while
cancel keeps editing" mounts the real provider around a consumer component that calls
`useNavigationGuard`, then exercises the whole guard through the DOM — the intercepted anchor
click, the dialog, cancel restoring focus to the link, discard pushing the destination, and
`beforeunload` standing down once the form is clean. If `use()` had read a different context, or
the context-as-provider element had provided nothing, that test fails at its first assertion.

**The convention** is `lib/context-api-policy.ts`, swept by its own test over the whole web root
(`native-dialog-policy.ts`'s scope, not the chart guards' — a context's consumer hook can live in
`lib/`). Its subject is three **names** — `useContext`, `Provider`, `Consumer` — reached by any of
the four routes a module has to one:

- an **import specifier** — `import { useContext } from "react"`, reported at the specifier rather
  than at the call, because `useContext as read` reads as any other function at its call site. In
  practice only `useContext` arrives this way; a `Provider` is reached through a context object;
- a **property access** — the namespace path (`React.useContext`), and both tags of
  `<Ctx.Provider>`, since TypeScript parses a dotted JSX tag name as a property access and both
  lines do have to change;
- a **literal element access** — `Ctx["Provider"]`;
- a **binding element** — `const { Provider } = Ctx`, with or without a rename.

The last two exist because the first draft of this guard had only the first two, and a review found
both holes: a `Provider` lifted out of its context object by destructuring, or read by a literal
key, was invisible to a sweep that keyed on property access alone. A **computed** key (`Ctx[name]`)
is still not read, and is not pretended to be — that is a context member picked at runtime, which
nothing here writes and no static sweep resolves. A test states each of these, including the one
that is deliberately not caught.

`Consumer` is scope the finding did not ask for and is taken anyway: it is the third member of the
same trio, React's reference marks it legacy, and it is a render prop — one of the two rules the
composition audit found this codebase passing with **zero** occurrences and called load-bearing,
with nothing else in the repo sweeping for it. There is none to migrate, so the sweep is not a fix;
it is what keeps that count at zero when the next context arrives.

It is read from the AST, so this ADR's own prose and the module's comment may name the legacy API
without tripping it.

**It keys on the member's name, with no check on what the member is read from** — unlike
`native-dialog-policy.ts`, which gates `confirm` on a known global. A context object has no
canonical name, so there is nothing to gate on, and the price of that breadth is that an unrelated
`x.Provider` would report. That price came within one naming decision of being paid: the audit's
suggested shape for `SetEntry` (#2) put its two providers *in* the namespace as `Provider` and
`FormProvider`, and ADR-0106 left them top-level exports for its own reasons — had it taken the
suggestion, every `<SetEntry.Provider>` call site would report here. The guard carries **no
exemption registry** all the same, because nothing in the app has such a member today and a
mechanism standing empty for a caller that does not exist is worse than the one-line addition a
genuine third-party `.Provider` would need.

Run against the pre-change file the guard reports `components/NavigationGuardProvider.tsx` at lines
**6, 152 and 164** — the import specifier and both provider tags. The finding named "line 42" for
the read, which the guard reaches through the binding and deliberately never names, so this is the
same three sites counted at a different one of them: one file, nothing else in the web root, which
is the evidence that the finding's "single occurrence" was accurate.

What the guard proves is that no module *names* the old API. It cannot prove a context is read in
the right component, or provided above its consumers — that is what the behavioural test above is
for, and what a missing provider throws for at runtime.

### The sweep itself is now shared

`sweptSources`, its two constants and the three assertions proving it had reached anything were
byte-identical in `icon-import-policy.test.ts` and `native-dialog-policy.test.ts`; this guard would
have been the third copy, which is where that stops being a coincidence. The walk is
`lib/swept-web-sources.ts` and the claim the three were each making separately — that it reaches
the web root rather than silently matching nothing, which is how a clean sweep lies — is
`swept-web-sources.test.ts`'s, asserted once and more strictly than any of the three did.

What is swept stays each guard's own decision, stated in each guard's own comment: the chart guards
(ADR-0084, ADR-0090) exclude `audit/`, which must import a chart statically to mount it for the
parity assertion, and so do not use this module. Only the walk the whole-root guards agree on
moved.

## Consequences

The app's four contexts are now read one way. The composition audit's findings are closed: #6 was
the last of the six, and the `react19-*` / `patterns-*` / `state-*` rows that had warnings are now
pass rows (`architecture-compound-components` stays qualified, for the reason ADR-0107 records —
`Field` answers the rule in substance and deliberately not in shape).

The change itself is three lines in one file. The guard and its test beside it are the part worth
having: without them the next context is written by copying whichever one its author opened first,
and this finding comes back as a LOW in the next audit.
