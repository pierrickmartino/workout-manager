"""What the Substitution routes share at the HTTP boundary (ADR-0143).

``AvailableEquipmentBody`` is the Available Equipment a Substitution, an Equipment
Substitution preview or an apply states for this one action: omitted, the Default Equipment
applies; an explicit empty list is bodyweight only (ADR-0038); each value must be a curated
Equipment token (ADR-0077), else ``422``. ``performed_session_conflict`` is the one ``409``
every Substitution write answers on a performed Protocol Session (ADR-0020)."""

from __future__ import annotations

from fastapi import HTTPException, status
from pydantic import BaseModel

from app.domain.equipment import Equipment

PERFORMED_PROTOCOL_SESSION_DETAIL = "A performed Protocol Session can’t be changed."


class AvailableEquipmentBody(BaseModel):
    """The equipment the user has for this action; omitted inherits the Default Equipment."""

    available_equipment: list[Equipment] | None = None

    def equipment_values(self) -> list[str] | None:
        if self.available_equipment is None:
            return None
        return [item.value for item in self.available_equipment]


def performed_session_conflict() -> HTTPException:
    """The ``409`` for a Substitution write on a performed Protocol Session."""

    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail=PERFORMED_PROTOCOL_SESSION_DETAIL,
    )


__all__ = [
    "PERFORMED_PROTOCOL_SESSION_DETAIL",
    "AvailableEquipmentBody",
    "performed_session_conflict",
]
