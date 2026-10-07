# 0093 — A form control's autofill and keypad come from the primitive

Two attributes decide what a form field feels like on a phone, and the app declared
neither. `grep -c autoComplete` over `app/` + `components/` returned **0** across
**122** controls, and `inputMode` appeared exactly **once**.

Both defects have the same shape: a per-field attribute that nobody remembers,
repeated 122 times. Both have the same fix: the field already goes through one of
three primitives — [`ui/input.tsx`](../../apps/web/components/ui/input.tsx),
[`select.tsx`](../../apps/web/components/ui/select.tsx),
[`textarea.tsx`](../../apps/web/components/ui/textarea.tsx) — so the primitive
states the default and a call site overrides it when it knows better.

## Autofill is off, by default and on purpose

The guideline asks for `autocomplete` on every control, and for most of this app
the right token is `off`. A password manager offering to fill a saved value into
"Reps for set 3" is noise at best; a browser filling a remembered number into a
Logged Set is a wrong record. So `autoComplete="off"` is the primitives' default,
which covers roughly 115 of the 122 sites in three lines.

The fields a browser genuinely has on file name their real token at the call site.
Today that is one field — `display_name` carries `autoComplete="name"` — and the
profile's body measurements deliberately keep `off`: a person's height is not a
form-autofill field, and nothing in the standard token list means it.

## The keypad is derived, not declared

`type="number"` is a *validation* contract. It does not promise a numeric keyboard,
and on iOS it does not deliver one — which on a PWA whose point is logging sets
between efforts means hunting for digits on a QWERTY, 27 fields over.

The keypad is `inputmode`, and for a number field it is derivable: a `step` that
admits a fraction (`0.1`, `any`) wants `decimal`; anything else counts whole things
and wants `numeric`. [`input-mode.ts`](../../apps/web/lib/input-mode.ts) is that
rule as a pure function and `Input` applies it, so all 27 fields get the right pad
and no call site states one. Every weight, distance and body measurement in the app
already spells "decimals allowed" as `step="any"` or `step="0.1"`, so the
derivation lands on the audit's hand-written answer at every site.

### What is deliberately *not* derived

A numeric pad carries no colon, no hyphen and no letters. So the derivation stops
at `type="number"`, and three families of text field keep the full keyboard:

- **`mm:ss` durations.** The audit asked for `inputMode="numeric"` here. That would
  make `1:30` untypable on iOS — the pad has no colon — against a placeholder that
  says `mm:ss`. The parser does accept bare seconds, so the field would still
  *work*, which is exactly what makes this the wrong kind of fix: it would narrow
  what a user can enter to repair a keyboard. Left alone, deliberately.
- **A `range` Load** (`60-70`) needs the hyphen.
- **A `qualitative` Load** ("as heavy as safe") is prose.

The typed-Load value field (ADR-0010) is one input serving all five kinds, so its
keypad follows the picked kind rather than its type:
[`loadValueInputMode`](../../apps/web/lib/load.ts) returns `decimal` for the three
kinds that hold one number and nothing for the two that do not. It is applied at
the five sites that hold the picked kind in state.

The two `CorrectLogForm` sites are deliberately not among them. Their kind select is
uncontrolled (`defaultValue` plus draft recovery), and the *initial* kind is readable
at render — so a pad could be set there. It would then be wrong, and blocking,
exactly when the user changes the kind: a mount-time `decimal` survives a switch to
`qualitative`, and a keyboard with no letters on a field that now wants prose is worse
than the keyboard being merely unhelpful. A correct pad there needs the kind in state,
which is a change to a form whose draft recovery depends on those defaults, and it is
not worth making for a keypad.

## The guard

[`form-input-policy.ts`](../../apps/web/lib/form-input-policy.ts) sweeps
`components/` + `app/` and fails on a **native** `<input>`, `<select>` or
`<textarea>` that declares no `autoComplete`, or a native `type="number"` that
declares no `inputMode`. The primitives pass because they state both themselves.

It watches the bypass, not the primitive: a component that hand-rolls a control is
the only way back to the original defect. It reads the AST, and it **fails closed**
on both questions — a `type` it cannot evaluate (`type={kind}`) is treated as both
autofillable *and* number-like, since it could be either, and a `{...props}` spread
declares nothing, because it may or may not carry the attribute. Stating the
attribute is the way out in both cases. The types no browser fills (`hidden`,
`checkbox`, `radio`, `file`, the buttons, `range`, `color`) are exempt by rule rather
than by registry.

The one control the sweep found is
[`SchemeControl.tsx`](../../apps/web/components/SchemeControl.tsx) — a compact
inline `<select>` with no chevron gutter, which states its own `autoComplete="off"`
rather than being reshaped to fit the primitive. The exemption registry is empty.

**What it proves, and what it does not.** It proves the attribute is *declared*. It
says nothing about whether the value is right — `autoComplete="name"` on a Load
field would pass. What the primitives actually render is asserted by rendering
them, in
[`form-affordances.test.ts`](../../apps/web/lib/form-affordances.test.ts), which
reads the markup a browser would get rather than the source that produced it.

## Consequences

- A field that needs real autofill has to say so. The default is the safe
  direction: a missing token means "off", never a wrong fill.
- `Input` now consumes `type` and `step` to derive the keypad, and passes both
  through. A future attribute derived from them belongs in the same place.
- The derivation is deliberately blind outside `type="number"`. A text field that
  wants a pad states it at the call site, where the value's grammar is known.
