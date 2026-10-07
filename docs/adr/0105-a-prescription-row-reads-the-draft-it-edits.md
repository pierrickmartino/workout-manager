# 0105 — A Prescription row reads the draft it edits

The Protocol Builder's Session editor threaded its state by hand. `prescription-rows.tsx`
declared **52 callback props**, and the same block of 13 was re-declared verbatim in four
interfaces — `PrescriptionListProps`, `SupersetContainerProps`,
`SortablePrescriptionRowProps`, `PrescriptionEditorProps` — because the row that raises an edit
sits three components below the one that holds the draft:

```
PrescriptionList → SupersetContainer → SortablePrescriptionRow → PrescriptionEditor
```

`onEditField` alone appeared 16 times in that one file. `ProtocolBuilder.tsx` declared 20
callback props to feed it and handed 13 of them to `<PrescriptionList>`, each a two-line arrow
wrapping a single `dispatch`.

Two things made this worth fixing rather than tolerating.

The first is that the intermediaries were paying for props they never read. `SupersetContainer`
declared, destructured and forwarded `onSetTargetEffort` so that a grandchild could call it. A
14th event would have meant a 14th declaration at four levels plus a 14th arrow in the screen —
and the only thing stopping the 14th from being quietly dropped at one of those levels was a
required prop, which is a weak guarantee for a block of near-identically-typed callbacks.

The second is that the file was 1197 lines against this repo's 800-line ceiling, and ~380 of
those lines were prop plumbing. The ceiling was not going to be met by tidying.

## The state was already lifted — only the wiring was missing

`ProtocolBuilder.tsx` holds the draft in a `useReducer`. The 13 callbacks were each a wrapper
that added a `type` and the open Session's `sessionId` to one `dispatch`. So nothing about state
management needed to change; what was missing was a way for a row to reach the dispatch without
three intermediaries carrying it.

`PrescriptionDraftContext` (`components/builder/prescription-draft-context.tsx`) is shaped as
the `state` / `actions` / `meta` contract, so it is a contract a provider implements rather than
a private channel between two files:

- **`state`** — `prescriptions`, `layout`, `locked`, `unit`: the open Session as the screen holds
  it. A `position` indexes both arrays, which is why nothing below needs its own copy of a
  Prescription.
- **`actions`** — one `dispatch`, over a row-scoped event vocabulary (below).
- **`meta`** — the live drag gesture: `draggingId`, the classified `feedback`, and the
  `foreshadow` microcopy. Not draft state (it changes nothing until a drop) and not an action,
  but shared by every row, because the feedback escalates across the whole list.

`PrescriptionList` is the provider, and the two jobs are one job: it owns the gesture, so it is
both where the gesture's handlers belong and where it enters the context.

That is also the limit of what this change buys. The rule's own illustration is swapping one
provider for another behind unchanged UI, and the rows *are* now written against the interface —
but `PrescriptionList` still takes the draft as props and wires its own provider, so it is the one
entry point to the row tree and an alternative provider cannot be injected from outside it.
Lifting the provider out is what a second caller would need, and there is no second caller:
building one now would be an abstraction for a need the codebase does not have. Finding #2's
`SetEntry` family is where two providers are actually asked for, and that is where the shape
should be proven.

## The rows speak a session-free vocabulary

`lib/prescription-draft.ts` derives `PrescriptionEvent` from the reducer's own union rather than
re-declaring it:

```ts
export type PrescriptionEvent = WithoutSessionId<
  Extract<BuilderEvent, { type: RowScopedEventType }>
>;
```

Thirteen events, addressed by `position` alone. A row cannot name a Session, so a row's edit
cannot land on the wrong one; `toBuilderEvent(sessionId, event)` is the single place the address
is attached, in `ProtocolBuilder`, which holds both the reducer and the open Session's id.

Two type-level details carry the weight. The `Omit` has to be distributed member by member — a
bare `Omit<A | B, k>` collapses the union into the intersection of its fields and the
discriminant stops narrowing, so `event.position` would read as possibly-absent at every call
site. And `toBuilderEvent` needs **no cast**: the spread distributes over the union too, so the
compiler checks member by member that adding `sessionId` back reconstructs a `BuilderEvent`. That
is what makes the derived vocabulary load-bearing rather than decorative.

What is derived is the **payloads**: a new field on `EDIT_LOAD` reaches the rows with no second
edit. *Membership* is a judgement — which events belong to a row rather than to the screen — so
it is declared, as a `ROW_SCOPED_EVENT_TYPES` registry. The declaration is held from both sides,
because a hand-written list of string literals fails quietly otherwise: `as const satisfies
readonly BuilderEvent["type"][]` means a renamed or retired event stops compiling *at the
registry* (without it, `Extract` would simply yield nothing and the event would drop silently out
of the vocabulary), and `prescription-draft.test.ts` holds its sample events to the registry, so a
14th entry cannot be added without one to exercise it. A new reducer event that *should* be
row-scoped is still a judgement nothing can make for us — that much is inherent, and this is as
far as the type system reaches.

## What each component carries now

`SupersetContainer` takes `{ group, positions }`. `SortablePrescriptionRow` and
`PrescriptionEditor` take `{ position }`. Nothing on that path forwards anything.

Each row also derives its own slice of the drag feedback instead of being handed one computed
two levels up — which `insertionEdgeFor` had been doing twice, once per call site, with the same
arguments. A member row's `chipActive` was passed as a literal `false`; it now derives
`feedback?.formGroupChip === position`, which is the same value, because a member row registers
no link chip for `formGroupChip` to name.

