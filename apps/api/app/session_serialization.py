"""The one canonical JSON shape for an Exercise Prescription.

Both Session reads render each Prescription through :func:`serialize_prescription`:
the plain Session read (``routes/sessions.py``) and the Live Session hydration read
(``live/serialization.py``). Keeping the shape in one place is the fix for a real
regression — the live read hand-rolled its own prescription dict and never grew the
Superset overlay (``superset_group``/``round_rest_seconds``, ADR-0023), so a saved
Superset was silently flattened into solo movements the moment the user Started the
Session (it still displayed on the plan view, which reads the plain shape). With a
single serializer the two reads can never disagree on a Prescription's fields again.

The live read layers its own ``previous_performance`` on top of this base dict; every
other field a Prescription carries lives here.
"""

from __future__ import annotations

from app.domain.session_naming import session_label
from app.repositories.session_repository import PrescriptionView, SessionView


def serialize_prescription(view: PrescriptionView) -> dict:
    """The canonical JSON dict for one Exercise Prescription.

    Carries the plan fields (sets/reps/rest/tempo/typed Load), the typed Prescribed
    Quantity (ADR-0050), the Superset overlay (ADR-0023: the shared group tag and the
    group-owned round-rest, both ``None`` on a solo Prescription), the Pinned rep
    target (ADR-0053), and the joined catalog Exercise. Read paths add their own
    extras (the live read appends ``previous_performance``) around this base.
    """

    return {
        "position": view.position,
        "sets": view.sets,
        "reps": view.reps,
        "rest_seconds": view.rest_seconds,
        "tempo": view.tempo,
        "recommended_load": view.recommended_load,
        # Typed Prescribed Quantity (ADR-0050): the ``{kind, text, ...payload}`` Quantity
        # dict, or null when the prescription carries no typed amount. The web client reads
        # it to render the log input by kind; the free-text ``reps`` renders the plan line.
        "prescribed_quantity": view.prescribed_quantity,
        # Superset overlay (ADR-0023): the shared group tag and group-owned round-rest,
        # both null on a flat, solo Prescription. The live engine partitions on this tag,
        # so dropping it here silently flattens the Superset on Start.
        "superset_group": view.superset_group,
        "round_rest_seconds": view.round_rest_seconds,
        # Pinned rep target (ADR-0053): the user-set range that suspends read-time
        # Progression for this movement, or null when unpinned.
        "pinned_reps": view.pinned_reps,
        "exercise_id": view.exercise_id,
        "exercise_name": view.exercise_name,
        "exercise_description": view.exercise_description,
        "targeted_muscles": view.targeted_muscles,
        "required_equipment": view.required_equipment,
        "provenance": view.provenance,
    }


def serialize_session(view: SessionView) -> dict:
    """The canonical JSON dict for a standalone Session read.

    The one shape the plain Session read (``routes/sessions.py``) and the Redeem read
    (``routes/shares.py``) both return, so a redeemed copy and a freshly-read Session can
    never disagree on their fields. Carries the training parameters, the never-blank
    ``display_name`` (Session Name → derived ``training_type · date`` fallback, issue #394),
    the **Author** credit name (issue #395), the standalone-only markers (``is_protocol_member``
    withholding the Duplicate control, ``is_favorite`` withheld as ``null`` on a Protocol member,
    issue #396), and every Exercise Prescription through :func:`serialize_prescription`.

    The raw Author reference (``author_clerk_user_id``) is deliberately kept server-side —
    the client needs only the credit name, and withholding the id avoids exposing the original
    author's Clerk id to a different owner once Redeem transfers ownership (ADR-0057).
    """

    return {
        "id": view.id,
        "clerk_user_id": view.clerk_user_id,
        "training_type": view.training_type,
        "duration_minutes": view.duration_minutes,
        "has_been_regenerated": view.has_been_regenerated,
        "provenance": view.provenance,
        "name": view.name,
        "display_name": session_label(
            view.name, view.training_type, view.created_at
        ),
        "author": {"display_name": view.author_display_name},
        "is_protocol_member": view.is_protocol_member,
        "is_favorite": None if view.is_protocol_member else view.is_favorite,
        "prescriptions": [serialize_prescription(p) for p in view.prescriptions],
    }


__all__ = ["serialize_prescription", "serialize_session"]
