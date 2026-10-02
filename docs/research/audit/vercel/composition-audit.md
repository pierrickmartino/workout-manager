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
| `state-context-interface` | ✅ Fixed — `SetEntry`'s two providers over one contract are the `swap the provider, keep the UI` case #1 could not prove (#2, ADR-0106) |
| `architecture-compound-components` | ⚠️ `SetEntry.*` is the first (#2, ADR-0106). `Field`'s positional contract is gone and its wiring is a context (#3, ADR-0107) — but `Field` is deliberately **not** a compound namespace, so this rule's illustration is answered in substance, not in shape |
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

> **Status (2026-10-02).** #1, #2 and #3 are fixed; each carries a `**Resolution:**` note saying
> what landed and what deliberately did not. The conventions they set are ADR-0105 (a Prescription
> row reads the draft it edits), ADR-0106 (a set-entry field is written once) and ADR-0107 (a field
> publishes its wiring and the control claims it). #4–#6 are untouched.
> The suggested order below still holds for the rest, with three corrections: #6 was listed first so
> the contexts added in #1 and #2 would be written against the current React 19 API — all three are
> written that way regardless, so #6 remains a two-line change to one file and nothing is blocked on
> it. #2's own note records that the finding *understated* its correctness case: the drift it
> predicted had already happened, in four separate places. And #3 was ordered after #2 on the
> expectation that `SetEntry` would be `Field`'s largest consumer — it turned out not to use `Field`
> at all, so the two were independent and the ordering cost nothing either way.

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

**Resolution:** done, and recorded as ADR-0106. The reading was right on the part that mattered
most: the controlled/uncontrolled split was the *only* real difference between the copies, so two
providers over one `{ state, actions, meta }` contract (ADR-0105's shape) let all four forms share
the fields. `SetEntry.Load` is the one place a Load kind is added; `SetEntry.Quantity` the one place
a Quantity kind's fields are.

The finding called this "a correctness risk, not a DRY nit" and **understated it** — the drift had
already happened, in four places no type could catch:

- `CorrectLogForm` declared no `inputMode` on **either** of its Load value fields, so the same
  field offered a decimal pad in two forms and a full QWERTY in the third (ADR-0093).
- Its pre-filled distance input declared no `type` and no `step`, so a 5 km run was typed on an
  alphabetic keyboard in that one form.
- The kind picker was captioned two different ways, and the majority spelling is the word
  CONTEXT 'Quantity' lists under _Avoid_ — a standing terminology-guard violation (issue #345)
  the guard had never been able to see, because in all four forms the caption was a JSX **text
  node** rather than the quoted label its regex matches. Merging the copies moved it into a string
  literal and the guard failed immediately. The minority spelling was the lawful one, so the
  majority moved: the caption is "Quantity" and the accessible noun "Quantity kind".
- The duration field had **four** different accessible names for the same thing, one of them
  (`Back Squat amount`) matching neither its caption nor its field.

Three parts of the suggested shape were adjusted:

- **No `SetEntry.Row`.** Only three of the five rows share a card — a skipped log row dims and
  tightens its padding, a Live Session set is a `Card` — and a shell three callers use while two
  override it with a flag is the `patterns-explicit-variants` trap the same rule set warns about.
  The shared string is a constant (`SET_ENTRY_CARD`), not a component.
- **`Load` returns its two cells bare**, not wrapped in a row, because `AddedSetRow` puts the
  effort picker on the same line. `Distance` is the opposite — three cells, so it owns its row, and
  `basis-full` is the ask that row makes where it nests beside the effort picker (ADR-0087).
- **`Kind` is controlled under both providers.** The picked kind decides which fields exist below
  it, so a form that seeded it and walked away could not re-render its own row — which is precisely
  what `CorrectLogForm`'s added rows hold React state for. `SetEntryFormProvider` therefore takes
  that one edit *by name* (`onKindChange`) and throws on any other, rather than accepting a general
  `edit` it would only partly honour.

This did *not* reduce line count: the four forms went 1996 → 1486 while the shared family is 687,
so it is 177 lines *more* source in total, before the tests. The win is that eleven field blocks
are one.

Also worth naming, since the audit could not have seen it: `adhoc` was a renderable audit case
that **neither** `reflow.mjs` nor `wide.mjs` swept, so the ad-hoc log form was unverified at every
width while its three sibling log forms were gated — and it is the one of the four whose field rows
changed shape (a lone amount field had sat in a two-column grid, taking half a row and leaving the
other half empty). Both journeys now render it.

One judgement was deliberately left alone: the kind picker's option **order**. `lib/quantity.ts`'s
`AMOUNT_KIND_OPTIONS` orders them Reps / Duration / Distance for the authoring surfaces and these
forms have always shown Reps / Distance / Duration. Silently reordering a picker in four forms is a
change to what users see, not a refactor, so the inconsistency is now stated once rather than
spread across four files.

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

**Resolution:** done, and recorded as ADR-0107. The diagnosis was exactly right — "the first child
is the control" is unenforceable, and what it breaks is the label association, which nothing
reports. The direction is now inverted: the field publishes its id, its hint/error ids and its
invalid state, and the control claims them.

Four parts of the suggested shape were adjusted, each for its own reason:

- **No `Field.Control` render prop.** The illustration in `architecture-compound-components` is
  `<Field.Control>{(props) => <Input {...props} />}</Field.Control>`, which is a render prop — and
  `patterns-children-over-render-props` is one of the two rules this codebase passes with **zero**
  occurrences, which this audit's own verdict calls load-bearing and says should not regress.
  Taking the syntax would have traded a MEDIUM finding for a regression in a clean rule, across
  ~60 call sites, to arrive at the same place. The claim is `useFieldControl()` instead, which the
  three form primitives make on the call site's behalf: ADR-0093 already routes every control
  through `Input`/`Select`/`Textarea`, so **using the design system is the claim** and no call site
  changed.
- **No `<Field.Hint />` / `<Field.Error />`.** As elements whose content comes from the `Root`'s
  props they are strictly worse than the `hint`/`error` props they replace: forget one and the
  text silently disappears, which is the same class of unreported failure the finding is about.
- **No `Field.Root` / `Field.Label` namespace either**, and this one is *not* covered by the
  render-prop argument — a children-based `Root`/`Label` pair would have regressed nothing. It
  was declined because it buys no mechanism: once the control claims its own wiring, splitting
  `label` into a child element changes ~60 call sites and removes no failure mode. The rule's
  purpose here was the positional contract, and that is what was paid off; `Field` keeps its
  props and is not a compound component, which the rule table above now says rather than
  claiming a clean pass.
- **The id is named once.** `htmlFor ?? control.props.id ?? generatedId` scavenged the first
  child's id, which a context cannot see and must not: a control naming its own id leaves the
  field's `<label for>` pointing at nothing. `htmlFor` on the field is now the only way to pick
  one, and 14 controls that were naming an id their field already named — all of them in the four
  admin editors — stopped.

One word in the finding deserves a qualification. "The a11y wiring becomes explicit rather than
inferred" is true of the *mechanism* and not of the call sites: `<Field label="Name"><Input
/></Field>` is byte-identical before and after, so nothing there became explicit. What changed is
that the inference is no longer from **position** — which a call site could break without touching
the field, and which neither the type system nor any sweep could see — but from **component
identity**, which both can. The literal explicitness exists where it has to: in the primitive, in
the guard, and at a control that is not a primitive, which does write the claim where it stands.

The prediction that "the `SetEntry` work will be its largest consumer" turned out **false**, and
usefully so. `SetEntry` (#2, ADR-0106) does not use `Field` at all: it nests each control inside
its own `<label>` with a `Caption`, which is the same problem solved by containment rather than by
wiring. So #3's consumers are the ~60 call sites that were already there, and the two
`cloneElement`/`Children.toArray` uses the finding counted are now zero.

Two things the finding could not have seen:

- **Inverting the direction moves the silent failure rather than removing it.** A field with no
  claimant has a label pointing at nothing; one with two has both claiming a single id. Neither
  throws, so `lib/field-control-policy.ts` requires exactly one claimant per field, fails closed,
  and ships with an empty registry. It found precisely one real violation on first run — the file
  picker in `AdminExerciseImage`, the one control in the app that sits in a field without being a
  primitive, and before this change the one field whose hint reached its control only because the
  control happened to be written first. No field anywhere held two, so nothing had been relying on
  "first child wins".
- **The older of the two test harnesses could not have tested this.** `lib/offline-tsx.ts` had no
  module registry — the gap ADR-0105 fixed in `lib/tsx-harness.ts` after a shared `createContext`
  became one copy per importer — and a `Field` and an `Input` reaching one context across two
  modules is that shape exactly. The provider and the control would have read different contexts
  and the wiring would have reported itself absent. The four files on the old loader moved over,
  `offline-tsx.ts` is gone, and `loadTsxGraph` was added because two `loadTsx` calls are likewise
  two registries. Only one of those four files needed to move for this change; migrating the other
  three and deleting the module is cleanup beyond the finding, taken because leaving a second
  loader alive would leave the exact gap that would have hidden this change's own failure.

#4 is untouched and is now slightly cheaper: splitting `FieldLabel({ group })` into `FieldGroup`
and `FieldLabel` would make this guard's two `group` branches unnecessary.

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
   typed-`Load` selector across four forms. **Done — ADR-0106** (and the drift it
   predicted turned out to have already happened, four times over).
4. **#3** `Field`'s positional-children contract. **Done — ADR-0107** (by a published context and a
   claimed wiring; the render-prop illustration was declined, and `SetEntry` turned out not to be a
   consumer at all).
5. **#4**, **#5** — small, independent, safe any time.

Each step is independently shippable. #1 and #2 touch files with existing
`lib/` test coverage (`lib/protocol-builder.test.ts`,
`lib/hand-authored-session.test.ts`), so the view-model contracts stay pinned
while the component layer is restructured — none of this should require changing
a `lib/` test.
