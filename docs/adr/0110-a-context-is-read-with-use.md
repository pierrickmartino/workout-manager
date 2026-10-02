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

Not the old API. The **disagreement**: by the time this landed the app had three contexts, and the
two added since the audit were written against `use()` — `PrescriptionDraftContext` (ADR-0105) and
`SetEntry`'s two providers (ADR-0106), each of which recorded that it was written that way
deliberately so #6 would not become a prerequisite. So the one context a reader was most likely to
copy from, being the oldest and the only app-wide one, was the one written the old way, and nothing
reported that the codebase read a context two different ways.

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
`lib/`). It reports three shapes, each chosen for what it closes rather than for what it is:

- a **named import of `useContext` from `"react"`** — the binding, not the call, because
  `useContext as read` would read as any other function at its call site;
- a **property access named `useContext`** — the namespace path (`React.useContext`), which has no
  named specifier to catch;
- a **property access named `Provider`** — which covers both tags of `<Ctx.Provider>` (TypeScript
  parses a dotted JSX tag name as a property access, so the closing tag reports its own line, and
  both lines do have to change) and `const P = Ctx.Provider`, the one shape a JSX-only sweep would
  miss;
- a **property access named `Consumer`**, which is scope the finding did not ask for and is taken
  anyway: it is the third member of the same trio, React's reference marks it legacy, and it is a
  render prop — one of the two rules the composition audit found this codebase passing with **zero**
  occurrences and called load-bearing. There is none to migrate, so the sweep is not a fix; it is
  what keeps that count at zero when the next context arrives.

It is read from the AST, so this ADR's own prose and the module's comment may name the legacy API
without tripping it, and it has **no exemption registry** — there is no reading under which one of
these is the right call in this app. On first run it reported exactly the three lines the audit
named, in exactly the one file, which is also the evidence that the audit's count was complete.

What the guard proves is that no module *names* the old API. It cannot prove a context is read in
the right component, or provided above its consumers — that is what the behavioural test above is
for, and what a missing provider throws for at runtime.

## Consequences

The app's three contexts are now read one way. The composition audit's findings are closed: #6 was
the last of the six, and the four `react19-*` / `patterns-*` / `state-*` rows that had warnings are
now pass rows (`architecture-compound-components` stays qualified, for the reason ADR-0107
records — `Field` answers the rule in substance and deliberately not in shape).

The change itself is three lines in one file. The 105-line guard and the 128-line test beside it are
the part worth having: without them the next context is written by copying whichever one its author
opened first, and this finding comes back as a LOW in the next audit.
