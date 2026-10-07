# 0103 — A field arrives quiet

Two findings from the Web Interface Guidelines audit (#13, #14), both about what a control
does to the reader before the reader does anything to it.

`autoFocus` was on one field. `spellCheck` was on none, so every tempo code, duration and
equipment slug in the app carried a red underline, and on a phone an offer to correct it.

## Nothing takes focus on arrival

The one `autoFocus` was the standalone Session's inline rename field — which lives inside an
`OverflowMenu` disclosure. So on a phone, tapping "More actions" raised the keyboard and
scrolled the panel out from under the thumb that had just opened it. The guideline restricts
`autoFocus` to a desktop screen whose single reason to exist is one input; this is a
mobile-first PWA and that screen does not exist here.

The attribute is gone and nothing replaces it. The audit offered "a focus call gated on a
pointer/viewport check" as the alternative, and that is worth naming as rejected: a
viewport-gated focus is a second rendering path for the sake of saving one Tab, on a field
that is already the first focusable element in the panel it appears in. The reader who wants
it is one keypress — or one tap — away.

Managed focus is a different thing and stays. `lib/use-modal-focus.ts` moves focus into a
dialog when it opens and restores it to the opener on close; that is a response to the
reader's own action, not a seizure of it.

### The guard

[`lib/autofocus-policy.ts`](../../apps/web/lib/autofocus-policy.ts) sweeps every component
and page for the attribute on anything, not only on a field — it works on anything focusable
and the keyboard it summons does not care which element asked. It reports a conditional
`autoFocus={isDesktop}` too: that is a decision to argue in review, not one to pass
unseen. Its registry is empty.

## A field whose value is not a word says so

`spellCheck` splits in three, because the app's single-line fields are not one kind of thing.

**Derived, for a search box.** `type="search"` gets `spellCheck={false}` from
`components/ui/input.tsx`, joining the `autoComplete` and `inputMode` defaults already there
(ADR-0093). A query is not prose, and a red underline under half a movement name typed so far
is noise on every search screen at once.

**Declared, for a value field.** A tempo (`3-1-1`), a duration (`mm:ss`, `0:45`), a Load
(`70`), an effort target and an equipment slug list each state it where they stand — 24 call
sites. This is not derivable from the type: they are all `type="text"`, and so are the fields
below.

**Left alone, for prose.** A set note ("felt easy", "left knee twinge") and a movement cue
("pause on the chest") are sentences a person writes, and the browser underlining a misspelled
one is the browser doing its job. A blanket default on `Input` would have turned that off, which
is why there is no blanket default — only `Textarea` keeps the browser's answer unconditionally.

Four fields sit between: an authored Session Name, an authored Protocol name, and the two
Movement-name inputs (`CorrectLogForm`, `AdhocLogForm`). All are **off**, because an authored
label is a proper noun, an abbreviation or a gym's own shorthand ("Push A", "W1D2", "Bicep
Curl") far more often than it is a sentence. The two Movement fields are also the clearest
case of the guard's blind spot below: their placeholders are words (`Bicep Curl`, `Running`),
so nothing mechanical reaches them — they were missed on the first pass of this change and
caught in review.

### The guard

"Not a word" is a judgement a guard cannot make from a field's name — but a *placeholder
showing a value pattern* is a signature it can read.
[`lib/spellcheck-policy.ts`](../../apps/web/lib/spellcheck-policy.ts) sweeps every component
and page for a text-entry element whose placeholder is digits, separators and the `hh`/`mm`/`ss`
mask only, and asks for the decision. **Both answers pass**: `spellCheck` on a field a checker
should read is a different claim from silence, in the same way `loading="eager"` satisfies the
image guard (ADR-0095).

It **fails closed** on a placeholder it cannot read — a computed one may be a quantity
(`` `60 ${unit}` ``) or a name (`` `${objective} · ${trainingType}` ``), and those want opposite
answers, so the call site states which. Out of scope by rule: `type="number"` (no browser
spell-checks one), `type="search"` (the primitive answers for it) and the types that hold no
typed text at all.

What it cannot see is a field with **no** placeholder, and a placeholder made of words — the
equipment slug list reads `dumbbells, pull-up bar`, so its `spellCheck={false}` is a judgement
the guard does not hold. That boundary is deliberate: a guard that guessed at prose would be
wrong in the direction that silences a useful checker.

What the primitive renders is asserted by rendering it, in `lib/form-affordances.test.ts`,
alongside the other two affordances — a guard over source cannot tell a declared attribute
from a correct one.
