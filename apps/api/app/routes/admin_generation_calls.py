"""The admin AI audit log: recorded Generation Calls for the operator (ADR-0135).

``GET /api/admin/generation-calls`` lists the most recent metered provider calls, newest
first, inside the 3-day retention window. Optional ``generator_kind``, ``outcome`` and
``clerk_user_id`` filters combine (AND), and the list is paged through ``limit``/``offset``
with envelope ``meta`` (issue #732). An unknown kind or outcome is a ``422``, not an empty
page, so a typo never reads as "nothing happened". Rows carry metadata only (no prompt or output
text), so the list payload stays small. Behind ``require_admin`` (ADR-0046): it fails
closed, because the log holds prompts built from other users' health data. Responses use
the standard envelope.

``GET /api/admin/generation-calls/{call_id}`` reads one call in full (issue #731): both
prompts, the output or the failure's message, the requested schema and the token budget. An
unknown id and one past the retention window are the same ``404``."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth.dependencies import require_admin
from app.envelope import success_envelope
from app.generation.monitoring.call import GenerationOutcome, GeneratorKind
from app.repositories.deps import get_generation_call_repository
from app.repositories.generation_call_repository import (
    GenerationCallDetail,
    GenerationCallFilters,
    GenerationCallRepository,
    GenerationCallSummary,
)

router = APIRouter(prefix="/api", tags=["admin"])

# A page of the log: enough recent calls to match a report, small enough to stay fast.
ADMIN_GENERATION_CALL_DEFAULT_LIMIT = 50
ADMIN_GENERATION_CALL_MAX_LIMIT = 200

HTTP_NOT_FOUND = 404


def _serialize(call: GenerationCallSummary) -> dict:
    return {
        "id": call.id,
        "created_at": call.created_at.isoformat(),
        "generator_kind": call.generator_kind,
        # ``null`` for an unattributed (system) call, e.g. catalog enrichment.
        "clerk_user_id": call.clerk_user_id,
        "provider": call.provider,
        "model": call.model,
        # ``null`` when the provider did not report usage, never a misleading zero.
        "input_tokens": call.input_tokens,
        "output_tokens": call.output_tokens,
        "latency_ms": call.latency_ms,
        "outcome": call.outcome,
    }


def _serialize_detail(call: GenerationCallDetail) -> dict:
    return {
        **_serialize(call.summary),
        "system_prompt": call.system_prompt,
        "user_prompt": call.user_prompt,
        # ``null`` on a failed call, which carries ``error_message`` instead.
        "output_text": call.output_text,
        "error_message": call.error_message,
        # ``null`` only on a row recorded before these were captured.
        "schema_name": call.schema_name,
        "max_tokens": call.max_tokens,
    }


@router.get("/admin/generation-calls")
def list_generation_calls(
    generator_kind: GeneratorKind | None = Query(default=None),
    outcome: GenerationOutcome | None = Query(default=None),
    clerk_user_id: str | None = Query(default=None, min_length=1),
    limit: int = Query(
        default=ADMIN_GENERATION_CALL_DEFAULT_LIMIT,
        ge=1,
        le=ADMIN_GENERATION_CALL_MAX_LIMIT,
    ),
    offset: int = Query(default=0, ge=0),
    _operator: str = Depends(require_admin),
    calls: GenerationCallRepository = Depends(get_generation_call_repository),
) -> dict:
    """One filtered page of the newest recorded Generation Calls, operator-only (ADR-0135)."""

    filters = GenerationCallFilters(
        generator_kind=generator_kind, outcome=outcome, clerk_user_id=clerk_user_id
    )
    page = calls.list_recent(filters=filters, limit=limit, offset=offset)
    return success_envelope(
        [_serialize(call) for call in page.items],
        meta={"total": page.total, "limit": limit, "offset": offset},
    )


@router.get("/admin/generation-calls/{call_id}")
def get_generation_call(
    call_id: int,
    _operator: str = Depends(require_admin),
    calls: GenerationCallRepository = Depends(get_generation_call_repository),
) -> dict:
    """One recorded Generation Call in full, operator-only (issue #731, ADR-0135)."""

    detail = calls.get_recent(call_id)
    if detail is None:
        raise HTTPException(
            status_code=HTTP_NOT_FOUND, detail="Generation call not found"
        )
    return success_envelope(_serialize_detail(detail))
