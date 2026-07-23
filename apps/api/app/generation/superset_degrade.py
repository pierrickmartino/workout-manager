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
never mutated. They also carry ``has_sensitive_constraint`` into the shared
validator: for a Sensitive-Constraint user *every* group is forbidden (ADR-0023),
so a stray generated Superset that slips past the prompt is degraded to flat — the
passive twin of the DEPLOY hard-reject.
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
    has_sensitive_constraint: bool,
) -> set[str]:
    """The group tags with any Superset violation (validator-defined). Under a
    Sensitive Constraint every group is forbidden, so all of them offend."""

    members = [
        SupersetMember(
            position=position,
            superset_group=prescription.superset_group,
            sets=prescription.sets,
            round_rest_seconds=prescription.round_rest_seconds,
        )
        for position, prescription in enumerate(prescriptions)
    ]
    return {
        violation.group
        for violation in validate_supersets(
            members, has_sensitive_constraint=has_sensitive_constraint
        )
    }


def degrade_prescriptions_to_flat(
    prescriptions: Sequence[GeneratedExercisePrescription],
    *,
    has_sensitive_constraint: bool = False,
) -> list[GeneratedExercisePrescription]:
    """Ungroup every invalid Superset in ``prescriptions``, keeping the Prescriptions.

    Returns a new list: a member of a valid group (or a solo) passes through
    unchanged, while a member of an offending group is copied with its
    ``superset_group`` and ``round_rest_seconds`` cleared. An all-valid input
    round-trips its groups intact — unless ``has_sensitive_constraint`` is set, in
    which case every group is forbidden (ADR-0023) and flattened.
    """

    offending = _offending_groups(prescriptions, has_sensitive_constraint)
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


def degrade_session_to_flat(
    session: GeneratedSession, *, has_sensitive_constraint: bool = False
) -> GeneratedSession:
    """Return ``session`` with any invalid generated Superset degraded to flat (and,
    under a Sensitive Constraint, every Superset flattened)."""

    return session.model_copy(
        update={
            "prescriptions": degrade_prescriptions_to_flat(
                session.prescriptions,
                has_sensitive_constraint=has_sensitive_constraint,
            )
        }
    )


def flatten_session_supersets(session: GeneratedSession) -> GeneratedSession:
    """Return ``session`` with *every* Superset overlay cleared — unconditionally.

    Distinct from :func:`degrade_session_to_flat`, which keeps valid groups and only
    ungroups the offending ones: this forces the whole Session flat. Regeneration
    uses it because Regeneration produces flat replacement Prescriptions in v1 — it
    is not Superset-aware (CONTEXT.md §Regeneration, ADR-0023). That path neither
    validates grouping nor tells the model the kept prescriptions' group tags, and
    the regenerate splice appends replacements without re-namespacing, so any group
    the model volunteers could persist invalid or collide with a kept group; forcing
    flat is the honest, safe remedy. Pure and immutable — a copy per member.
    """

    return session.model_copy(
        update={
            "prescriptions": [
                prescription.model_copy(
                    update={"superset_group": None, "round_rest_seconds": None}
                )
                for prescription in session.prescriptions
            ]
        }
    )


def degrade_protocol_to_flat(
    protocol: GeneratedProtocol, *, has_sensitive_constraint: bool = False
) -> GeneratedProtocol:
    """Return ``protocol`` with every Session's invalid Supersets degraded to flat
    (and, under a Sensitive Constraint, every Superset flattened)."""

    degraded_sessions = [
        session.model_copy(
            update={
                "prescriptions": degrade_prescriptions_to_flat(
                    session.prescriptions,
                    has_sensitive_constraint=has_sensitive_constraint,
                )
            }
        )
        for session in protocol.sessions
    ]
    return protocol.model_copy(update={"sessions": degraded_sessions})


__all__ = [
    "degrade_prescriptions_to_flat",
    "degrade_session_to_flat",
    "degrade_protocol_to_flat",
    "flatten_session_supersets",
]
