# 0050 — The plan side gains a typed Prescribed Quantity

ADR-0032 typed the *record's* quantity axis (`LoggedSet.quantity`) but explicitly
left the *plan* side — `ExercisePrescription.reps` — free text, deferring
"typing the plan side" to "a separate future feature." This ADR is that feature:
**`ExercisePrescription` gains a typed prescribed `Quantity`**, the same value
object ADR-0032 built, so the plan and the record finally speak one shape.

**Why now: prescribed cardio was unloggable through its own plan.** A generated or
hand-authored running prescription is stored as `reps = "7 KM"`. Reusing/logging it
lands on the static log form (ADR-0045), whose reps input is numeric — "7 KM"
cannot be entered, so it shows only as a grey placeholder; the Load block is forced
to a nonsense `bodyweight / 70`; and the only escape is to abandon the plan and
re-enter the run through the plan-less hand-authored path (ADR-0031/0040). The
axis the domain calls **Quantity** (`CONTEXT.md`: "how much a set *prescribes or
records*") was typed on only one of the two sides that definition names.

**Decision.**

- `ExercisePrescription` carries a typed prescribed `Quantity` — `kind` ∈
  `repetitions` / `distance` / `duration`, canonical value (`count` / `metres` /
  `seconds`), and verbatim `text` — reusing `app/domain/quantity.py` unchanged, not
  a kind-only flag beside a still-free-text value.
- **The kind is fixed at each plan write boundary, never re-guessed at read time.**
  The generation schema *emits* kind+value directly (a text-inference fallback runs
  only for a malformed generation), the Hand-Authored builder persists the Quantity
  kind it already collects — closing the drop where that builder threw the kind away
  on save — and a one-time Alembic backfill parses every existing free-text
  prescription once.
- The static log form reads the kind and renders the matching input (distance +
  optional companion time, a hold time, or reps). A `distance`/`duration` set
  **carries no Load by default** — Load is the orthogonal "how hard" axis, absent on
  a plain run — and offers an **optional** companion time on a `distance` set,
  feeding the pace projection ADR-0032/0049 already defined. Completion Outcome is
  unchanged (ADR-0013): a set is Completed when *attempted*, so a run needs only its
  one row marked Done, its kilometres irrelevant to the outcome.

**This does not violate ADR-0032's "no plan→record bridge."** That rule forbids the
*client* parsing a prescription's `"5 km"` into a Quantity at read time — re-guessing
outside a write boundary. Here the typing happens *at* the plan's write boundaries
(generation, builder) plus a one-time server backfill — the same "type once at the
boundary, backfill once" shape ADR-0010/0032 used for Load and for the record-side
quantity migration. The bridge is built at the write boundary, not sniffed on read.

## Considered options

- **Keep the plan free text; infer the kind in the log form at read time** —
  rejected: the client re-guessing a prescription's prose is exactly what ADR-0032
  forbade, and sniffing "7 km" / "30 min" / "5 × 3 min" out of free text is fragile.
  Type it at the write boundary instead.
- **Kind only on the prescription; leave the value free text** — rejected: it just
  relocates the parse into the log-form seed (the form would still have to pull "7"
  out of "7 km" to seed a distance input). If the plan is typed, type the value too.
- **New prescriptions only; leave existing ones reps-only** — rejected: the reported
  dead end would persist for every running Protocol already generated. A one-time
  backfill fixes existing plans the change ships against, not just future ones.

## Consequences

- The generation cache key, prompt, and `parse_*` boundary now carry a prescribed
  Quantity. `progression.py` over a `distance`/`duration` prescription is **out of
  scope** here — it steps reps/load and is left unchanged for cardio.
- Terminology: the Hand-Authored builder's **"Amount"** label is corrected to
  **"Quantity"** (`CONTEXT.md` lists "amount" under the term's _Avoid_), and the
  terminology guard gains a tripwire once the label is fixed.
- The set-count-metric distortion ADR-0032 left standing (`6 × 800 m` over-weighting
  Legs and over-earning XP versus one 10 km set) is untouched by this ADR.