Where props stayed, they stayed deliberately. Exactly **five** callback declarations survive in
the row tree, all of them `PrescriptionControls`' — each is one row's `dispatch` closed over one
position, and a button floor that names its own effect at the call site is what makes it legible.
`PrescriptionFieldStack` is a presentation-only component shared with three other authoring
surfaces (ADR-0067), so it keeps its props and the editor adapts the draft to it.

The context value is **not** memoized, and that is a decision rather than an omission. Nothing in
the row tree sits behind a `React.memo`, so a consumer re-renders with `PrescriptionList` whatever
the value's identity is; a `useMemo` would read as saving renders while saving none, which is the
failure ADR-0091 is about — and it would be defeated anyway, since `feedback` is a fresh
descriptor on every drag-over. The day a row is memoized, the stable value and the `useCallback`
on the dispatch it closes over land in that same change, which is that ADR's pairing rule read in
the other direction. Re-render volume is unchanged either way: a drag already re-rendered every
row through its props.

## The split that the collapse made possible

Removing the plumbing took the file to ~1020 lines, which is still over the ceiling, so the
four pieces that were only ever co-located with the rows moved out:

| Module | What |
| --- | --- |
| `prescription-draft-context.tsx` | the contract, its provider, `usePrescriptionDraft` |
| `prescription-editor.tsx` | the editable card (field stack + Progression Scheme + preview) |
| `prescription-drag-chrome.tsx` | insertion line, lifted clone, link chip |
| `prescription-row-parts.tsx` | member badge, read-only row, the button floor |

(`toIntOrZero`, the numeric-field parse the container and the editor share, moved to
`lib/numeric-input.ts` for the same reason: it is a form-input parse, and neither the draft
vocabulary nor the rows' markup should be edited to change how a number is read off an input.)

`prescription-rows.tsx` is 625 lines and holds what its name says: the list, the Superset
container, the sortable row. `ProtocolBuilder.tsx` went 751 → 628.

The rendered DOM is unchanged — the provider renders no element, and every class, element and
`aria` attribute is carried over verbatim.

## This is written against React 19's context API

`<PrescriptionDraftContext value={…}>` without `.Provider`, and `use(Context)` rather than
`useContext`. `NavigationGuardProvider`, the app's only other context, still uses the React 18
spelling; that is a separate finding and deliberately out of this change. New contexts are
written against the current API so the old spelling is not what gets copied.

`usePrescriptionDraft` **throws** outside a provider rather than defaulting to an empty draft: a
row with no draft behind it would render empty fields that silently discard every edit, which is
worse than a crash at the one moment a developer can fix it.

## What is held, and by what

A context cannot be checked by a sweep the way a class convention can — what matters is not that
`use()` is called but that an edit raised at the deepest leaf lands on the right position. So it
is held by being exercised, in two files that answer different questions:

- [`lib/prescription-draft.test.ts`](../../apps/web/lib/prescription-draft.test.ts) holds the
  seam: all 13 events ride through `toBuilderEvent` with the session id added and nothing else
  moved, and the caller's event is not mutated. Its first assertion is that the samples *are* one
  per registry entry, so exhaustiveness is checked rather than claimed in a comment: a 14th event
  with no sample would otherwise be re-addressed by code nothing exercises.
- [`lib/prescription-draft-context.test.ts`](../../apps/web/lib/prescription-draft-context.test.ts)
  mounts the real `PrescriptionList` offline (`tsx-harness`) over a solo row and a two-member
  Superset, and asserts what reaches the dispatch. The load-bearing case is the **member** row,
  four levels down the path that used to re-declare the callbacks: its field edit must carry its
  own position, not the container's first member and not the solo above it. The group's
  round-rest must address the group's first position (ADR-0023 — the group owns one rest), the
  button floor must reach the same seam as the fields, and a performed Session must render
  settled record with no control that could raise an event at all (ADR-0020).

Fixing the harness was part of this. `loadTsx` evaluated every module afresh **per importer**,
so a `createContext` object imported by two files became two different contexts and a provider
in one could not be read by a consumer in the other. It now keeps a module registry per load, as
Node and the bundler do: one evaluation per module, registered before evaluation so a cycle sees
a partial export instead of recursing, and re-registered after it in case the module replaced its
`exports` object outright. The registry is per call, not global, so two tests (and two sets of
`boundaries`) still cannot leak into each other.

## What this does not do

The Builder's view-model contracts are untouched: no `lib/protocol-builder.test.ts` assertion
changed, which is the evidence that the restructuring was confined to the component layer.

One pre-existing gap is left as it was, now visible in one place rather than two: a
**drag**-resolved reorder (`RESOLVE_DROP`) does not remap the composition strip's selected tile,
while the button-path reorder does (ADR-0074). Both now pass through `dispatchRowEvent`, so
closing it is a one-line change — but it is a behaviour change, and this was a refactor.

And one equivalence is reasoned, not tested. A member row was handed `chipActive={false}`; it now
derives `feedback?.formGroupChip === position`, which is the same value *because* a member row
registers no `chip-<pos>` droppable for `formGroupChip` to name. That is a cross-file invariant
between `dragFeedback` and the render layer, and no test here pins it, because nothing in this
suite drags — simulating a @dnd-kit gesture in JSDOM would test the harness more than the rows. The
chip is still gated on `slot.group === null` as it always was, so the rendering cannot differ even
if the derivation one day did.
