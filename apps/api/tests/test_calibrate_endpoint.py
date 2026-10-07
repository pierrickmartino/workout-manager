"""The Calibrate endpoint end to end (ADR-0111).

``POST /api/protocols/{id}/calibrate`` takes the offset the user wants to **stand at** — an
absolute target, not a delta, so the act is idempotent — and materialises it onto the
Protocol's un-performed tail, returning the progressed Protocol in the standard envelope.

These tests drive what the HTTP boundary owns rather than re-testing the resolver (that is
``test_calibration.py``) or the pipeline (``test_calibration_pipeline.py``): authentication,
ownership, the payload's shape, the clamp reported at the rail, the Sensitive-Constraint
caveat, and the frozen performed prefix surviving a real request. Same in-memory wiring as
the other route tests.
"""

from __future__ import annotations

from datetime import date

from app.domain.calibration import EASIER_STEP_KG, MAX_CALIBRATION, MIN_CALIBRATION
from app.domain.load import parse_load
from app.repositories.logged_session_repository import (
    LoggedSessionDraft,
    LoggedSetDraft,
)
from app.repositories.profile_repository import (
    InMemoryProfileRepository,
    ProfileUpdate,
)
from tests.quantities import reps_quantity
from tests.test_protocol_endpoint import (
    FakeProtocolGenerator,
    _kg_protocol,
    build_harness,
)


def _fresh_protocol(h, sub: str) -> dict:
    protocol_id = h.generate_protocol_id(sub)
    return h.fetch_protocol(sub, protocol_id).json()["data"]


def _calibrate(h, sub: str, protocol_id: int, calibration: int):
    return h.client.post(
        f"/api/protocols/{protocol_id}/calibrate",
        headers=h.auth(sub),
        json={"calibration": calibration},
    )


def _first_load(data: dict, session_index: int = 0) -> dict | None:
    return data["sessions"][session_index]["prescriptions"][0]["recommended_load"]


def _perform_first(h, sub: str, protocol: dict) -> None:
    """Log a Completed performance of the first Session so it becomes frozen record."""

    first = protocol["sessions"][0]
    h.logged.create(
        sub,
        LoggedSessionDraft(
            session_id=first["session_id"],
            performed_on=date(2026, 1, 1),
            completion_outcome="completed",
            logged_sets=[
                LoggedSetDraft(
                    exercise_id=first["prescriptions"][0]["exercise_id"],
                    quantity=reps_quantity(5),
                    load=parse_load("60 kg").to_dict(),
                    perceived_difficulty=6,
                )
            ],
        ),
    )


# ----------------------------------------------------------------------- the boundary


def test_calibrate_requires_authentication():
    h = build_harness(generator=FakeProtocolGenerator(result=_kg_protocol()))

    response = h.client.post("/api/protocols/1/calibrate", json={"calibration": -1})

    assert response.status_code == 401


def test_calibrate_rejects_a_missing_offset():
    h = build_harness(generator=FakeProtocolGenerator(result=_kg_protocol()))
    protocol = _fresh_protocol(h, "user_cal_body")

    response = h.client.post(
        f"/api/protocols/{protocol['id']}/calibrate",
        headers=h.auth("user_cal_body"),
        json={},
    )

    assert response.status_code == 422


def test_calibrate_is_404_for_an_unknown_protocol():
    h = build_harness(generator=FakeProtocolGenerator(result=_kg_protocol()))

    response = _calibrate(h, "user_cal_404", 9999, -1)

    assert response.status_code == 404


def test_calibrate_is_404_for_another_users_protocol():
    h = build_harness(generator=FakeProtocolGenerator(result=_kg_protocol()))
    protocol = _fresh_protocol(h, "user_cal_owner")

    response = _calibrate(h, "user_cal_intruder", protocol["id"], -1)

    assert response.status_code == 404


# ------------------------------------------------------------------------- the effect


def test_calibrate_re_pitches_the_tail_and_echoes_the_offset():
    # Arrange — a fresh kg Protocol, nothing performed
    h = build_harness(generator=FakeProtocolGenerator(result=_kg_protocol()))
    protocol = _fresh_protocol(h, "user_cal_down")
    authored = parse_load(_first_load(protocol)["text"]).kg

    # Act — one notch easier
    response = _calibrate(h, "user_cal_down", protocol["id"], -1)

    # Assert — the plan moved, and the standing offset rides back on the payload
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["calibration"] == -1
    assert parse_load(_first_load(data)["text"]).kg == authored - EASIER_STEP_KG["beginner"]


