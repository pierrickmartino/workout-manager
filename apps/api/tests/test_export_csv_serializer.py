"""The pure CSV-flattening serializer for Data Export (ADR-0062, issue #419).

Tested directly over hand-built view objects — no repository, no HTTP — because the
flattening is pure. The route's job (owner-scoping, the file download) is asserted
separately in the endpoint test; here we pin the two properties only the flattening
owns: **row grain** (exactly one row per Logged Set) and **column stability** (a fixed,
ordered header regardless of row content), plus that weights come out in canonical
kilograms with the unit labeled and plan/session context rides as columns."""

from __future__ import annotations

import csv
import io
from datetime import date

from app.export.csv_serializer import (
    LOGGED_SET_CSV_COLUMNS,
    flatten_logged_sets,
    logged_sets_csv,
)
from app.repositories.logged_session_repository import (
    LoggedSessionView,
    LoggedSetView,
)
from app.repositories.protocol_repository import ProtocolSessionView, ProtocolView
from app.repositories.session_repository import PrescriptionView


def _prescription(exercise_id: int) -> PrescriptionView:
    return PrescriptionView(
        position=0,
        sets=5,
        reps="5",
        rest_seconds=120,
        tempo=None,
        recommended_load=None,
        prescribed_quantity=None,
        superset_group=None,
        round_rest_seconds=None,
        exercise_id=exercise_id,
        exercise_name="Back Squat",
        exercise_description=None,
        targeted_muscles=[],
        required_equipment=[],
        provenance="curated",
    )


def _logged_set(
    position: int,
    exercise_id: int,
    *,
    quantity: dict | None = None,
    load: dict | None = None,
    perceived_difficulty: int | None = None,
    body_weight_kg: float | None = None,
) -> LoggedSetView:
    return LoggedSetView(
        position=position,
        quantity=quantity,
        load=load,
        perceived_difficulty=perceived_difficulty,
        exercise_id=exercise_id,
        exercise_name="Back Squat",
        body_weight_kg=body_weight_kg,
    )


def _logged_session(
    session_id: int | None,
    *,
    sets: list[LoggedSetView],
    id: int = 1,
    performed_on: date = date(2026, 1, 3),
    training_type: str = "strength",
    completion_outcome: str | None = "completed",
    duration_seconds: int | None = 3600,
) -> LoggedSessionView:
    return LoggedSessionView(
        id=id,
        clerk_user_id="user_a",
        session_id=session_id,
        training_type=training_type,
        performed_on=performed_on,
        logged_sets=sets,
        completion_outcome=completion_outcome,
        duration_seconds=duration_seconds,
    )


def _protocol(
    *,
    protocol_id: int,
    session_id: int,
    name: str | None,
    week: int,
    day: int,
) -> ProtocolView:
    return ProtocolView(
        id=protocol_id,
        clerk_user_id="user_a",
        training_type="strength",
        objective="hypertrophy",
        sessions_per_week=3,
        weeks=4,
        duration_minutes=60,
        name=name,
        sessions=[
            ProtocolSessionView(
                session_id=session_id,
                position=0,
                week=week,
                day=day,
                title=None,
                prescriptions=[_prescription(exercise_id=7)],
            )
        ],
    )


def _rows_from_csv(text: str) -> list[dict]:
    return list(csv.DictReader(io.StringIO(text)))


def test_one_row_per_logged_set_is_the_grain():
    # Arrange — one session with three sets, another with two
    logged = [
        _logged_session(
            None,
            id=1,
            sets=[_logged_set(i, exercise_id=7) for i in range(3)],
        ),
        _logged_session(
            None,
            id=2,
            sets=[_logged_set(i, exercise_id=7) for i in range(2)],
        ),
    ]

    # Act
    rows = flatten_logged_sets(protocols=[], logged_sessions=logged)

    # Assert — five sets, five rows
    assert len(rows) == 5


def test_columns_are_stable_regardless_of_row_content():
    # Arrange — a sparse set (no quantity, no load, no difficulty) still fills every column
    logged = [_logged_session(None, sets=[_logged_set(0, exercise_id=7)])]

    # Act
    rows = flatten_logged_sets(protocols=[], logged_sessions=logged)

    # Assert — the row carries exactly the declared columns, in order
    assert list(rows[0].keys()) == list(LOGGED_SET_CSV_COLUMNS)


def test_absolute_load_flattens_to_canonical_kg_with_labeled_unit():
    # Arrange — an absolute 100 kg set
    logged = [
        _logged_session(
            None,
            sets=[
                _logged_set(
                    0,
                    exercise_id=7,
                    quantity={"kind": "repetitions", "text": "5", "count": 5},
                    load={"kind": "absolute", "text": "100 kg", "kg": 100.0},
                    perceived_difficulty=8,
                    body_weight_kg=80.0,
                )
            ],
        )
    ]

    # Act
    row = flatten_logged_sets(protocols=[], logged_sessions=logged)[0]

    # Assert — the kg value and a labeled unit column
    assert row["weight_kg"] == 100.0
    assert row["weight_unit"] == "kg"
    assert row["load_kind"] == "absolute"
    assert row["repetitions"] == 5
    assert row["perceived_difficulty"] == 8
    assert row["body_weight_kg"] == 80.0


