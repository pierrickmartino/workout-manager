# Composition strip prototype — decision

**Status:** Decided · variant **A ("Role bands")** selected. Not yet implemented.

## The question this prototype settled

_What should the workout builder's "composition strip" look like_ — the compact
strip above the editable exercises (creative-directions idea 5, screen 05) that shows
warm-up / main work / accessories / cooldown roles, one labeled tile per exercise,
brackets superset pairs with a single shared round instruction, and focuses an
exercise's editable prescription when its tile is selected?

Three structurally different layouts were built and compared side by side on a real
mobile render (390px, dark):

| Variant | Structure | Editing model |
| --- | --- | --- |
| **A — Role bands** | Four full-width, colour-coded role sections stacked down the page | Editor **expands inline** under the selected exercise's band |
| B — Timeline bar | One proportional role ribbon + a horizontal, scrollable tile track | Fixed **detail pane** below the strip |
| C — Split navigator | Persistent navigator with collapsible role groups | Editor **pinned** (beside on desktop, stacked on mobile) |

## Verdict

**A wins.** Roles read as first-class sections top-to-bottom, the whole workout's
shape is legible before opening any field, and the inline editor keeps focus in the
exercise's own context. Superset pairs render as a bracketed sub-card carrying one
shared round-rest instruction.

## Where the winner lives

- Full variant set (the primary source): this branch, `apps/web/components/prototype/`
  + the throwaway route `app/sessions/build/composition-prototype/`.
- Winning layout to port from: `composition-variant-a.tsx` (+ `composition-data.ts`
  for the role/superset/render-item helpers, `prescription-editor-card.tsx` for the
  focused editor).

## Not done yet (deliberately)

Implementation into the real builder was **not** started — the decision is captured
here so the roles work can be planned properly first. Two things the real feature
must resolve, both flagged in the creative-directions effort note:

1. **Roles are new data.** `warm-up / main / accessories / cooldown` are stubbed in
   `composition-data.ts`; the real model carries no role on a Prescription. Deciding
   how a role is assigned (stored field vs. derived, who sets it, generator support)
   is product + domain work — likely a `CONTEXT.md` term and an ADR. The effort note's
   guidance: _start with ordered exercises only_ (one implicit group) until roles land.
2. **Reuse the real seams, not the stubs.** The production strip must drive the
   builder reducer (`lib/protocol-builder.ts`) — tiles select a Prescription, superset
   brackets read `supersetLayout` / the group round-rest — and reuse `@dnd-kit` for
   reordering rather than the prototype's read-mostly local state.

When that work starts, fold A into the real builder and delete the whole
`prototype/composition-*` set + the throwaway route (main keeps only the shipped
feature; the prototype stays here on the branch as the primary source).
