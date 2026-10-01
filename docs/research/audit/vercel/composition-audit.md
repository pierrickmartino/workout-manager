# React Composition Patterns — Audit

Audit of `apps/web` against the Vercel React Composition Patterns rule set
(`.claude/skills/vercel-composition-patterns`). React 19.0 / Next 16.2.

Scope: 116 components, 43 app-router files, 164 `lib/` modules.

## Verdict

The codebase is **already compliant with the two rules that most codebases fail**
— it has no `forwardRef` and no render props at all. There is no boolean-prop
proliferation either: 19 boolean props exist across ~160 files, and no component
declares more than two.

The real gap is the opposite of prop proliferation: **callback drilling**. With
only one React context in the entire app, shared state is threaded by hand. Two
places pay for that heavily, and both are the files that exceed the repo's own
800-line ceiling.

| Rule | Status |
| --- | --- |
| `react19-no-forwardref` | ✅ Pass — 0 occurrences |
| `patterns-children-over-render-props` | ✅ Pass — 0 `renderX` props |
| `architecture-avoid-boolean-props` | ✅ Pass (2 minor exceptions, #5/#6) |
| `state-lift-state` | ✅ Fixed for #1 — ADR-0105 |
| `state-decouple-implementation` | ✅ Fixed for #1 — the rows no longer know how the draft is held (ADR-0105) |
| `state-context-interface` | ⚠️ `PrescriptionDraftContext` implements it (#1, ADR-0105), but `PrescriptionList` still welds the one provider to the list; #2 still open |
| `architecture-compound-components` | ❌ No compound components anywhere (#2, #3) |
| `patterns-explicit-variants` | ⚠️ Two boolean-mode components (#4, #5) |
| `react19-use-over-usecontext` | ⚠️ Single occurrence, not migrated (#6) |

## What is already right

Worth stating explicitly, because these are load-bearing and should not regress:

- **Zero `forwardRef`** across every component and page. Full React 19 ref-as-prop
  compliance, with no legacy wrappers to unwind.
- **Zero render props.** No `renderHeader` / `renderItem` / `renderActions`
  anywhere; composition is done with `children` (34 `ReactNode` props).
- **`NavigationGuardProvider` is a textbook `state-lift-state` implementation.**
  State lives in the provider, the live flag sits in a ref so the once-installed
  native listeners are never re-bound, consumers use a `useNavigationGuard(isDirty)`
  hook, and the consuming forms know nothing about how the guard is implemented.
  This is the model the rest of the app should copy.
- **The `lib/` view-model layer is the codebase's strongest structural asset** —
  123 test files across 164 modules. Keeping formatting and derivation out of
  components is what makes the component layer thin enough to refactor safely.

## Findings

> **Status (2026-10-01).** #1 is fixed and carries a `**Resolution:**` note saying what landed and
> what deliberately did not; the convention it sets is ADR-0105 (a Prescription row reads the draft
> it edits). #2–#6 are untouched. The suggested order below still holds for the rest, with one
> correction: #6 was listed first so the contexts added in #1 and #2 would be written against the
> current React 19 API — #1's context is written that way regardless, so #6 remains a two-line
> change to one file and nothing is now blocked on it.

### 1. HIGH — 13 callbacks drilled 4 levels deep in `prescription-rows.tsx`

`apps/web/components/builder/prescription-rows.tsx` (1197 lines) declares **52
callback props**. The same 13-callback block is re-declared verbatim in four
separate interfaces:

- `PrescriptionListProps` (line 97)
- `SupersetContainerProps` (line 475)
- `SortablePrescriptionRowProps` (line 710)
- `PrescriptionEditorProps` (line 1036)

`onEditField` alone appears 16 times in the file, threaded
`PrescriptionList → SupersetContainer → SortablePrescriptionRow → PrescriptionEditor`
(passed at lines 309, 334, 632, 817). `ProtocolBuilder.tsx` then declares 20
callback props to feed it, handing 13 of them to `<PrescriptionList>` at line 686.

**Why this is the highest-value fix:** `ProtocolBuilder.tsx:75` already holds the
state in a `useReducer`. The 13 callbacks are wrappers around one `dispatch`. The
provider is therefore nearly free to write — the state management already exists
and does not need to change.

```tsx
// Per state-context-interface: one generic contract.
interface PrescriptionDraftContextValue {
  state: { prescriptions: Prescription[]; layout: SupersetSlot[]; locked: boolean; unit: WeightUnit }
  actions: { dispatch: Dispatch<PrescriptionAction> }
  meta: { selectedPosition: number | null }
}
```

Each row subcomponent reads what it needs via `use(PrescriptionDraftContext)`
instead of receiving it through three intermediaries. `SupersetContainer` and
`SortablePrescriptionRow` stop declaring callbacks they only forward.

This collapses all 52 declarations, and is the mechanism that brings the file
under the repo's 800-line maximum (`CLAUDE.md` → Conventions).

**Resolution:** done, and recorded as ADR-0105. The reading that the reducer makes the provider
nearly free was correct: `ProtocolBuilder.tsx:75` holds the draft, the 13 callbacks were each an
arrow adding a `type` and a `sessionId` to one `dispatch`, and no state management changed.

Three parts of the suggested shape were adjusted, each for a reason:

- **The event vocabulary is derived, not declared.** `PrescriptionEvent` is
  `WithoutSessionId<Extract<BuilderEvent, { type: RowScopedEventType }>>` in
  `lib/prescription-draft.ts`, so a new field on `EDIT_LOAD` reaches the rows with no second
  edit. The `Omit` has to distribute member by member — a bare `Omit<A | B, "sessionId">`
  collapses the union into the intersection of its fields and the discriminant stops narrowing,
  which would make `event.position` read as possibly-absent at every call site.
- **`meta` holds the drag gesture, not `selectedPosition`.** The suggested `selectedPosition` is
  `SessionEditor`'s and is not threaded into the rows at all, so putting it in the contract would
  have been inventing a consumer. What *was* being forwarded through `SupersetContainer` is the
  live gesture — `draggingId`, the classified `feedback`, the `foreshadow` — so that is `meta`,
  and each row now derives its own slice (`insertionEdgeFor` had been called twice with the same
  arguments, once per call site).
- **The screen attaches the address.** A row cannot name a Session, so it cannot send an edit to
  the wrong one; `toBuilderEvent(sessionId, event)` is called once, in `ProtocolBuilder`, which
  holds both the reducer and the open Session's id. Membership in the vocabulary stays declared
  (which events are a row's is a judgement), but is held from both sides: `as const satisfies
  readonly BuilderEvent["type"][]` so a renamed event stops compiling instead of silently dropping
  out of the union, and a test holding the samples to that registry so a 14th cannot arrive
  unexercised.

Collapsing the plumbing took the file to ~1020 lines, **not** under 800 as the finding predicted
— ~380 of the 1197 lines were prop plumbing, and removing it left the editor card, the drag
chrome and the row parts still co-located. So the four pieces that were only ever beside the rows
moved out (`prescription-draft-context.tsx`, `prescription-editor.tsx`,
`prescription-drag-chrome.tsx`, `prescription-row-parts.tsx`), and `prescription-rows.tsx` is
**625** lines holding what its name says: the list, the container, the sortable row.
`ProtocolBuilder.tsx` went 751 → 628, since its 13 feeding arrows became one.

Not quite *all* 52: exactly **five** callback declarations survive in the row tree, all of them
`PrescriptionControls`', kept on purpose — each is one row's `dispatch` closed over one position,
and a button floor that names its effect at the call site is what makes it legible.
`PrescriptionFieldStack` likewise keeps its props, being presentation shared with three other
authoring surfaces (ADR-0067). Beyond the 52, `SessionEditor`'s own 19 props are now 7.

One part of the rule is **not** delivered and should not be read as delivered: the `swap the
provider, keep the UI` illustration in `state-context-interface`. The rows are written against the
interface, but `PrescriptionList` still takes the draft as props and wires its own provider, so it
is the single entry point to the row tree and no alternative provider can be injected from
outside. Lifting the provider out is what a second caller would need, and there is no second
caller — #2 is where two providers are actually asked for, and where the shape should be proven.

The context value is deliberately **not** memoized. Nothing in the row tree is behind a
`React.memo`, so a consumer re-renders with `PrescriptionList` whatever the value's identity is; a
`useMemo` there would read as saving renders while saving none (ADR-0091), and `feedback` is a
fresh descriptor on every drag-over regardless. Re-render volume is unchanged from the prop drill.

The context is written against React 19 (`<Context value>`, `use()`), so #6 is no longer a
prerequisite for anything — see the status note above.

Two things surfaced that the audit could not have seen. `lib/tsx-harness.ts` evaluated every
module **per importer**, so a `createContext` object imported by two files became two contexts
and no cross-file provider could be read; it now keeps a module registry per load, as Node does
(registered before evaluation for cycles, re-registered after it in case a module replaces its
`exports`).
And a pre-existing gap is left as it was, deliberately: a **drag**-resolved reorder does not
remap the composition strip's selected tile while the button-path reorder does (ADR-0074). Both
now pass through one funnel, so closing it is a one-line change — but it is a behaviour change,
and this was a refactor.

### 2. HIGH — The set-entry field family is duplicated across four forms

The same amount/load entry UI is written four times, in four files:

| File | Private subcomponents |
| --- | --- |
| `AdhocLogForm.tsx` | `SetRowFields`, `RepetitionsFields`, `DistanceFields`, `DurationFields` |
| `CorrectLogForm.tsx` | `SetRow`, `AmountFields`, `AddedSetRow`, `AddedAmountFields` |
| `LogSessionForm.tsx` | `SetRow`, `QuantityField`, `LoadFields` |
| `live-session-sets.tsx` | `SetRow` |

The markup is near-identical — same `label-mono text-[9px] text-text-muted`
labels, same km/mi options, same `mm:ss` placeholders. Compare
`AdhocLogForm.tsx:357` (`DistanceFields`) with `CorrectLogForm.tsx:96`
(`AmountFields`): the only real differences are

1. **controlled vs uncontrolled** — `value`/`onChange` against `defaultValue`, and
2. the `name` / `aria-label` naming scheme (`${prefix}-distance` vs `set-${index}-distance`).

That first difference is exactly the one `state-context-interface` dissolves. A
single `SetEntry.*` compound family with two providers — one controlled, one
uncontrolled/server-action-backed — lets all four forms share the fields without
sharing a monolithic parent.

**This is a correctness risk, not a DRY nit.** `Load` is a typed value
(absolute / bodyweight / %1RM / qualitative / range — `CONTEXT.md`, and a
load-bearing invariant in `CLAUDE.md`). The load-kind selector is duplicated, so
adding a Load kind means editing four files, and missing one degrades a typed
Load silently in a single form. The same argument applies to `QuantityKind`
(repetitions / distance / duration).

Suggested shape:

```tsx
const SetEntry = {
  Provider: SetEntryProvider,   // controlled: value/onChange
  FormProvider: SetEntryForm,   // uncontrolled: defaultValue + server action
  Row: SetEntryRow,
  Reps: SetEntryReps,
  Distance: SetEntryDistance,   // distance + unit + optional time (ADR-0032)
  Duration: SetEntryDuration,
  Load: SetEntryLoad,           // the one place a Load kind is added
  Effort: SetEntryEffort,
}
```

Each form then reads as an explicit variant (`patterns-explicit-variants`) and
composes only the fields it offers.

### 3. MEDIUM — `Field` has an implicit positional-children contract

`apps/web/components/pulse/field.tsx:27-36`:

```tsx
const items = React.Children.toArray(children);
const control = items[0] as React.ReactElement<...>;
const id = htmlFor ?? control.props.id ?? generatedId;
// ...
{React.cloneElement(control, { id, "aria-describedby": describedBy, "aria-invalid": ... })}
```

"The first child is the control" is a contract the type system cannot enforce.
It breaks silently if a consumer wraps the control in a `<div>`, reorders
children, or conditionally renders something before it — and what breaks is the
`id`/`aria-describedby`/`aria-invalid` wiring, i.e. accessibility, which no
render-time error will report. These are the only two `cloneElement` /
`Children.toArray` uses in the codebase.

Per `architecture-compound-components`, the id and `describedBy` belong in
context and the control should claim them explicitly:

```tsx
<Field.Root error={error} hint={hint}>
  <Field.Label>Load</Field.Label>
  <Field.Control>{(props) => <Input {...props} />}</Field.Control>
  <Field.Hint />
  <Field.Error />
</Field.Root>
```

Position stops mattering, and the a11y wiring becomes explicit rather than
inferred. Given `Field` is used across the form surface, this is worth doing
after #2 — the `SetEntry` work will be its largest consumer.

### 4. MEDIUM — `FieldLabel({ group })` selects between two disjoint renderings

`apps/web/components/pulse/field.tsx:53,62`. The `group?: boolean` prop picks
between a `<fieldset>`+`<legend>` and a `<Field>` — different elements, different
a11y semantics, no shared markup. This is the `patterns-explicit-variants` case:
two names instead of one flag.

```tsx
export function FieldGroup({ label, children, className })   // fieldset + legend
export function FieldLabel({ label, children, className })    // Field
```

Small, mechanical, and self-documenting at every call site. Keep the `min-w-0` on
the fieldset (ADR-0085).

### 5. LOW — `GenerateTrainingLaunchpad` gates two cards with two booleans

`apps/web/components/pulse/generate-training-launchpad.tsx:20,24`. `showBuild`
and `showLogPastWorkout` describe 4 states, of which 2 are used (Home empty state
= neither; TRAIN launchpad = both). Each addition doubles the space.

A `children` slot after the two generation links lets each caller compose the
extra cards it wants, and the "which combination is this?" question disappears:

```tsx
<GenerateTrainingLaunchpad eyebrow="…" from="/train">
  <BuildWorkoutLink />
  <LogPastWorkoutLink />
</GenerateTrainingLaunchpad>
```

### 6. LOW — React 19 context API not adopted

`apps/web/components/NavigationGuardProvider.tsx` — the app's only context:

- line 42: `useContext(NavigationGuardContext)` → `use(NavigationGuardContext)`
- line 152/164: `<NavigationGuardContext.Provider value={…}>` → `<NavigationGuardContext value={…}>`

Two-line change, no behaviour difference. Worth doing now so the contexts added
in #1 and #2 are written against the current API rather than copying the old one.

## Explicitly not a finding

**`hasSensitiveConstraint` is correct as-is.** It appears as a boolean prop on
`HandAuthoredSessionForm.tsx:78` and `ProtocolBuilder.tsx:49`, threaded from four
server pages. It is not a UI-customization flag — it is the Safety cache bypass
invariant (ADR-0003, `CLAUDE.md` → Load-bearing invariants), read server-side
from the profile and driving a genuine behavioural difference. Do not fold it
into a variant or a context for tidiness; the explicit thread from page to form
is what makes the safety rule auditable.

**No `useEffect`-to-sync-state-up antipattern.** The rule set calls this out
specifically and the codebase does not do it. The `useEffect` calls in
`LiveSessionScreen.tsx:221` (slot persistence, ADR-0012) and
`SessionsLibrary.tsx:54` (filter → URL query) are legitimate external-store
writes, not parent-state syncing.

## Suggested order

1. **#6** (2 lines) — sets the API baseline for the contexts below.
2. **#1** `PrescriptionDraftContext` — highest value, and the reducer already
   exists. Brings `prescription-rows.tsx` under the 800-line limit. **Done — ADR-0105**
   (the collapse alone left ~1020 lines; a four-way split finished the job).
3. **#2** `SetEntry` compound family — largest correctness win; de-duplicates the
   typed-`Load` selector across four forms.
4. **#3** `Field.Root`/`Field.Control` — do after #2, its biggest consumer.
5. **#4**, **#5** — small, independent, safe any time.

Each step is independently shippable. #1 and #2 touch files with existing
`lib/` test coverage (`lib/protocol-builder.test.ts`,
`lib/hand-authored-session.test.ts`), so the view-model contracts stay pinned
while the component layer is restructured — none of this should require changing
a `lib/` test.