def test_non_absolute_load_carries_no_kg_but_preserves_the_typed_load():
    # Arrange — a qualitative load resolves to no kg
    logged = [
        _logged_session(
            None,
            sets=[
                _logged_set(
                    0,
                    exercise_id=7,
                    load={"kind": "qualitative", "text": "hard"},
                )
            ],
        )
    ]

    # Act
    row = flatten_logged_sets(protocols=[], logged_sessions=logged)[0]

    # Assert — no kg, but the typed load is not lost
    assert row["weight_kg"] is None
    assert row["weight_unit"] == "kg"
    assert row["load_kind"] == "qualitative"
    assert row["load_text"] == "hard"


def test_plan_and_session_context_ride_as_columns():
    # Arrange — a record backed by a Session that belongs to a Protocol
    logged = [
        _logged_session(
            session_id=42,
            id=9,
            performed_on=date(2026, 2, 1),
            completion_outcome="completed",
            duration_seconds=2700,
            sets=[_logged_set(0, exercise_id=7)],
        )
    ]
    protocols = [
        _protocol(protocol_id=3, session_id=42, name="Spring Block", week=2, day=1)
    ]

    # Act
    row = flatten_logged_sets(protocols=protocols, logged_sessions=logged)[0]

    # Assert — session context
    assert row["logged_session_id"] == 9
    assert row["performed_on"] == "2026-02-01"
    assert row["training_type"] == "strength"
    assert row["completion_outcome"] == "completed"
    assert row["session_duration_seconds"] == 2700
    assert row["session_id"] == 42
    # Plan context resolved through the owning Protocol
    assert row["protocol_id"] == 3
    assert row["protocol_name"] == "Spring Block"
    assert row["protocol_week"] == 2
    assert row["protocol_day"] == 1


def test_plan_context_is_blank_for_a_plan_less_record():
    # Arrange — a plan-less record (no session_id) has no protocol to resolve
    logged = [_logged_session(None, sets=[_logged_set(0, exercise_id=7)])]

    # Act
    row = flatten_logged_sets(protocols=[], logged_sessions=logged)[0]

    # Assert — session_id and every plan column empty, session context still present
    assert row["session_id"] is None
    assert row["protocol_id"] is None
    assert row["protocol_name"] is None
    assert row["protocol_week"] is None
    assert row["protocol_day"] is None


def test_unnamed_protocol_falls_back_to_a_derived_label():
    # Arrange — a Protocol with no name resolves to its derived "objective · type" label
    logged = [
        _logged_session(session_id=42, sets=[_logged_set(0, exercise_id=7)])
    ]
    protocols = [
        _protocol(protocol_id=3, session_id=42, name=None, week=1, day=1)
    ]

    # Act
    row = flatten_logged_sets(protocols=protocols, logged_sessions=logged)[0]

    # Assert — the never-blank derived label
    assert row["protocol_name"] == "hypertrophy · strength"


def test_distance_and_duration_quantities_flatten_to_their_axes():
    # Arrange — a distance set with a companion duration, and a pure duration set
    logged = [
        _logged_session(
            None,
            id=1,
            training_type="cardio",
            sets=[
                _logged_set(
                    0,
                    exercise_id=7,
                    quantity={
                        "kind": "distance",
                        "text": "5 km",
                        "metres": 5000.0,
                        "duration_s": 1500.0,
                    },
                ),
                _logged_set(
                    1,
                    exercise_id=7,
                    quantity={"kind": "duration", "text": "60s", "seconds": 60.0},
                ),
            ],
        )
    ]

    # Act
    rows = flatten_logged_sets(protocols=[], logged_sessions=logged)

    # Assert — distance row carries metres + companion seconds; repetitions blank
    assert rows[0]["quantity_kind"] == "distance"
    assert rows[0]["distance_metres"] == 5000.0
    assert rows[0]["duration_seconds"] == 1500.0
    assert rows[0]["repetitions"] is None
    # Duration row carries seconds only
    assert rows[1]["quantity_kind"] == "duration"
    assert rows[1]["duration_seconds"] == 60.0
    assert rows[1]["distance_metres"] is None


def test_csv_text_has_the_stable_header_and_one_data_row_per_set():
    # Arrange
    logged = [
        _logged_session(
            None,
            sets=[
                _logged_set(
                    0,
                    exercise_id=7,
                    quantity={"kind": "repetitions", "text": "5", "count": 5},
                    load={"kind": "absolute", "text": "100 kg", "kg": 100.0},
                )
            ],
        )
    ]

    # Act
    text = logged_sets_csv(protocols=[], logged_sessions=logged)
    parsed = _rows_from_csv(text)

    # Assert — header is the stable column list; one data row; kg rendered
    assert text.splitlines()[0] == ",".join(LOGGED_SET_CSV_COLUMNS)
    assert len(parsed) == 1
    assert parsed[0]["weight_kg"] == "100.0"
    assert parsed[0]["weight_unit"] == "kg"


def test_empty_account_is_a_well_formed_header_only_csv():
    # Act
    text = logged_sets_csv(protocols=[], logged_sessions=[])

    # Assert — the header row is present, no data rows
    lines = text.splitlines()
    assert lines[0] == ",".join(LOGGED_SET_CSV_COLUMNS)
    assert _rows_from_csv(text) == []


def test_a_logged_session_with_no_sets_contributes_no_rows():
    # Arrange — an empty session alongside a populated one
    logged = [
        _logged_session(None, id=1, sets=[]),
        _logged_session(None, id=2, sets=[_logged_set(0, exercise_id=7)]),
    ]

    # Act
    rows = flatten_logged_sets(protocols=[], logged_sessions=logged)

    # Assert — only the populated session's single set becomes a row
    assert len(rows) == 1
    assert rows[0]["logged_session_id"] == 2
