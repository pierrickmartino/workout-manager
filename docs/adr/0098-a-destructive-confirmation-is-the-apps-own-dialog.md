# 0098 — A destructive confirmation is the app's own dialog

Three actions asked for confirmation with `window.confirm`. Two were irreversible and are still
confirmed:

```text
components/DeleteLogControl.tsx:33       delete a Logged Session
components/AdminExerciseDelete.tsx:33    the admin hard delete (ADR-0076)
```

The third was generating a Protocol over an in-progress one, the ADR-0037 supersede. ADR-0125
made a set-aside Protocol switchable, so superseding stopped being a one-way door, and #640
removed that confirmation. Generation now asks nothing and the adopted Protocol shows a short,
non-blocking note naming the Protocol it set aside.

[`ConfirmDialog`](../../apps/web/components/pulse/confirm-dialog.tsx) already existed
and `NavigationGuardProvider` already used it. These three bypassed it.

Later destructive actions were born on the dialog rather than moved onto it:

```text
components/DeleteProtocolControl.tsx     delete an un-started Protocol (ADR-0125, #639)
```

## Why this is not a styling complaint

A browser dialog is chrome, and the cost is not that it looks wrong in six Skins —
though it does. It is that **the browser owns the answer**. After the first dialog
on a page, Chrome, Firefox and Safari all offer the reader a "prevent additional
dialogs" checkbox. Once ticked, every later `window.confirm` on that document
returns without asking anything.

So the guard becomes a standing answer, and which answer depends on the browser:
the delete silently stops working, or the guard silently stops guarding.
Nothing on screen says which, and nothing in the code can tell. A guard whose
reliability belongs to the user agent is not a guard.

The rest follows from the same ownership. `window.confirm` blocks the main thread,
ignores `prefers-reduced-motion`, cannot be focus-trapped by
[`use-modal-focus.ts`](../../apps/web/lib/use-modal-focus.ts), restores focus
wherever the browser likes, renders one slot of unstyled text — which is why the
delete prompt carried a straight apostrophe in `"This can't be undone."` — and is
suppressed entirely in some embedded and PWA contexts.

`ConfirmDialog` is the app's answer to every one of those: themed, Escape-closable,
focus-trapped, `inert` on the background, focus returned to the opener, and two
typeset slots.

## Each of the three keeps its own shape

**The logged-session delete** is a `<form action>` posting to a server action. The
button keeps `type="submit"` and only `preventDefault`s, so the form still posts the
delete with JavaScript off exactly as before — the dialog is layered over that path,
not substituted for it. Confirming calls `requestSubmit()` on the form rather than
rebuilding the payload, so the confirmed delete travels the same path as the
unguarded one and the hidden `log_id` stays the single place the record is named.

**The admin hard delete** gained nothing structural; the copy was re-cut.
`window.confirm` has one slot and the dialog has two, so `deleteControlView` now
returns a `confirmTitle` (the question) beside its `confirmMessage` (what accepting
it costs) — and the message, no longer sharing a line with the question, says the
thing the one-slot version had no room for: that this removes the movement from the
shared catalog outright rather than retiring it. The guard itself is unchanged and
the backend remains the real one (409 if unmet).

**The supersede** needed state: the uncontrolled generate form's submitted values were
held while the question was on screen. It was retired by #640 (ADR-0125), not moved: a
supersede can now be undone by a Switch, so it is no longer a destructive confirmation.

**The Protocol delete** (#639) takes the logged-session delete's shape: a `<form action>`
whose submit only `preventDefault`s, confirmed with `requestSubmit()`, so the hidden
`protocol_id` is the one place the Protocol is named. Its title names the Protocol, which
is an authored name and can be 120 unbroken characters, so the dialog's title and message
now carry `break-words`. That is the `confirm` journey's title, and it overflowed only
*inside* the dialog's own scroll box, where a document-width sweep can't see it.

## The guard

[`lib/native-dialog-policy.ts`](../../apps/web/lib/native-dialog-policy.ts) sweeps
every component and page and fails on a call to `alert`, `confirm` or `prompt` —
written bare or through `window` / `globalThis` / `self`. It has no exemption
registry, because there is no destructive question in this app that a browser should
be answering.

It reads calls out of the TypeScript AST rather than searching the text, so the three
components that now explain *why* they do not use `window.confirm` do not trip the
rule they are documenting. A method named `confirm` on something else
(`wizard.confirm(step)`) is not the browser's dialog and is left alone.

What the guard cannot see is whether a confirmation was asked at all — a delete that
simply stopped asking would sweep clean. That is held by
[`destructive-confirm.test.ts`](../../apps/web/lib/destructive-confirm.test.ts),
which mounts each delete control and holds the same three properties on each: opening
the dialog performs nothing, cancelling performs nothing, and only confirming acts.
Those tests make `window.confirm` **throw** rather than returning `undefined`, so a
forgotten call cannot read as a quiet cancel.

## A harness fault this surfaced

`mountDom` installed JSDOM's `window` and `document` as globals but not its
`FormData`, so a component calling `new FormData(form)` reached Node's own
(undici's), which rejects an `HTMLFormElement` and throws — inside an event handler,
where React swallows it. A form action then did nothing at all, and looked exactly
like a handler that was never wired. The harness now installs
`FormData: dom.window.FormData` with the others.

## Consequences

- `window.confirm` is no longer available as a shortcut. A new destructive action
  mounts `ConfirmDialog`, which is four props.
- Copy for a confirmation is written as a question and a consequence, because that
  is the shape the dialog has.
- A confirmation is now part of the rendered page, so it is subject to every other
  rule here: the Contrast Floor, the reflow sweep, the motion pairing. That is only
  true of the *sweeps* if something renders one — a dialog exists only while it is
  open, so no journey had ever mounted one and the static guards would have passed
  over an unmeasured surface (ADR-0088). `audit/main.tsx` now has a `confirm`
  journey carrying the longest copy of the three, and it is in both
  `audit/reflow.mjs` and `audit/wide.mjs` — 840 cases each, 0 overflowing at
  320px (100% and 200% text) and 0 at 1440px, where the `max-w-sm` box stays
  416px rather than stretching with the frame.