def test_calibrate_carries_its_bounds_so_a_client_need_not_hard_code_them():
    h = build_harness(generator=FakeProtocolGenerator(result=_kg_protocol()))
    protocol = _fresh_protocol(h, "user_cal_bounds")

    data = _calibrate(h, "user_cal_bounds", protocol["id"], 1).json()["data"]

    assert data["calibration_min"] == MIN_CALIBRATION
    assert data["calibration_max"] == MAX_CALIBRATION


def test_calibrate_is_idempotent_because_the_offset_is_absolute():
    """A double-tapped control lands on the offset the user can see, not two past it."""

    h = build_harness(generator=FakeProtocolGenerator(result=_kg_protocol()))
    protocol = _fresh_protocol(h, "user_cal_twice")

    once = _calibrate(h, "user_cal_twice", protocol["id"], -1).json()["data"]
    twice = _calibrate(h, "user_cal_twice", protocol["id"], -1).json()["data"]

    assert twice["calibration"] == -1
    assert _first_load(twice) == _first_load(once)


def test_calibrate_clamps_an_out_of_range_request_and_says_it_is_at_the_rail():
    """The clamp is the one moment a Calibration is not silent: an inert control that
    never explains itself is a defect, and the rail is where the level fold takes over."""

    h = build_harness(generator=FakeProtocolGenerator(result=_kg_protocol()))
    protocol = _fresh_protocol(h, "user_cal_rail")

    data = _calibrate(h, "user_cal_rail", protocol["id"], 99).json()["data"]

    assert data["calibration"] == MAX_CALIBRATION
    assert data["calibration_at_rail"] is True


def test_calibrate_below_the_rail_is_not_flagged():
    h = build_harness(generator=FakeProtocolGenerator(result=_kg_protocol()))
    protocol = _fresh_protocol(h, "user_cal_mid")

    data = _calibrate(h, "user_cal_mid", protocol["id"], 1).json()["data"]

    assert data["calibration_at_rail"] is False


def test_calibrate_leaves_a_performed_session_untouched():
    """ADR-0020's frozen prefix, enforced through a real request."""

    # Arrange — perform the first Session, then re-fetch so it reads as performed
    h = build_harness(generator=FakeProtocolGenerator(result=_kg_protocol()))
    protocol = _fresh_protocol(h, "user_cal_frozen")
    _perform_first(h, "user_cal_frozen", protocol)
    authored = _first_load(protocol)

    # Act
    data = _calibrate(h, "user_cal_frozen", protocol["id"], -1).json()["data"]

    # Assert — the performed Session keeps its authored Load; the tail moved
    assert _first_load(data, 0) == authored
    assert _first_load(data, 1) != authored


# ---------------------------------------------------------------- the safety posture


def test_a_sensitive_constraint_user_may_calibrate_upward_with_a_caveat():
    """ADR-0058's precedent: a caveat, never a refusal."""

    # Arrange — a profile carrying an injury
    profiles = InMemoryProfileRepository()
    h = build_harness(
        generator=FakeProtocolGenerator(result=_kg_protocol()), profiles=profiles
    )
    protocol = _fresh_protocol(h, "user_cal_injury")
    profiles.update(
        "user_cal_injury", ProfileUpdate(sensitive_constraints=["injury"])
    )

    # Act — harder, the direction a reflexive safety gate would block
    response = _calibrate(h, "user_cal_injury", protocol["id"], 1)

    # Assert — allowed, and disclosed
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["calibration"] == 1
    assert data["calibration_sensitive_caveat"] is True


def test_an_unconstrained_user_gets_no_caveat():
    h = build_harness(generator=FakeProtocolGenerator(result=_kg_protocol()))
    protocol = _fresh_protocol(h, "user_cal_plain")

    data = _calibrate(h, "user_cal_plain", protocol["id"], 1).json()["data"]

    assert data["calibration_sensitive_caveat"] is False


# ------------------------------------------------------------------------- the read


def test_a_fetched_protocol_reports_its_standing_calibration():
    """The offset is on every Protocol read, not only the Calibrate response, so Home can
    render the control's current position without a second call."""

    h = build_harness(generator=FakeProtocolGenerator(result=_kg_protocol()))
    protocol = _fresh_protocol(h, "user_cal_read")
    _calibrate(h, "user_cal_read", protocol["id"], -2)

    refetched = h.fetch_protocol("user_cal_read", protocol["id"]).json()["data"]

    assert refetched["calibration"] == -2


def test_an_uncalibrated_protocol_reads_as_zero_not_null():
    """NULL is never surfaced: a client should not have to decide what an absent offset
    means, and 0 is exactly "as authored"."""

    h = build_harness(generator=FakeProtocolGenerator(result=_kg_protocol()))
    protocol = _fresh_protocol(h, "user_cal_virgin")

    assert protocol["calibration"] == 0
