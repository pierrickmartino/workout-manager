# Session composition is a read-time Section projection, not a stored role

The Builder is being reshaped into a **composition tool**: above the editable
Prescriptions, a strip groups a Session into the parts of its arc — **warm-up, main work,
accessories, cooldown** — so a user understands a workout's shape and its grouping before
inspecting every field (creative-directions idea 5, "Give the builder a visible workout
composition"). That requires the app to answer, for each Exercise Prescription, *which
part of the workout it belongs to*.

We model that answer — the **Session Section** — as a **read-time projection** over what
the plan already carries, computed by the pure
`app.domain.session_section.sectionize`, and **not** as a new stored field on the
Exercise Prescription. It is the same species as **Movement Pattern** (ADR-0072), the
**Muscle Group** roll-up, **Catalog Completeness**, the **Tempo** three-state label, and
the **Scheme Preview**: classified from existing signals, never persisted, never an AI
call per read, re-derived for free whenever the plan is edited.

The signals, in strength order: an explicit **warm-up Set Type** (ADR-0065) or the leading
run of mobility/prep/cardio movements → **Warm-up**; the trailing run of stretch/breathing
(or timed-cardio) movements → **Cooldown**; the first three **compound** movements of the
remaining work block → **Main work**; everything else (isolation, or compound movements
past the cap) → **Accessory**. Because Warm-up is only ever a leading run and Cooldown only
a trailing run, the four sections land as **contiguous bands** in Session order, which is
exactly how the composition strip reads them. A movement no rule confidently claims falls
to **Accessory**, the neutral supporting-work bucket — the honesty of leaving an unmapped
muscle **Unclassified** rather than forcing a guess.

## Considered options

- **A stored `section` field on the Exercise Prescription spine** (ADR-0069) — the AI
  authors it, the user hand-edits it, it rides through copies. Rejected for v1: it cuts
  against this codebase's load-bearing invariant ("read-time projections, never stored
  ledgers"), adds an Alembic migration and generator/schema/spine-guard work, and buys
  little the projection does not — the four sections are largely a function of Set Type,
  movement family, and position, which we already hold. A stored **override** can be added
  additively later (see Consequences) if the projection proves too coarse in practice,
  without a redo.
- **Reusing Movement Pattern as the section** — rejected: Movement Pattern classifies one
  Exercise *in isolation* (a Bench Press is always Push), whereas a Section depends on a
  Prescription's *place in its Session* (the same Bench Press is main work early and an
  accessory late). They are orthogonal axes; Section reads position, Movement Pattern does
  not.
- **A calendar/phase concept** (mesocycle "phases") — rejected: the app is self-paced and
  calendar-free (ADR-0001), and "phase" already names a Tempo concept. Section is a
  within-one-Session composition axis, nothing periodized.

## Consequences

- **No data-model change and no migration.** `sectionize` is pure `app.domain`; it adds no
  column, no write hook, no cache key. Existing plans gain sections on their next read.
- **Section is surfaced on both plan reads** — the standalone-Session serializer and the
  Protocol-Session serializer thread the projected value onto each Prescription dict (a
  discovery/authoring signal, `null` on the Live read, which renders one Prescription
  without Session context). The Builder, which edits a client-side draft, re-derives
  sections client-side from the same rules as it edits.
- **It is a heuristic, and honestly labelled as one.** The cap of three main-work
  movements and the leading/trailing-run rules will occasionally mis-section an unusual
  plan (a cardio-only session, a fourth main lift). Because the user cannot yet hand-correct
  a section, the escape hatch is deliberate future work: an **optional stored override** on
  top of the projection (the established "projection + user override" shape), added only
  if real use shows the projection is too coarse.
- **Section feeds nothing load-bearing.** Like Movement Pattern, it is a
  discovery/authoring axis only — never a generation input, cache key, Progression signal,
  or advancement gate — so a mis-section can never move a number or change a plan the AI
  conditions on.
- **A new domain term, "Session Section," enters `CONTEXT.md`,** disambiguated from the
  audience **Role** axis (ADR-0071) whose name it deliberately does not reuse.
