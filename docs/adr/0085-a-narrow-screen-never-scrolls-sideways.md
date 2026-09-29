# 0085 — A narrow screen never scrolls sideways

A 320px phone is the narrowest viewport this app claims to serve, and on two
screens it did not work: Training history put its "+ Log an exercise" link and
its record count in a header row that could not wrap, and Hand-Authored creation
sized itself to an entire exercise name. The measured document widths were 338px
and 789px inside a 320px viewport, in every Skin and Mode — so reaching the
filter controls, or the field you were typing a name into, meant scrolling the
page sideways first.

So **no content widens the document past the viewport**, in two clauses:

- A name the user authored **wraps**; it is never truncated and never sets the
  width of the box around it.
- A header or action cluster **wraps** rather than pushing its row past the edge.

## The mechanism was a box floored at its own content

The interesting part is not that a long name is long. It is that a leaf which
refuses to shrink only matters when some ancestor is *sized to its content's
minimum* — and in the creation form that ancestor was a `<fieldset>`.

Every `fieldset` inherits `min-inline-size: min-content` from the UA stylesheet,
and `border-0 p-0` does not override it. A `truncate` on the composition strip's
tile made that span's min-content the whole 100-character name (668.64px
measured), the chain carried it up, and the fieldset — the one box in the chain
that CSS floors at min-content — refused to be narrower. 668.64 → 764.64 at the
fieldset, plus the shell's 24px gutter, is 788.64. The captured document width
was 789, with zero slack.

`pulse/field.tsx` already carried `min-w-0` on its fieldset. Five authoring forms
did not. That asymmetry is the whole defect, and it is why the fix is one class
in six places rather than a layout redesign.

The header clause is simpler: `shrink-0` on an action slot inside a row with no
`flex-wrap` leaves the overflow nowhere to go. It now wraps, and the action sits
at the start of its own line under the title it belongs to.

## The guard proves less than the runner, deliberately

[`reflow-policy.ts`](../../apps/web/lib/reflow-policy.ts) runs in the existing
`web` CI job and checks **one** thing: a box CSS floors at min-content must say
`min-w-0`, or spell a grid track `minmax(0,1fr)` instead of `1fr`. It reproduced
all six pre-fix violations — including the measured root cause — and reports none
after.

Two patterns were in its first draft and came out, which matters more than the
two that stayed:

- **A `nowrap` value.** `truncate` carries `overflow-hidden`, so it clips
  harmlessly unless an ancestor is itself floored at min-content — and that
  ancestor is usually in another file. Flagging every `truncate` on interpolated
  text produced findings on correct, idiomatic code.
- **A `shrink-0` child of a rigid row.** Whether a row fits is a *width*
  question. The page header that started this had a perfectly wrappable title
  beside its rigid action; nothing in its class strings distinguishes it from
  dozens of correct rows. The first draft produced 77 findings, nearly all false.

A guard that cries wolf teaches people to add exemptions, so the clauses a class
string cannot decide are enforced by measurement instead:
[`audit/reflow.mjs`](../../apps/web/audit/reflow.mjs) renders every journey at
320px and asserts the document does not exceed the viewport. This is the same
split ADR-0084 draws for chart values — the guard proves a pattern is absent, the
runner proves the page fits — and it is why the exemption registry here ships
**empty**: everything the narrowed guard flagged was simply fixed.

## Truncation is not a width limit

An ellipsis reads like a constraint and is the opposite of one: `text-overflow`
needs `white-space: nowrap`, which makes the element's min-content the entire
string. So an authored name wraps. The composition strip's tile — this Session's
map — now shows the whole name over several lines rather than three rows of
"Long exercise name wi…", which named nothing.

Truncation survives only where it costs no meaning: `aria-hidden` drag overlays,
which are out of flow and mirror a row still readable underneath. Those are not
registry entries, because the narrowed guard does not flag them at all.

## What is measured, and what is still open

`audit/reflow.mjs` is a lean, re-runnable sweep — the 4,224-capture
`revalidate.mjs` matrix is a one-time evidence artefact, not something you can
run while writing a fix. It mounts the same journeys against the same fixtures,
and adds two the recorded matrix never covered: `correction`, and `creation` in
its default `authorAndLog` flow, whose performed-set grid `planOnly` hid from
every capture ever taken.

Result: **zero document overflow in all 600 cases at 100% text**, which is wider
than the finding asked for — the P3 unbroken-name overflows in logging (1,562px)
and the newly measured `correction` (1,545px) closed with the same rules.

Two limits are stated rather than implied. **Chromium only**: WebKit is not
installed in the remediating container, so the two-engine criterion is half-met.
And at **200% text** (WCAG 1.4.4, root 16px → 32px, viewport unchanged), 240 of
600 cases still overflow — every one of them a `rem`-sized grid track in a form
field row, where `grid-cols-[7rem_1fr]` becomes a 224px fixed column inside a
320px viewport. That is a fixed-track defect, not an unshrinkable-box one; it
wants those rows to stack, which is a redesign of four forms and belongs to its
own issue.

Rather than gate on a defect this change does not fix — a permanently red runner
is worth nothing — or bury it in prose nobody runs, the four journeys are a named
**ratchet** in the runner. Every journey outside the list must pass at 200%, so a
new regression fails the run; and an entry that stops overflowing also fails it,
so the list can only shrink.

The authenticated 200% check the finding names as its success criterion was
**not** run: a fixture pass at doubled root font size is not a signed-in phone.
