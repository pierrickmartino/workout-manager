# 0101 — Rendered copy is typeset

Two findings from the Web Interface Guidelines audit (#10, #11), both about the words
themselves rather than about what the app does with them.

`text-balance` and `text-pretty` appeared nowhere, so every display title broke wherever
its line box ran out — which on a 320px screen regularly leaves one word alone on a second
line. And the audit found two placeholders using the typewriter apostrophe (`can't`) beside
the many that already used the typographic one (`can’t`), which is what makes a straggler
read as a defect rather than as a style.

Sweeping for the second one found **33** strings, not two, across 20 files — the sizes
below are what the rules turned out to cover, not what the audit listed.

## A display title decides its own wrap

`text-wrap: balance` asks the browser to even the lines of a short block out instead of
filling each one in turn. It is the right default for a heading and the wrong one for body
copy (browsers cap it at a handful of lines, and `pretty` — which only fixes the last line
— is the body answer). So the rule is scoped to the display face: a heading set in
`font-display` states `text-balance`, or `text-pretty` where balancing would centre a
two-word tail, and the guard accepts either.

Fifteen headings took `text-balance`, which is every heading in the app set in the display
face, `CardTitle` included — it has no call site today, but it is a heading primitive and a
future call site should inherit the decision rather than rediscover it.

What it does *not* change is the reflow floor. `balance` picks among the break opportunities
a line already has; it cannot make a box narrower than its longest unbreakable word, which
is the measure `reflow-policy.ts` and `audit/reflow.mjs` gate on. `session-hero`'s
`min-w-0 break-words` pairing (ADR-0085) is untouched and still does the load-bearing work.

### The guard

[`lib/display-heading-policy.ts`](../../apps/web/lib/display-heading-policy.ts) sweeps every
component and page for a heading element whose classes name `font-display` and no wrap
decision. It reads the classes through the shapes the app writes — a plain string, a `cn()`
call, a conditional, a template literal — and **fails closed** on a heading whose className
cannot be read at all, because the display question cannot be answered from a variable.

Two things are out of scope by rule. A heading that cannot wrap (`truncate`, `line-clamp-1`)
has no wrap to even out; a `line-clamp-2` still wraps, so it still balances. And a capitalized
tag is invisible to the guard: what `SessionCard`'s `<Title>` renders is a property of that
component, not of its call site, and guessing is the one answer that can be silently wrong.
(That one truncates, so it is exempt by rule anyway.)

## An apostrophe in an authored string is the typographic one

The fix is a character each, so the interesting half is the sweep. Copy in this app lives in
three places: JSX text, a JSX attribute (`placeholder`, `hint`, `title`, `aria-label`,
`emptyMessage`), and a `lib/` view-model — ADR-0098 deliberately moved a dialog's two slots
into `deleteControlView`, so a guard that only read components would miss the place the
convention most wants holding.

[`lib/copy-typography-policy.ts`](../../apps/web/lib/copy-typography-policy.ts) therefore
sweeps components, pages **and** view-models for a straight apostrophe between two letters,
read from the AST: JSX text, string literals and template spans. A comment is not a string
literal, so a note explaining the rule — including the ones in that module — is not a breach
of it. A module specifier is skipped, since the parser hands an import path over as the same
kind of node.

**The rule is every authored string, not only the rendered ones**, and that is a deliberate
widening of what the audit asked for. Nothing in a string's syntax says who reads it: a
guard's failure message, a registry's `reason:` field and a placeholder are the same node
kind. A sweep that tried to tell them apart would be guessing, and the guess that fails
silently is the one that calls a rendered string a diagnostic. So eight of the 33 edits are
to text no end user sees — four `reason:` strings in `accent-tint-policy.ts`, the formatter
messages in `recharts-import-policy.ts` and `server-locale-policy.ts` — which costs nothing,
since a developer reading a failure message is a reader too. The rule is about the
character, and it claims nothing about the audience.

The registry is **not** empty, and the two entries are the point: `lib/session-section.ts`
matches `world's greatest` and `child's pose` against *authored Exercise names*, which a
curator types with the typewriter apostrophe. A curly one there would match nothing — the
keyword is data, not copy — so each entry names the one word in the one file and says why.

The guard's own module is the single file the sweep does not read, which is **not** an
exemption: a registry has to be able to spell the strings it exempts, and an exemption
entry for its own excerpt would be circular. The test states the skip rather than hiding it
in the registry.

## What is deliberately not mechanized

The audit's other half of #11 is the ellipsis: a prose placeholder should end in `…`, while
an example pattern (`mm:ss`, `3-1-1`, `70`) should not. That classification is a judgement
per field — a guard that guessed would be wrong on half of them — so the four prose
placeholders the audit names were fixed by hand and nothing watches them.

The line drawn, since the result looks uneven on purpose: a placeholder that reads as an
**instruction or a phrase** takes the ellipsis (`Search by name or type…`, `e.g. gain muscle
mass…`), and one that shows **a value, a single token or a literal list** does not (`e.g. 2`,
`dumbbells, pull-up bar`, `Bicep Curl`, `mm:ss`). The guideline's own wording is "show
example pattern", and a one-word example is already the pattern — adding dots to `e.g. kg`
suggests more is expected of the field than a unit.

One placeholder was **removed** rather than punctuated. The profile's rest-timer field
restated its own `hint` word for word; a hint is in the control's `aria-describedby`, a
screen reader reads it, and it survives the first keystroke. The placeholder was a second
copy of the same sentence to keep in step — and, by the time the audit found it, the copy
that had drifted.

Straight double quotes are out of scope too. The app uses curly ones in copy already, and a
`"` inside a string is as likely to be a CSS selector or an attribute value as a quotation
mark, so the signature is not clean enough to key on.
