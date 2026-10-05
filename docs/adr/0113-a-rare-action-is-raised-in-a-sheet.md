# 0113 — A rare action is raised in a sheet

ADR-0071 put a page's rare and destructive actions one tap behind progressive disclosure, and
`components/pulse/overflow-menu.tsx` was how: a native `<details>` whose `⋯ More` summary
toggled a bordered panel in normal flow. It served three call sites — the Session detail's header
(`More`), each Exercise Prescription with a Remove (`More`), and each My Sessions row
(`Actions`).

It read badly in exactly the cases it was used most:

- **The trigger was content-weight chrome.** A full-width box with the Card's border, radius and
  surface, so `⋯ More` read as a section of the page, at the same weight as what it hid.
- **Opening added a second box.** Two stacked identical rectangles — and on a Protocol member
  (only *Generate another*) or a trained plan's row (only *Favorite session*) the inner one held a
  single item. The chrome outweighed the payload.
- **The label carried no scent.** *More* and *Actions* do not say whether one thing or six is
  behind them, nor whether Delete is one, so the reader spent the tap to find out.
- **It grew the list.** On a row, opening pushed every row below it down.

## Decision

The disclosure is now **`ActionSheet`** (`components/pulse/action-sheet.tsx`): a 40px icon-only
`⋯` trigger on **a line the page already has** — beside Favorite on the detail, beside Substitute
on a prescription, at the end of a row's fact line ("3 exercises · Trained 1×") — that raises a
**bottom sheet**. A closed page spends no line on its rare actions, and an open one moves nothing:
the sheet is a modal over it.

On a row the prototype put the trigger beside Start. Rendered for real, that cost the title the
trigger's 44px, and `SessionCard`'s title truncates: at 390px even "Synthetic Session" lost its
last word. The fact line has the room and is library-only, which is exactly where row actions
exist.

The sheet is the one container the actions' inline editors never outgrow — Rename's field,
Share's link, the two-step Delete and Remove confirms open *in place of their row* and the sheet
grows and scrolls with them. That is the property the `<details>` was chosen for, kept.

- **Rows, not buttons.** Every action renders its closed state with `actionSheetItemClass()` —
  full-bleed, at least 52px, icon then label then an optional description — whatever element it
  is (a `button`, a submit in the action's own form, a `Link`), so the sheet reads as one list.
  The destructive action is last, below an `ActionSheetSeparator`, in the `danger` tone.
- **A disabled action says why, in its row.** Delete on a performed Session and Remove on a lone
  movement used a `title` tooltip, which never appears under a finger; the reason is now the row's
  description.
- **The trigger is named for its owner.** Icon-only, so its `aria-label` is its whole name, and
  where several share a screen it says whose they are (`Actions for Push A`,
  `More actions for Bench Press`). The sheet's visible title names the dialog.
- **Modal obligations come from the one seam that already meets them.** `ActionSheetPanel` calls
  `useModalFocus`, as `ConfirmDialog` does (ADR-0098): focus moves in and returns to the trigger,
  the page beneath is `inert`, scroll is locked, Escape / the close button / the backdrop dismiss.

The choice was made from a prototype of five variants on both host surfaces, across the three
real branches (Protocol member, trained, never trained) and both Modes — kept on the branch
`prototype/overflow-actions` (`apps/web/prototypes/overflow-actions.html`), not in main.

## Considered options

- **An action rail, no disclosure** — rare actions as always-visible ghost chips. Cheapest in
  taps, but it puts Delete one tap away, which contradicts ADR-0071 outright.
- **A counted flat list** — keep the `<details>`, give the trigger a live count ("5 more
  actions") and continue the card instead of nesting a box. Fixed the scent, not the weight; on a
  row it had to make the whole fact line the summary.
- **Promote the lone action** — a disclosure never holds fewer than two items; one is rendered as
  a plain chip. The minimal fix for the two degenerate cases, and nothing for the full one.

## Consequences

- **It is a client component, where the `<details>` was not.** A Server Component page still
  passes its controls in as `children`; only the sheet's open state is client-side.
- **An action renders only while its sheet is open,** so it starts from its closed state each time
  the sheet is raised, and an abandoned Rename or a produced Share link does not linger.
- **An action that leaves the page as it was must close its own sheet**, through
  `useActionSheet()`: Favorite on a row (one tap, and the Glow Edge shows the result), and Remove —
  `PrescriptionCard` is keyed by position, so after a Remove the same card renders the *next*
  movement, and a sheet left open would offer to remove one the reader never chose. Actions that
  navigate (Duplicate, Generate another) or remove their own row (Delete) unmount it with them.
  `useActionSheet()` is `null` outside a sheet, so a control still renders on its own.
- **A gesture that starts in the sheet stops at the sheet.** The panel renders where its trigger
  is, and a My Sessions row wraps its card in a press-and-hold Favorite shortcut, which a held
  finger on any action would otherwise arm. The panel stops pointer events from propagating.
- **The row's prompt is the detail's.** `DeleteSessionControl` lost its `confirmPrompt` prop: the
  compact "Delete?" existed because the row had no room, and the sheet has it.
- **There is no static sweep.** What can go wrong here is behavioural — a modal that cannot be
  left, a gesture that leaks, a sheet that outlives its subject — so `lib/action-sheet.test.ts`
  mounts the sheet and the three actions that carry an obligation, and each guard was checked to
  fail its test when removed. Those tests compare elements to booleans: a failing
  `assert.equal(element, …)` hands a live JSDOM node to the reporter, which serializes the whole
  window and hangs the file instead of naming the assertion.
- **A sheet renders only while open, so it is its own audit journey.** `sheet` joins
  `audit/reflow.mjs` and `audit/wide.mjs`, as `confirm` did for ADR-0098: the detail's five actions
  with Delete disabled, under a row's authored name as the title — 120 unbroken characters in the
  default fixture. The panel is capped at the shell's 26rem, so at `lg:` it is a centred bottom
  sheet rather than a 72rem strip.

## What this does not claim

- **No drag-to-dismiss.** The prototype drew a grip; the sheet has none, because a grip that does
  not drag is an affordance that lies. Dismissal is Escape, the close button or the backdrop.
- **No motion.** It appears without a transition, as `ConfirmDialog` does, so there is nothing for
  ADR-0082's pairing to cover; adding one later is that ADR's business.
- **ADR-0071 is unchanged.** Rare and destructive actions are still exactly one tap behind
  disclosure; only the container changed.
