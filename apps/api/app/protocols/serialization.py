"""JSON serialization for the self-paced Protocol progress view.

Turns the ``ProtocolProgressView`` (and its nested Sessions/Prescriptions) into the
plain-``dict`` shape the PWA consumes. Shared by every route that returns a
progressed Protocol — ``GET /api/protocols/{id}`` and the aggregated ``GET
/api/home`` — so the Current Protocol on Home and a directly-opened Protocol carry
byte-for-byte the same payload."""

from __future__ import annotations

from collections.abc import Mapping
from types import MappingProxyType

from app.domain.calibration import MAX_CALIBRATION, MIN_CALIBRATION
from app.domain.curated_lineage import lineage_dict
from app.domain.protocol import protocol_label
from app.domain.session_section import sectionize
from app.protocols.balance_preview import BalancePreview
from app.protocols.index import ProtocolIndexRow
from app.protocols.progress import ProtocolProgressView
from app.repositories.protocol_repository import ProtocolSessionView, ProtocolView
from app.session_serialization import serialize_prescription


def serialize_session(
    session: ProtocolSessionView,
    *,
    performed: bool = False,
    logged_session_id: int | None = None,
    protocol_training_type: str | None = None,
    protocol_duration_minutes: int | None = None,
) -> dict:
    # Session Section (ADR-0074): the read-time composition bucket is a projection over
    # the *ordered* Session, computed once here and zipped onto each Prescription. Never
    # stored; re-derived per read (and re-derived client-side as the Builder edits).
    sections = sectionize(session.prescriptions)
    return {
        "session_id": session.session_id,
        "position": session.position,
        "week": session.week,
        "day": session.day,
        "title": session.title,
        # The Session's own Training Type and duration (#707), which may differ from its
        # Protocol's, so the Builder shows — and re-deploys — what each Session really is.
        # A view built without a row has neither, and reads as its Protocol's.
        "training_type": session.training_type or protocol_training_type,
        "duration_minutes": session.duration_minutes or protocol_duration_minutes,
        "performed": performed,
        # The record link (Q7, plan≠record): the id of the Logged Session that advanced
        # this Session, so a performed schedule card opens the *record* the user made,
        # not the plan. Null on an un-performed Session (and on the next_session, which is
        # un-performed by definition).
        "logged_session_id": logged_session_id,
        # Each Prescription renders through the one API projection, so a Protocol member
        # and a standalone Session can never disagree on a Prescription's fields (ADR-0069).
        "prescriptions": [
            serialize_prescription(p, section=section.value)
            for p, section in zip(session.prescriptions, sections)
        ],
    }


def serialize_protocol(
    view: ProtocolView,
    *,
    performed_session_ids: frozenset[int] = frozenset(),
    performed_log_ids: Mapping[int, int] = MappingProxyType({}),
) -> dict:
    return {
        "id": view.id,
        "clerk_user_id": view.clerk_user_id,
        "training_type": view.training_type,
        "objective": view.objective,
        "sessions_per_week": view.sessions_per_week,
        "weeks": view.weeks,
        "duration_minutes": view.duration_minutes,
        # The user-editable name (nullable) plus the resolved display label — the
        # name when set, else the derived ``objective · training_type`` (ADR-0021),
        # so an unnamed adopted Protocol reads sensibly with no backfill.
        "name": view.name,
        "label": protocol_label(view.name, view.objective, view.training_type),
        # The standing Calibration (ADR-0111): the user's relative offset from the plan's
        # authored values, emitted as a plain integer with ``None`` normalized to 0 — "as
        # authored" — so a client never has to decide what an absent offset means. The
        # bounds travel with it so the control can go inert at the rail without hard-coding
        # the clamp, which the server owns.
        "calibration": view.calibration or 0,
        "calibration_min": MIN_CALIBRATION,
        "calibration_max": MAX_CALIBRATION,
        # Curated lineage (ADR-0130, #688): the Curated Protocol this copy was adopted from
        # ({identifier, version, name}) — the web's "Based on <name>" — or null.
        "curated_lineage": lineage_dict(view.curated_lineage),
        "sessions": [
            serialize_session(
                s,
                performed=s.session_id in performed_session_ids,
                logged_session_id=performed_log_ids.get(s.session_id),
                protocol_training_type=view.training_type,
                protocol_duration_minutes=view.duration_minutes,
            )
            for s in view.sessions
        ],
    }


def serialize_protocol_progress(progress: ProtocolProgressView) -> dict:
    performed = progress.performed_session_ids
    performed_log_ids = progress.performed_log_ids
    data = serialize_protocol(
        progress.protocol,
        performed_session_ids=performed,
        performed_log_ids=performed_log_ids,
    )
    data["completed_count"] = progress.completed_count
    data["next_session"] = (
        serialize_session(
            progress.next_session,
            performed=progress.next_session.session_id in performed,
            logged_session_id=performed_log_ids.get(progress.next_session.session_id),
            protocol_training_type=progress.protocol.training_type,
            protocol_duration_minutes=progress.protocol.duration_minutes,
        )
        if progress.next_session is not None
        else None
    )
    return data


def serialize_protocol_index_row(row: ProtocolIndexRow) -> dict:
    """One Protocols-index row (#637): the plan's label and its read-time standing, and
    whether it may be deleted (#639).

    ``made_current_at`` travels only so the client can order set-aside rows (ADR-0125);
    it is never shown — the app is calendar-free (ADR-0001)."""

    protocol = row.protocol
    return {
        "id": protocol.id,
        "name": protocol.name,
        "label": protocol_label(protocol.name, protocol.objective, protocol.training_type),
        "objective": protocol.objective,
        "training_type": protocol.training_type,
        "status": row.status.value,
        "performed_count": row.performed_count,
        "session_count": row.session_count,
        "last_performed_on": (
            row.last_performed_on.isoformat() if row.last_performed_on else None
        ),
        "deletable": row.deletable,
        # The member Session ids, in order, so the client can tell which row owns the Live
        # Session it holds (the server can't see that slot, ADR-0012) and block its Delete.
        "session_ids": [session.session_id for session in protocol.sessions],
        "made_current_at": (
            row.made_current_at.isoformat() if row.made_current_at else None
        ),
    }


def serialize_balance_preview(preview: BalancePreview) -> dict:
    """The non-predictive SIMULATE payload the Builder renders (ADR-0021): per-week
    Session/Set counts, plan totals, and the curated Muscle-Group split as an ordered
    list (``muscle_groups.distribution`` already emits it in canonical GROUP_ORDER, so
    the list reads Legs→…→Unclassified). No fatigue/recovery/volume figure is present —
    none is computed."""

    return {
        "weeks": [
            {
                "week": week.week,
                "session_count": week.session_count,
                "set_count": week.set_count,
            }
            for week in preview.weeks
        ],
        "total_sessions": sum(week.session_count for week in preview.weeks),
        "total_sets": sum(week.set_count for week in preview.weeks),
        "muscle_distribution": [
            {"group": group.value, "pct": pct}
            for group, pct in preview.muscle_distribution.items()
        ],
    }


__all__ = [
    "serialize_session",
    "serialize_protocol",
    "serialize_protocol_progress",
    "serialize_protocol_index_row",
    "serialize_balance_preview",
]
