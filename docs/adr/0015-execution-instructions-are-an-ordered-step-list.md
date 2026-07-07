# 0015 — Execution instructions are an ordered step list, not a prose blob

F6's Exercise Detail wants Pulse's numbered execution steps (`01 … 04`). Today a
catalog Exercise's `instructions` is a single free-text `str | None` (models.py),
AI-written in one place (`substitute_generator.py`) and rendered as one
`whitespace-pre-line` paragraph. "Render step-by-step" is therefore not wiring — it
is *deriving* discrete steps from prose. We decided to make the steps **first-class
in the catalog**: `instructions` becomes an ordered `list[str]` (Execution Steps in
CONTEXT.md), the enrichment schema (`GeneratedSubstitute`) and prompt emit an ordered
array, and a migration converts the shared catalog. This touches the *shared global
catalog* (ADR-0002) and is hard to reverse (schema + migration + prompt + repository
signatures + serializer + web type), so it is recorded here.

## Considered options

- **Split prose on newlines at render time (rejected as the *only* mechanism).** Cheap
  and needs no schema change, but leaves the catalog storing prose and re-guessing
  structure on every read. Kept only as the *migration* heuristic (below), not as the
  durable model.
- **Sentence-split on `". "` (rejected).** Fabricates step boundaries the author never
  wrote ("keeping elbows tucked around 45°." becomes its own step). This is the
  ADR-0011-style "no honest basis" trap — the number of steps must equal what was
  authored, never a heuristic chop.
- **Structured `list[str]` in the catalog (chosen).** New enrichment emits genuine
  ordered steps; the shape is honest and reused everywhere.

## Consequences

- **Migration honesty rule.** Existing free-text rows convert by **newline split
  only**: prose with line breaks → one step per non-empty line; prose with no breaks →
  a **single-element list**. No sentence-chopping at backfill time — the same rule that
  governs new content.
- **Render rule.** A single-element list renders as an un-numbered guidance block (never
  a lone "01", which reads as a bug); two or more render as the numbered `01…0N` list.
  The step count is always exactly what the author wrote.
- Existing exercises improve organically: every newly generated/re-enriched substitute
  carries real steps, while legacy single-paragraph rows degrade to one honest block
  until re-enriched. No catalog-wide AI batch is required for this change.
