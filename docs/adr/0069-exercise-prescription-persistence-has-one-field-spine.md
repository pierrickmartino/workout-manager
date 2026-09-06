# Exercise Prescription persistence has one field spine

The fields of an Exercise Prescription — the catalog reference, sets, reps, rest,
tempo, typed Load, typed Prescribed Quantity, the Superset overlay, Progression
Scheme, Set Type, Target Effort, and the Exercise Note — were hand-enumerated
across ~17 backend sites: the draft/view DTOs, both repository adapters' ORM
builds, the Deploy path, the generation map, and the JSON serializers. Adding one
field was shotgun surgery, and a single omission silently dropped it — the class
of bug that once flattened a saved Superset on Start when a hand-rolled read dict
never grew `superset_group`/`round_rest_seconds` (ADR-0023). We made
`PrescriptionDraft` the single declaration of that **spine** and route every
persistence mapping through generic field-iteration helpers in
`repositories/prescription_mapping.py` (`row_from_draft`, `draft_from_row`,
`evolve_prescription_row`, `view_from_row`), so adding a field is a one-line
change to the dataclass and the copy-with-one-change rebuilds (Substitution,
scheme selection) can no longer drop a field by construction. This is the
server-side cousin of ADR-0067 (the unified, presentation-only Prescription
*editor* on the frontend).

## Considered Options

We rejected the **maximal** version — one manifest generating everything,
including the ORM columns, the LLM output schema, the wire request DTO, and the
JSON responses. Three boundaries are deliberately left out of the spine and keep
their own explicit field lists:

- the **LLM output schema** (`generation/schema.py`) is a trust boundary
  (ADR-0006) whose field names and validation are the model contract, not a
  storage concern — the generation map translates its 9 AI-authored fields onto
  the spine explicitly, across a rename;
- the **wire DTO** (`routes/sessions.py`) validates and parses raw client input
  into typed dicts, which must stay at the boundary;
- the two **JSON projections** (`session_serialization.serialize_prescription`
  and `export/serializer`) differ on purpose — one denormalizes the catalog join,
  the other references the catalog by id — so they stay explicit dicts.

Coupling any of these to the storage spine would trade a clear dedup win for
cross-layer coupling. Instead, a completeness guard
(`tests/test_prescription_spine.py`) — not code generation — keeps them honest:
it asserts the AI/user authorship partition covers the whole spine, that both
projections carry every spine field, and that a value round-trips through create,
Duplicate, Redeem, Regeneration, and a Protocol create + Deploy. The explicit
"these boundaries stay out" is the load-bearing decision here: it stops a future
change from "finishing the job" by routing the model schema or wire DTO through
the manifest.

## Consequences

Adding an Exercise Prescription field means adding it to `PrescriptionDraft` (and
its ORM column) and deciding its authorship partition; the guard test fails if a
projection or the partition forgets it. `CONTEXT.md` is unchanged — the "field
spine / manifest" is implementation, not domain vocabulary, and the Exercise
Prescription term's meaning is unaffected.
