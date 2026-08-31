"""Pure CSV flattening for Data Export (ADR-0062, issue #419).

The JSON export (``serializer.py``) keeps the user's data nested and faithful. This
module answers the *other* shape a user wants: an **analysis-friendly** CSV whose
natural row is the **Logged Set** (ADR-0062) — one row each, with the plan and session
context the set sits inside flattened into stable columns. **Pure**: no I/O, no
repository, no ORM access beyond reading the already-gathered, owner-scoped views it is
handed, so it is unit-tested directly. The route owns owner-scoping and the file
download; this module never fetches and never scopes.

Weights are **canonical kilograms** — the value an absolute ``Load`` already stores
regardless of the user's **Weight Unit** (ADR-0062) — surfaced in a ``weight_kg`` column
with a labeled ``weight_unit`` column so the file is self-describing. A non-absolute Load
(bodyweight, %1RM, qualitative, range) resolves to no single kg, so ``weight_kg`` is
blank there; the typed Load is never lost — ``load_kind`` and ``load_text`` preserve it.
Distance rides as the metres, and any duration as the seconds, a typed ``Quantity``
already stores.
"""

from __future__ import annotations

import csv
import io
from collections.abc import Iterable
from dataclasses import dataclass

from app.domain.protocol import protocol_label
from app.export.serializer import CANONICAL_UNITS
from app.repositories.logged_session_repository import (
    LoggedSessionView,
    LoggedSetView,
)
from app.repositories.protocol_repository import ProtocolView

# The stable, ordered column set for the one-row-per-Logged-Set CSV. Fixed regardless of
# any row's content — the property the pure flattening is tested on (column stability),
# and the contract an analysis tool reading the file relies on. Grouped session context →
# plan context → the set's own axes (amount, then load) → its subjective/bodyweight fields.
LOGGED_SET_CSV_COLUMNS: tuple[str, ...] = (
    "logged_session_id",
    "performed_on",
    "training_type",
    "completion_outcome",
    "session_duration_seconds",
    "session_id",
    "protocol_id",
    "protocol_name",
    "protocol_week",
    "protocol_day",
    "set_position",
    "exercise_id",
    "exercise_name",
    "quantity_kind",
    "repetitions",
    "distance_metres",
    "duration_seconds",
    "load_kind",
    "load_text",
    "weight_kg",
    "weight_unit",
    "perceived_difficulty",
    "body_weight_kg",
)

# The canonical unit every ``weight_kg`` value is expressed in, labeled on every row so a
# spreadsheet cell is never an unlabeled number (ADR-0062).
_WEIGHT_UNIT = CANONICAL_UNITS["weight"]


@dataclass(frozen=True)
class _PlanContext:
    """The plan columns a Logged Session inherits from the Protocol it belongs to.

    A record's ``session_id`` points at the prescribing Session; that Session may be a
    member of one of the user's Protocols. This carries the resolved Protocol columns, or
    all-``None`` for a plan-less record or one backed by a standalone Session.
    """

    protocol_id: int | None = None
    protocol_name: str | None = None
    week: int | None = None
    day: int | None = None


_EMPTY_PLAN = _PlanContext()


def _plan_context_by_session_id(
    protocols: Iterable[ProtocolView],
) -> dict[int, _PlanContext]:
    """Map each Protocol member Session's id to the plan columns it confers.

    Built once per export from the user's own owner-scoped Protocols. A Session id is
    unique to one Protocol Session, so the mapping is unambiguous; standalone Sessions
    (and plan-less records) simply never appear here and fall back to ``_EMPTY_PLAN``.
    """

    lookup: dict[int, _PlanContext] = {}
    for protocol in protocols:
        name = protocol_label(
            protocol.name, protocol.objective, protocol.training_type
        )
        for session in protocol.sessions:
            lookup[session.session_id] = _PlanContext(
                protocol_id=protocol.id,
                protocol_name=name,
                week=session.week,
                day=session.day,
            )
    return lookup


