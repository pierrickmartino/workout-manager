# 0107 — A field publishes its wiring and the control claims it

`components/pulse/field.tsx` read its control out of a position:

```tsx
const items = React.Children.toArray(children);
const control = items[0] as React.ReactElement<...>;
const id = htmlFor ?? control.props.id ?? generatedId;
// ...
{React.cloneElement(control, { id, "aria-describedby": describedBy, "aria-invalid": ... })}
{items.slice(1)}
```

"The first child is the control" is a contract no type can state and no reviewer can see from
a call site. It breaks the moment a consumer wraps the control in a layout `<div>`, renders
anything before it, or puts a conditional in front of it — and what breaks is the
`id` / `aria-describedby` / `aria-invalid` wiring. That is the label association: the field
keeps rendering, nothing throws, the screen looks identical, and the control is simply no
longer named. These were the only two `cloneElement` / `Children.toArray` uses in the codebase.

So the direction is inverted. The field **publishes** what it knows — the id its `<label for>`
points at, the ids of the hint and error text beneath it, whether it is in error — and the
control inside **claims** it. Position stops mattering entirely, because nothing is inferred
from it.

## The claim is the primitive

`useFieldControl()` in `components/pulse/field-control.tsx` is the claim, and the three design
system primitives make it on the call site's behalf — through `useFieldControlProps`, which
takes the whole props object and hands back the merged wiring and everything else:

```tsx
const [field, rest] = useFieldControlProps(props);
return <input … {...field} {...rest} />;
```

Taking the object rather than three destructured names is what makes the claim total. The three
keys leave `rest` however they arrived — written at the call site or carried in by a spread — so
the merged wiring is the only thing that can reach the element, and a spread cannot quietly win
over the field. It also means the three attribute names are written once rather than restated in
each primitive, which is the drift ADR-0106 is about: nothing would have mechanized the agreement
of three copies, and that ADR exists because two of five copies of a field block had already lost
their keypad.

This is why the rewrite touched no call site. ADR-0093 already requires every form control to
be `components/ui/input.tsx`, `select.tsx` or `textarea.tsx` — so *using the design system is
the claim*, and the ~60 `<Field>` and `<FieldLabel>` call sites are unchanged except where they
were naming an id twice. A control that is not one of the three says so out loud instead, by
spreading the hook where it stands.

The hook merges rather than overwrites, keeping the three decisions the old `cloneElement` made:

- **The control's own `aria-describedby` comes first**, so the field's hint and error are added
  to what the control already says rather than replacing it.
- **An error forces `aria-invalid`**, over a call site's own answer.
- **The field names the id.** Not merged — see below.

Outside a field the hook answers "nothing", and every attribute stays exactly as written. That
is not a courtesy: most controls in this app render outside a `Field` — a search box, a filter,
a cell in a set row, every part of the `SetEntry` family (ADR-0106) — so a primitive spreads
this unconditionally and a field-less call site is byte-identical. It therefore does **not**
throw outside a provider, unlike `useSetEntry`, whose absent row would discard every keystroke.
The failure a throw would catch here is the opposite one — a field with no claimant — and that
is held statically instead.

## Why not `Field.Control` with a render prop

The audit's finding sketched the compound shape the rule set illustrates:

```tsx
<Field.Control>{(props) => <Input {...props} />}</Field.Control>
```

That is a render prop, and `patterns-children-over-render-props` is one of the two rules this
codebase already passes with **zero** occurrences — which the same audit calls load-bearing and
says should not regress. Adopting the illustration would have traded a MEDIUM finding for a
regression in a clean rule, at ~60 call sites, to arrive at the same place: the control
receiving props it did not have to be positioned to get.

`<Field.Hint />` and `<Field.Error />` were dropped for a related reason. As elements whose
content comes from the `Root`'s props they are strictly worse than the `hint` / `error` props
they would replace: forget one and the text silently disappears, which is the same class of
unreported failure the finding is about. The field renders its own hint and error; there is
nothing to remember.

So the finding's goal landed and its syntax did not — with one honest qualification about the
word "explicit". At an ordinary call site nothing *became* explicit: `<Field label="Name"><Input
/></Field>` is byte-identical before and after. What changed is that the inference is no longer
from **position**, which a call site could break without touching the field, but from
**component identity** — and that is a thing the type system and a static sweep can both see,
where child order was visible to neither. The explicitness lives one layer down, in the primitive
and in the guard. A control that is *not* a primitive does write the claim where it stands, and
that is the only place the finding's "explicitly" is literal.

`Field` is also **not** a compound component at the end of this, and `architecture-compound-components`
is answered in substance rather than in shape. A children-based `Field.Root` / `Field.Label` pair
would have regressed nothing — the render-prop argument above does not cover it — but it buys no
mechanism: once the control claims its own wiring, moving `label` from a prop to a child element
changes ~60 call sites and removes no failure mode. The audit's rule table now says this rather
than claiming a clean pass.

