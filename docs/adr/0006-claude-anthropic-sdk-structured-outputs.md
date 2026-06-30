# 0006 — Pluggable AI generation providers behind a structured-output port

AI generation runs behind a single provider-agnostic port, **`StructuredLLM`**, so the
generation provider is chosen per deployment via environment variables —
**Anthropic, OpenAI, Google (Gemini), or OpenRouter** — without touching generation
logic. The four generators (Session, Program, Session Regeneration, AI Substitute)
share one transport seam: each holds a `StructuredLLM`, builds its own provider-agnostic
prompt + JSON schema, and re-validates the result at its existing `parse_*` boundary.

**The port.** `StructuredLLM.complete(*, system, user, schema, max_tokens) -> str` passes
the Pydantic schema to the provider to *constrain* output and returns the raw JSON text.
It deliberately returns a string, not a parsed object: each generator keeps its own
boundary validation — and the Program generator keeps its full-enumeration check
(weeks × sessions_per_week) — so the "validate at system boundaries" guarantee stays in
exactly one place per generator. A malformed or non-conforming response raises
`GenerationError` everywhere, regardless of provider.

**Provider selection.** A single `build_llm_client(settings) -> StructuredLLM` factory
dispatches on `AI_PROVIDER` and is the only place a concrete SDK client is constructed
(used by both the API DI layer and the RQ worker). It fails fast at startup if the
*selected* provider's API key is missing; other providers' keys may be absent. Each
provider has its own key env var (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
`GOOGLE_API_KEY`, `OPENROUTER_API_KEY`) and a default model, overridable by a single
active `AI_MODEL`:

| `AI_PROVIDER` | SDK | Default model |
|---|---|---|
| `anthropic` | `anthropic` | `claude-opus-4-8` |
| `openai` | `openai` | `gpt-5.5` |
| `google` | `google-genai` | `gemini-3.1-pro` |
| `openrouter` | `openai` (pointed at `https://openrouter.ai/api/v1`) | `openai/gpt-oss-120b:free` |

**Structured-output contract.** Each provider uses its strongest *native* schema
enforcement — Anthropic `output_format`, OpenAI strict `json_schema`, Gemini
`response_schema`, OpenRouter's OpenAI-compatible `response_format` (best-effort, since
enforcement depends on the routed model). The per-generator `parse_*` boundary is the
universal safety net that makes "did the AI return parseable, well-formed data matching
the domain types?" a guarantee rather than a runtime gamble, satisfying the project's
"validate at system boundaries" rule even when a provider's enforcement is best-effort.

**Streaming and reasoning are transport details.** Every provider streams internally and
assembles the final text before returning, preserving the ADR-0005 rationale (a fully
enumerated multi-week Program is a large output; streaming avoids HTTP/SDK timeouts while
the async RQ job runs). Reasoning/thinking is a provider-internal default with no
port-level knob (Anthropic adaptive thinking on; others leave reasoning unset unless the
chosen model needs it), so pointing `AI_MODEL` at a non-reasoning model never breaks.

**Model tiering.** The default models above are the starting point (KISS). Exercise
enrichment (idea doc §5) is the frequent, low-stakes, high-volume call; it may tier down
to a cheaper model as a fast-follow once enrichment volume justifies it — deferred under
YAGNI, not built up front. Tiering is per-call `max_tokens`/model concern and does not
change the port.

## Considered Options

- **Claude (Anthropic) only, via the `anthropic` SDK** — the original decision and the
  deliberate v1 starting point: Claude Opus 4.8 with adaptive thinking and streaming,
  schema-constrained via the SDK. Superseded once the requirement to choose the
  generation source per environment (Anthropic / OpenAI / Google / OpenRouter) arrived;
  the structured-output + boundary-validation discipline carried over unchanged, now
  behind the `StructuredLLM` port.
- **Per-generator provider classes (4 generators × 4 providers = 16 classes)** — rejected:
  the transport is identical across generators, so this duplicates it four ways and
  invites drift. One shared port keeps each provider implemented once.
- **A single OpenAI-compatible client (one `AI_BASE_URL` + key + model) for everything** —
  rejected: simplest env, but loses native Anthropic/Gemini structured-output and
  thinking features and would route even Anthropic through a lossy compatibility layer.
- **Returning a parsed object from the port instead of raw text** — rejected: it would
  split each generator's validation boundary in two (notably the Program enumeration
  check still has to live in the generator), so the port returns `str` and validation
  stays in one place per generator.
- **Free-text generation + hand-parsing** — rejected (unchanged from the original ADR):
  brittle, and a parse failure on a 24-session Program wastes the most expensive AI call
  in the system.