def _duration_seconds(quantity: dict) -> float | None:
    """The seconds a Quantity carries, whichever axis holds it.

    A ``duration`` set stores its time as ``seconds``; a ``distance`` set may carry a
    companion ``duration_s`` (ADR-0032). Either flattens to the one ``duration_seconds``
    column — "how long", regardless of whether time is the primary axis or the companion.
    """

    seconds = quantity.get("seconds")
    return seconds if seconds is not None else quantity.get("duration_s")


def _row(
    logged: LoggedSessionView, logged_set: LoggedSetView, plan: _PlanContext
) -> dict:
    """Flatten one Logged Set into its CSV row, inheriting session and plan context.

    Every column in ``LOGGED_SET_CSV_COLUMNS`` is populated (``None`` where the set has no
    value for it, rendered as a blank cell) so the grain and the header stay stable.
    """

    quantity = logged_set.quantity or {}
    load = logged_set.load or {}
    return {
        "logged_session_id": logged.id,
        "performed_on": logged.performed_on.isoformat(),
        "training_type": logged.training_type,
        "completion_outcome": logged.completion_outcome,
        "session_duration_seconds": logged.duration_seconds,
        "session_id": logged.session_id,
        "protocol_id": plan.protocol_id,
        "protocol_name": plan.protocol_name,
        "protocol_week": plan.week,
        "protocol_day": plan.day,
        "set_position": logged_set.position,
        "exercise_id": logged_set.exercise_id,
        "exercise_name": logged_set.exercise_name,
        "quantity_kind": quantity.get("kind"),
        "repetitions": quantity.get("count"),
        "distance_metres": quantity.get("metres"),
        "duration_seconds": _duration_seconds(quantity),
        "load_kind": load.get("kind"),
        "load_text": load.get("text"),
        # Only an absolute Load resolves to a single canonical kg; every other kind is
        # blank here but preserved verbatim through ``load_kind`` / ``load_text``.
        "weight_kg": load.get("kg"),
        "weight_unit": _WEIGHT_UNIT,
        "perceived_difficulty": logged_set.perceived_difficulty,
        "body_weight_kg": logged_set.body_weight_kg,
    }


def flatten_logged_sets(
    *,
    protocols: Iterable[ProtocolView],
    logged_sessions: Iterable[LoggedSessionView],
) -> list[dict]:
    """One row per Logged Set, with plan and session context as columns (issue #419).

    The **row grain** is the Logged Set: a Logged Session contributes exactly as many
    rows as it has sets — zero for an empty record. Each row inherits its session's
    context and, when the record is backed by a Protocol Session, that Protocol's plan
    columns. Pure: ``protocols`` and ``logged_sessions`` are already owner-scoped by the
    route, so this never fetches, scopes, or converts. Order follows the inputs — the
    repository already returns records newest-performed-first and sets in position order.
    """

    plan_by_session = _plan_context_by_session_id(protocols)
    return [
        _row(logged, logged_set, plan_by_session.get(logged.session_id, _EMPTY_PLAN))
        for logged in logged_sessions
        for logged_set in logged.logged_sets
    ]


def logged_sets_csv(
    *,
    protocols: Iterable[ProtocolView],
    logged_sessions: Iterable[LoggedSessionView],
) -> str:
    """Render the flattened Logged Sets to CSV text (ADR-0062, issue #419).

    Always emits the stable ``LOGGED_SET_CSV_COLUMNS`` header, then one data row per
    Logged Set — so an empty account is a well-formed, header-only CSV. ``None`` values
    render as blank cells. ``\\r\\n`` line terminators are the CSV standard (RFC 4180),
    which spreadsheet tools expect.
    """

    buffer = io.StringIO()
    writer = csv.DictWriter(
        buffer, fieldnames=LOGGED_SET_CSV_COLUMNS, restval="", extrasaction="raise"
    )
    writer.writeheader()
    writer.writerows(flatten_logged_sets(protocols=protocols, logged_sessions=logged_sessions))
    return buffer.getvalue()


__all__ = [
    "LOGGED_SET_CSV_COLUMNS",
    "flatten_logged_sets",
    "logged_sets_csv",
]
