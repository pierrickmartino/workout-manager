# 0006 — Claude via the Anthropic SDK with schema-constrained structured outputs

AI generation uses **Claude (Anthropic)** through the official `anthropic` Python SDK on the FastAPI backend. The default generation model is **Claude Opus 4.8** (`claude-opus-4-8`) with adaptive thinking enabled and streaming. Streaming pairs with the async RQ job from ADR 0005: a fully-enumerated multi-week Program is a large output, and streaming avoids HTTP timeouts while the job runs.

**Model tiering.** Opus 4.8 is used everywhere to start (KISS). Exercise enrichment (idea doc §5) is the frequent, low-stakes, high-volume call; it may move to **Haiku 4.5** (`claude-haiku-4-5`, materially cheaper) as a fast-follow once enrichment volume justifies the added moving part — deferred under YAGNI, not built up front.

**Structured-output contract.** All generation is constrained to **strict JSON schemas** (Pydantic models + `output_config.format` / `messages.parse()`) that map directly to the domain types: Program → Session → Exercise Prescription, and the catalog Exercise shape. The model is *constrained* to emit valid JSON matching these schemas, which is then validated at the boundary. This is the seam where the AI layer meets the domain model; making it schema-enforced turns "did the AI return parseable, well-formed data?" from a runtime gamble into a guarantee, and satisfies the project's "validate at system boundaries" rule.

## Considered Options

- **Free-text generation + hand-parsing** — rejected: brittle, and a parse failure on a 24-session Program wastes the most expensive AI call in the system.
- **Opus 4.8 for every call including enrichment** — acceptable and the starting point, but enrichment is the right place to tier down to Haiku later given §6's cost goal.
