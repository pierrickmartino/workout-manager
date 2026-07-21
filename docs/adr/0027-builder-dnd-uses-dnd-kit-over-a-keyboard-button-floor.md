---
status: accepted
---

# 0027 — The Builder's drag-and-drop is `@dnd-kit` layered over a keyboard-accessible button floor

The Protocol Builder (ADR-0020/0021) lets a user reorder Exercise Prescriptions and
group them into Supersets (ADR-0023). ADR-0023 fixed the *policy* — DnD is an
enhancement over `aria`-labelled controls, and contiguity is an enforced invariant — but
not the *implementation*. This ADR records the build-path choice and, above all, where
keyboard parity actually comes from, because both rejections are non-obvious.

**We use `@dnd-kit` (`/core` + `/sortable`), not the native HTML5 drag-and-drop API, and
not a hand-rolled pointer-event layer.** Native HTML5 DnD is the API a future reader would
assume by default; it is rejected because it has effectively no touch support (the domain
treats mobile/touch as a first-class input, not a fallback — handles/targets are sized to
~1cm) and a weak accessibility story. A custom pointer-event implementation would
re-create `@dnd-kit`'s sensors, collision detection, and screen-reader announcements for
no gain. `@dnd-kit` is headless (composes with the `pulse/` design system), tree-shakeable,
and touch-first.

**Keyboard parity comes from the arrow / group / ungroup buttons, not from a
`KeyboardSensor`.** The sensor set is deliberately Pointer + Touch only. The
`aria`-labelled buttons already give keyboard and screen-reader users complete
reorder/group/ungroup coverage, one-to-one with every drag gesture — that *is* the parity,
and it is the accessibility floor ADR-0023 requires. A `KeyboardSensor` would add a second,
redundant keyboard path with its own focus-management and announcement complexity, made
worse by the self-healing container gesture (dragging a member out of a Superset's
container to ungroup it), which is hard to narrate turn-by-turn. The obligations this
creates: the drag layer must never disable or hide the buttons, and the live foreshadowing
microcopy shown to pointer/touch users during a drag must be mirrored into `@dnd-kit`'s
`announcements` so a screen-reader user who is mid-drag hears the same thing.

## Considered options

- **Native HTML5 DnD API** — rejected: no first-class touch (needs a polyfill), poor a11y;
  loses to the touch-first and keyboard-parity requirements.
- **Custom pointer-event DnD** — rejected: re-implements `@dnd-kit`'s sensor/collision/
  announcement machinery (DRY/YAGNI) for no capability the library lacks.
- **No-code / form-only editing** (reorder via number inputs, group via checkboxes) —
  rejected: contradicts the visual-builder premise; the buttons already cover this need as
  the floor.
- **Add `@dnd-kit`'s `KeyboardSensor`** — rejected: a redundant second keyboard path
  alongside the button floor, with real focus/announcement cost and no new capability.

## Consequences

- `@dnd-kit` is a load-bearing dependency of the Builder; swapping it later touches every
  Prescription row.
- The button controls are not optional polish — they are the keyboard/SR parity mechanism
  and must survive every future change to the drag layer.
- Drag-time foreshadowing microcopy and `@dnd-kit` `announcements` are two renderings of
  one message and must stay in sync.
