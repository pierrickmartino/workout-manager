# 0098 — A destructive confirmation is the app's own dialog

Three irreversible actions asked for confirmation with `window.confirm`:

```text
components/DeleteLogControl.tsx:33       delete a Logged Session
components/AdminExerciseDelete.tsx:33    the admin hard delete (ADR-0076)
components/GenerateProtocolForm.tsx:43   the Protocol supersede one-way door (ADR-0037)
```

[`ConfirmDialog`](../../apps/web/components/pulse/confirm-dialog.tsx) already existed
and `NavigationGuardProvider` already used it. These three bypassed it.

## Why this is not a styling complaint

A browser dialog is chrome, and the cost is not that it looks wrong in six Skins —
though it does. It is that **the browser owns the answer**. After the first dialog
on a page, Chrome, Firefox and Safari all offer the reader a "prevent additional
dialogs" checkbox. Once ticked, every later `window.confirm` on that document
returns without asking anything.

So the guard becomes a standing answer, and which answer depends on the browser:
the delete silently stops working, or the one-way door silently stops being a door.
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

**The supersede** is the one that needed state. The generate form is uncontrolled, so
the submitted values are read at submit time and held in `awaitingSupersede` while
the question is on screen; re-reading the form on confirm would depend on it still
being mounted. The confirm button is destructive-styled on purpose: accepting sets
aside a Protocol the user is partway through.

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
which mounts all three controls and holds the same three properties on each: opening
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
  `audit/reflow.mjs` and `audit/wide.mjs`.
