"""Degrade-to-flat: the generation remedy for an invalid Superset (ADR-0023).

The generation parse boundary is *passive* — no human is watching — so an invalid
generated Superset must never cost the user the whole request. Where DEPLOY
hard-rejects a bad grouping (a human fixes it), generation **degrades-to-flat**:
the offending group is ungrouped (its Prescriptions are kept, the group tag and
round-rest are dropped) and the generation is accepted.

Both remedies read the *same* shared Superset validator (``validate_supersets``),
so "what a valid Superset is" has one definition; only the reaction differs.

These helpers are pure and immutable: valid groups pass through untouched and only
an offending member is copied (with its grouping cleared), so the input models are
never mutated. This slice keeps the validator's safety flag at its permissive
default — Sensitive-Constraint suppression of generated Supersets is a later slice.
"""

from __future__ import annotations

from collections.abc import Sequence

from app.domain.superset import SupersetMember, validate_supersets
from app.generation.schema import (
    GeneratedExercisePrescription,
    GeneratedProtocol,
    GeneratedSession,
)


def _offending_groups(
    prescriptions: Sequence[GeneratedExercisePrescription],
) -> set[str]:
    """The group tags with any structural Superset violation (validator-defined)."""

    members = [
        SupersetMember(
            position=position,
            superset_group=prescription.superset_group,
            sets=prescription.sets,
            round_rest_seconds=prescription.round_rest_seconds,
        )
        for position, prescription in enumerate(prescriptions)
    ]
    return {violation.group for violation in validate_supersets(members)}


def degrade_prescriptions_to_flat(
    prescriptions: Sequence[GeneratedExercisePrescription],
) -> list[GeneratedExercisePrescription]:
    """Ungroup every invalid Superset in ``prescriptions``, keeping the Prescriptions.

    Returns a new list: a member of a valid group (or a solo) passes through
    unchanged, while a member of an offending group is copied with its
    ``superset_group`` and ``round_rest_seconds`` cleared. An all-valid input
    round-trips its groups intact.
    """

    offending = _offending_groups(prescriptions)
    if not offending:
        return list(prescriptions)
    return [
        (
            prescription.model_copy(
                update={"superset_group": None, "round_rest_seconds": None}
            )
            if prescription.superset_group in offending
            else prescription
        )
        for prescription in prescriptions
    ]


def degrade_session_to_flat(session: GeneratedSession) -> GeneratedSession:
    """Return ``session`` with any invalid generated Superset degraded to flat."""

    return session.model_copy(
        update={"prescriptions": degrade_prescriptions_to_flat(session.prescriptions)}
    )


def degrade_protocol_to_flat(protocol: GeneratedProtocol) -> GeneratedProtocol:
    """Return ``protocol`` with every Session's invalid Supersets degraded to flat."""

    degraded_sessions = [
        session.model_copy(
            update={
                "prescriptions": degrade_prescriptions_to_flat(session.prescriptions)
            }
        )
        for session in protocol.sessions
    ]
    return protocol.model_copy(update={"sessions": degraded_sessions})


__all__ = [
    "degrade_prescriptions_to_flat",
    "degrade_session_to_flat",
    "degrade_protocol_to_flat",
]
