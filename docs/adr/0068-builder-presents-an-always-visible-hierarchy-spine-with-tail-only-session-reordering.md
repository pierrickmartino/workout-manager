# The Protocol Builder presents an always-visible hierarchy spine with tail-only Session reordering

The plan-editing surfaces render the domain's hierarchy —
**Protocol → Week → Session → Superset-or-solo → Exercise Prescription** — as
a **stable, always-visible spine** where every level carries a clear label, and
(where movement is legal) a drag handle, an action menu, and a tail insertion
point. Exercise **identity** (the Catalog **Exercise**) is held visually apart
from the mutable prescription **fields** (Sets, Quantity, Load, Rest, Tempo,
Target Effort, Set Type, Note, Scheme). The one genuinely new capability is a
**tail-only Session reorder** (`MOVE_SESSION`); everything else is a
presentation reshape over the existing model. Standalone Sessions render the
same spine minus the Protocol/Week levels, reusing the unified Prescription
editor (ADR-0067). Record surfaces (Live/Log/History) are untouched.

## Master–detail spine, not a full tree

"Keep the hierarchy visible" is satisfied by an always-visible **Protocol → Week
→ Session** spine plus **one open Session** showing the Superset → Prescription
depth — deliberately *not* a fully-expanded tree. A Protocol can be up to
**52 weeks × 14 Sessions/week**; rendering every level at once neither scans nor
scales, and it fights the un-performed-tail model (ADR-0020) by giving settled
record the same visual weight as editable plan. The master–detail shape keeps
the spine legible while the deep per-exercise fields stay scoped to the Session
the user is actually editing.

## Handles tell the truth about movement

A drag handle means "this reorders." It therefore appears **only** where
reordering is legal and meaningful:

- **Exercise Prescription** and **Superset** — reorder within a Session (already
  modeled: `REORDER_PRESCRIPTION`, `GROUP_WITH_NEXT`, `UNGROUP`, drag via
  `RESOLVE_DROP`).
- **Session** — the new **tail-only** `MOVE_SESSION`: a Session may be reordered
  within its Week and **across Week boundaries**, always within the un-performed
  tail, re-enumerating positions per ADR-0020. A **performed** Session is the
  frozen prefix and never gets a handle.
- **Week** and **Protocol** — **no handle.** A Week is an ordinal position;
  "moving Week 3 above Week 2" *is* moving its Sessions, already expressed at the
  Session level. The Protocol is the root.

Every handle ships with its keyboard/button equivalent — ADR-0027 makes the
button/keyboard controls the accessibility **floor** and drag an enhancement, so
`MOVE_SESSION` is also surfaced as move up/down/across in the Session's action
menu.

## Insertion is append; placement is drag

The model is **append-only** (`ADD_SESSION`, `ADD_PRESCRIPTION`; ADR-0051's
Insert appends at the end), and the frozen prefix forbids any insertion. So each
un-performed container carries a single **"Add" affordance at its tail** (Add
Prescription · Add Session to Week · Add Week); free placement is then achieved
by add-then-drag. We deliberately do **not** invent a between-sibling
"insert-at-index" operation — it has no backing in the model and cannot appear in
the frozen prefix anyway.

## The frozen prefix stays visible but settled

Performed Sessions render as a **read-only, locked, collapsed-by-default** band
("N performed Sessions") with no handle, no menu, and no insertion point. This
honors "keep the hierarchy visible" without letting a long history bury the
editable tail, and it never re-renders settled record as mutable (ADR-0020).

## Boundary: what stays out

- **No "Section" primitive.** The domain has exactly one intra-Session grouping —
  the **Superset**, a round-based rest overlay (ADR-0023). A larger "Section"
  block (Warm-up / Main / Accessories) grouping supersets would be a new domain
  primitive — a glossary term, its own ADR, a migration, and generator
  awareness — not a presentation change, and a purely-cosmetic band would collide
  visually with the real Superset. It is not smuggled in behind this UI work; if
  wanted, it earns its own modelling effort (the same posture ADR-0067 took on
  unilateral prescription).
- **No per-set plan variation.** An Exercise Prescription describes **N uniform
  sets**; per-set variation exists only on the *record* (Logged Sets). A
  per-set-editable plan level is likewise a new primitive, out of scope here.
  The visible hierarchy bottoms out at the Exercise Prescription; "set
  prescription" is its field block, not a nested level.

## Consequences

- Adds one plan operation, **`MOVE_SESSION`** (tail-only), which the **Deploy**
  serializer and validator must carry alongside the existing tail reshapes; the
  performed prefix still passes through byte-for-byte and Sessions re-enumerate
  into contiguous positions after it (ADR-0020/0021). `CONTEXT.md`'s **Deploy**
  entry is extended to name reordered Sessions among those reshapes; no new
  glossary term is introduced.
- The always-visible spine treatment applies to **all plan-editing surfaces**
  (the Protocol Builder and the standalone Insert / Hand-Authored editors),
  reusing the ADR-0067 unified, presentation-only Prescription editor; the spine
  differs only in depth (standalone Sessions have no Protocol/Week levels).
- The Prescription card's Exercise header is the stable anchor that carries the
  drag handle and action menu (Swap exercise, Set scheme, Remove) and links to
  Exercise Detail; the field stack sits clearly below it — the Exercise ↔
  Exercise Prescription distinction made visual.