## The id is named once

`id = htmlFor ?? control.props.id ?? generatedId` scavenged the first child's id as a fallback.
Under a context the field cannot see its control's props, and it must not: the field's `<label
for>` is what points at the id, so a control naming a second one leaves that label on nothing.
`htmlFor` on the field is now the one way to pick an id, and the hook ignores a control's own.

One capability goes with it, deliberately: a **bare** `<input id="load">` as a field's child used
to be wired, because the field read that id and cloned the rest onto it. It is now wired to
nothing at all. That is the one place this change can make an existing call site worse rather
than better, so it is the guard's loudest case — such a child is `unclaimed`, and a child whose
shape the guard cannot read (a component from another file) fails closed into the same finding.
The app had no such call site; the one that came closest was the file picker, and it now claims.

Fourteen controls were naming an id their field already named with a matching `htmlFor` — every
one of them in the four admin editors — and those are gone. The ids themselves are unchanged
and still reach the DOM through `htmlFor`, which `lib/admin-editor-props-refresh.test.ts`
confirms from the outside, since it reaches those editors' fields by `getElementById` and types
into them.

## The new silent failure, mechanized

Inverting the direction moves the silent failure rather than removing it. A field whose subtree
holds **no** claimant has a label pointing at nothing and an unassociated hint; one holding
**two** has both claiming a single id. Neither throws and both read as working, so
`lib/field-control-policy.ts` sweeps every component and page and requires exactly one
claimant per field. It fails closed, and its exemption registry ships empty.

What it keys on:

- A primitive (`Input` / `Select` / `Textarea`) — the claim by construction.
- An element spreading a traced claim — either hook, since `useFieldControlProps` returns the
  wiring as a tuple's first element and a custom control could reasonably reach for it. Its
  second element is explicitly everything the field does *not* supply, so spreading only that
  claims nothing.
- A **component declared in the same file** that spreads one. A hook can only run below the
  provider, so a non-primitive control has to be its own component; tracing the local
  declaration is what lets the escape hatch be visible to the guard rather than invisible to it.
  A component from another file claims nothing the guard can see, which is the fail-closed
  answer and the same one `form-input-policy` gives a `{...props}` spread.

Two exclusions are real rather than convenient. A **grouped** `FieldLabel` renders a
`<fieldset>` and `<legend>` and no `Field` at all: it has no single id, each control inside
carries its own accessible name, and two of them is the normal case (ADR-0032's
distance-and-time pair). And a `group` flag the guard cannot evaluate is reported, not assumed
either way — it is a fieldset wanting several controls and a field wanting exactly one at the
same time.

The guard proves a claimant is *present*, never that the wiring is correct. What a primitive
actually emits inside a field is asserted by rendering one, in `lib/form-accessibility.test.ts`
— including the three shapes that used to break: the control wrapped in a div, placed after
another child, and preceded by a conditional. The `Select` case covers the wrapped shape from
the inside, since that primitive has always wrapped its `<select>` in a positioning div, which
is the element the old contract would have handed the id to.

Exactly one control in the app sits in a field without being a primitive: the file picker in
`AdminExerciseImage`. A file input has no value to autofill and no keypad to choose, so
ADR-0093 leaves it to the platform — and it is now `ImageFilePicker`, a component of its own
that claims the wiring itself. Before this change it was the one field in the app whose hint
reached its control only because the control happened to be written first.

## One harness, because a context crosses two modules

`lib/offline-tsx.ts` and `lib/tsx-harness.ts` were two copies of the same module loader, and
only the newer one keeps a module registry — the fix ADR-0105 made after a shared
`createContext` object became one copy per importer, leaving a provider in one file unreadable
from a consumer in another.

A `Field` and an `Input` reaching the same context across two modules is exactly that shape, so
the older loader could not have tested this change: the provider and the control would have
read different contexts and the wiring would have reported itself absent. The four test files
on the older loader now use `tsx-harness.ts`, `offline-tsx.ts` is gone, and its loader test
moved across. `loadTsxGraph` was added for the same reason one level up: two `loadTsx` calls
are two registries, so a test composing a tree out of parts from different files has to load
them as one graph.

## Consequences

`field.tsx` is 88 lines where it was 79, and `field-control.tsx` is 84 — so this is more source
for the same rendered output. What it buys is that the one contract in this design system that
could not be stated is now stated, in the one place a control can be given its field.

What did not change: the rendered markup, apart from the hint and error spans now following the
children instead of the control. `audit/reflow.mjs` (900 cases at 320px, 100% and 200% text) and
`audit/wide.mjs` (1440px) both stay clean, which is how the layout claim is made rather than
argued.

`FieldLabel({ group })` is untouched. It selects between two disjoint renderings off a boolean
and is the audit's finding #4 — a separate, mechanical change, and splitting it into `FieldGroup`
and `FieldLabel` will only make this guard's two `group` branches unnecessary.
