# 0124 — The toast and the resume banner arrive and leave

**Status:** accepted

Two surfaces mount and unmount on their own, outside any navigation, and pop when they do
(view-transitions audit §8):

- **The sync toast** appears when there is something to say about the finish outbox, such as
  offline, syncing or failed. It lingers five seconds as a "Synced" confirmation, then goes.
- **Home's resume banner** appears after hydration, once the Live Session slot in
  `localStorage` has been read, and goes on an account change.

A `<ViewTransition>`'s enter and exit fire only inside a Transition, from `startTransition`,
`useDeferredValue` or Suspense. Both surfaces change on plain state updates: an effect's
`setState`, a timer, connectivity, an IndexedDB read. Wrapping them in a boundary alone would
animate nothing.

## Decision

**The resume banner sets its slot in a Transition.** The effect that reads the slot calls
`startTransition(() => setSlot(resumable))`. The banner is wrapped in
`<ViewTransition enter="banner-in" exit="banner-out" default="none">`. That boundary is the
component's top element, under a page that is already mounted, so its enter and exit fire.
Its Resume link spreads `NAV_FORWARD` (ADR-0121), as the hero's Start does.

**The toast mounts on a deferred copy of its visibility.** The toast's inputs are several
independent updates with no one place to wrap. `SyncStatusBanner` instead computes `visible`
and mounts the body on `useDeferredValue(visible)`. A deferred re-render is a Transition, so
the body's `toast-in` / `toast-out` boundary fires whatever caused the change. The lag is one
render. On first mount the deferred value is the real one, so a toast that is already due at
load appears without animating.

**The toast's live region is always mounted, and it is the node that stays pinned.** Step 2
(ADR-0119) pinned the toast's outer `<div>` with a registry name. React names a boundary's top
DOM node itself while it animates, overriding a manual name. So the boundary goes around the
body, not around the pinned node. The pinned `role="status"` region now stays mounted, empty
while quiet. This also helps screen readers: a message inserted into an existing polite live
region is announced more reliably than a region that arrives with its message.

**The motion.** Each surface fades in while rising 8px into place over 200ms, and leaves with
the reverse over 150ms: a toast is news, not a scene change. The toast's group sits at
`z-index: 200`, the overlay tier of ADR-0119, so it never animates under the tab bar it floats
over. The banner's group keeps its place in the page. Changes within a visible toast, such as
syncing → failed, don't animate: the boundary's `default` is `none`. ADR-0118's off switch
removes all of it under reduced motion.

## Enforcement

- **New rule.** `persistent-transition-policy.ts` gains `findPinnedUnderBoundary`. A pinned
  element written as a `<ViewTransition>`'s top node is reported, because React would rename
  it exactly while it moves. The rule reads one file at a time, so a pinned element rendered
  by a child component under a boundary is not seen.
- **Existing rules.** `view-transition-boundary-policy.ts` (ADR-0120) already requires
  `default="none"` and styled classes for both boundaries. `nav-direction-policy.ts` covers the
  Resume link.

## Consequences

Checked in Chromium with the real `SyncStatusBanner` and `ResumeSessionBanner` and the real
stylesheet. The sync hook was stubbed with `useSyncExternalStore`, so every change arrived as
an urgent update, the worst case. The slot read was stubbed too.

- **Quiet at load:** the region is mounted, empty and pinned.
- **Syncing:** the toast rose in (200ms) at `z-index: 200`.
- **Syncing → failed → synced:** no animation, copy updated in place.
- **After the five-second confirmation, on a plain timer `setState`:** the toast sank out
  (150ms) and the region stayed mounted and pinned.
- **Opening Home with a resumable slot:** the banner rose in.
- **Under `reduce`:** none of it moved.

The banner's exit on an account change was not driven. It uses the same `startTransition`
path as its entry.

The audit's `motion` journey (`audit/resilience.mjs`) supplies `syncing` at mount and expects
two status regions, one reading "Syncing". The always-mounted region and the at-mount deferred
value keep that true. The journey itself was not run here: it also launches WebKit.

Not covered by a probe: the banner rising into the page pushes the content below it down. That
content sits in the live root and moves instantly rather than gliding. Animating the
displacement would need `update` boundaries around Home's sections, which is not worth it for
an element that appears once per visit.

## Rejected alternatives

**`startTransition` inside `useSyncStatus`.** The toast's visibility also depends on
connectivity (an external store, which can't be updated in a Transition) and on the
confirmation timer. Every input would have to be wrapped separately, and the next one added
would pop.

**Keeping the boundary around the pinned `<div>`.** The registry name would be overridden for
the length of each enter and exit, losing the overlay tier and the isolation exactly while the
toast moves.
