# 0108 — Two renderings are two names

`components/pulse/field.tsx` carried one compact label wrapper with a flag:

```tsx
export function FieldLabel({ label, children, group = false, className }: FieldLabelProps) {
  if (group) {
    return <fieldset className={cn("min-w-0", className)}><legend …>{label}</legend>{children}</fieldset>;
  }
  return <Field className={cn("gap-1.5", className)} label={…}>{children}</Field>;
}
```

The two branches share the caption's wording and nothing else: a different element, a different
accessible structure, and — since ADR-0107 — a different contract. `Field` publishes an id its
one control claims; a `<fieldset>` publishes nothing and each control inside it carries its own
name. So `group` was not a variation of a rendering, it was a choice between two, which is the
`patterns-explicit-variants` case the composition audit filed as finding #4.

The two are now `FieldLabel` and `FieldGroup`, taking one shared `CompactFieldProps`: the ask is
the same, the decision is which name a call site writes. The rendered output of both is
unchanged, `min-w-0` stays on the fieldset (ADR-0085 — the UA stylesheet floors every fieldset at
its content's minimum width, and `border-0 p-0` does not override it), and there was exactly one
`group` call site to move: the distance-and-time pair in `HandAuthoredSessionForm`'s performed-set
rows (ADR-0032).

**The two captions do not render alike, and this change deliberately does not make them.**
`FieldLabel`'s goes through `Field` to the `Label` primitive, which adds `label-mono` — uppercase
and letter-spaced, the design system's micro-label grammar. `FieldGroup`'s `<legend>` carries
plain `font-mono`, so it renders as authored: `SET 1 DISTANCE (KM)` beside `Set 1 hold` in the
same row. That is verbatim what the `group` branch did, and unifying it changes text a user reads
— ADR-0106 left the amount-kind picker's option order alone for the same reason, and for the same
reason this is now stated in one place rather than implied by two call sites. It is named here
because the shared props type invites the opposite inference: the *ask* is shared, the caption
treatment is not, so a future reader should not DRY the two captions into one constant on the
assumption that they already agree.

## The flag was load-bearing in the guard, which is the part worth recording

`lib/field-control-policy.ts` reads a field's subtree and requires exactly one claimant. A
grouped `FieldLabel` had no id to claim, so the guard had to evaluate `group` from source — and a
flag it could not evaluate was a fieldset wanting several controls and a field wanting exactly one
at the same time. That was a fourth problem class, `undecidable-group`, reported so the call site
would be split. Splitting the component removes the class by construction: `FieldGroup` is not a
field element, so there is no flag to read and no call site that can be both.

Two consequences are deliberate rather than incidental:

- **The descent does not stop at a `FieldGroup`.** A grouped `FieldLabel` was a field tag, so the
  guard treated it as owning its own control and looked no further. `FieldGroup` renders a bare
  fieldset with **no provider**, so a control nested in one *inside* a `Field` genuinely reads that
  field's context and claims its id — two of them is a real ambiguity, and stopping there would
  hide it. The guard now reports it, which the old shape could not.
- **A `FieldGroup` on its own is unswept, exactly as a grouped `FieldLabel` was.** Nothing checks
  that the controls under a legend carry accessible names of their own; that is asserted by
  rendering, in `lib/form-accessibility.test.ts`, for the one composite the app has.

## What is held, and by what

- `lib/form-accessibility.test.ts` renders `FieldGroup` and reads back a `fieldset > legend`, no
  `<label>`, and both controls keeping their own names — the same assertion as before, against
  the name instead of the flag.
- `lib/field-control-policy.test.ts` holds the guard's new shape: a control inside a `FieldGroup`
  may name its own id, a `FieldGroup` is outside the contract entirely, and one nested inside a
  `Field` makes that field's claimants ambiguous.
- `audit/reflow.mjs` and `audit/wide.mjs` are unchanged and still clean, which is how the claim
  that the rendered output did not move is made rather than argued — the `hand-authored` journey
  renders the one call site that moved.

## Consequences

`field.tsx` is 102 lines where it was 88, and the guard is 26 lines shorter (336 → 310) with one
fewer problem class. A call site now says which structure it wants, and the audit's remaining finding
(#5, `GenerateTrainingLaunchpad`'s two booleans) is the same rule applied to a different shape.
