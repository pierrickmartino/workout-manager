# The Exercise Prescription editor is one unified, presentation-only component

Three surfaces independently authored an Exercise Prescription's fields — the
Protocol Builder card, the standalone-Session **Insert** ("Add exercise")
editor, and the **Hand-Authored** session form — each with its own layout,
sharing validation rules but no component. We collapse them onto a single
shared editor that owns **only the field stack** (the frequent inputs, a
collapsible *More* area for the advanced ones, and the read-time
**Prescription Summary**); each surface keeps its own surrounding chrome (the
Builder's drag/reorder/superset/remove controls, Insert's add affordance, the
Hand-Authored list). The editor holds **no domain state of its own** — it edits
a draft prescription the surface owns and renders projections of it — so
"what a prescription editor is" becomes one answer instead of three, and the
Builder card finally gains the typed **Quantity** kind selector the other
surfaces already had.

## The disclosure and its state

The frequent path stays fast — Exercise, Sets, Quantity (kind + target), and an
optional Load — while Tempo, Rest, **Target Effort**, **Set Type**, **Exercise
Note**, and the **Progression Scheme** live behind a collapsed *More* area. A
card whose advanced fields carry non-default values **auto-expands** so nothing
meaningful is hidden on first view, and the **Prescription Summary** stands in
for the hidden fields when collapsed. The open/closed state is deliberately
**ephemeral** — per-card, per-render — and is **not** an **Interface
Preference**: it steers nothing about the plan and nothing worth syncing across
devices, so it stays out of the surface ADR-0047/0055 carved for Mode /
Keep-Screen-Awake / Weight-Unit.

## Boundary: what stays out

**Per-side ("unilateral") prescription is explicitly out of scope.** It has no
term in the domain and no field on an Exercise Prescription; adding one is a new
domain primitive (glossary term, its own ADR, a migration, generator
awareness), not a presentation change, so it is not smuggled in behind a
disclosure drawer. If wanted, it earns its own modelling effort.

## Consequences

- Surfacing **Set Type**, **Target Effort**, and **Exercise Note** in the
  Builder requires the frontend draft and the **Deploy** serializer to carry
  them. They previously did not: the Deploy path read sets/reps/rest/tempo/
  load/superset/scheme only, so editing an AI-generated Protocol's un-performed
  tail **silently stripped** any generated Set Type / Target Effort / Note
  (the backend already accepts all three and defaulted the absent fields to
  null). Round-trip preservation of those fields is therefore a **prerequisite
  correctness fix**, landed and tested before any disclosure UI — independent
  of whether the fields are ever shown.
- The **Prescription Summary** is a read-time projection (no stored column),
  the same species as Tempo's three-state label and the **Scheme Preview**.
