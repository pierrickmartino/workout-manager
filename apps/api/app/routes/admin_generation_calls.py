"""The admin AI audit log: recorded Generation Calls for the operator (ADR-0135).

``GET /api/admin/generation-calls`` lists the most recent metered provider calls, newest
first, inside the 3-day retention window. Rows carry metadata only (no prompt or output
text), so the list payload stays small. Behind ``require_admin`` (ADR-0046): it fails
closed, because the log holds prompts built from other users' health data. Responses use
the standard envelope.

``GET /api/admin/generation-calls/{call_id}`` reads one call in full (issue #731): both
prompts, the output or the failure's message, the requested schema and the token budget. An
unknown id and one past the retention window are the same ``404``."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.auth.dependencies import require_admin
from app.envelope import success_envelope
from app.repositories.deps import get_generation_call_repository
from app.repositories.generation_call_repository import (
    GenerationCallDetail,
    GenerationCallRepository,
    GenerationCallSummary,
)

router = APIRouter(prefix="/api", tags=["admin"])

# The first page of the log: enough recent calls to match a report, small enough to stay
# fast. Filtering and paging arrive with the next slice of the audit log.
ADMIN_GENERATION_CALL_LIMIT = 50

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
    _operator: str = Depends(require_admin),
    calls: GenerationCallRepository = Depends(get_generation_call_repository),
) -> dict:
    """The newest recorded Generation Calls, operator-only (ADR-0135)."""

    recent = calls.list_recent(limit=ADMIN_GENERATION_CALL_LIMIT)
    return success_envelope([_serialize(call) for call in recent])


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
