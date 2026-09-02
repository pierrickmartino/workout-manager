"""The Protocol Builder deploy endpoint end to end (Module G + F, ADR-0020).

``POST /api/protocols/{id}/deploy`` stages nothing itself — it takes the desired
un-performed tail the Builder assembled client-side, validates it, and on success
replaces that tail **in place**: performed Sessions keep their ids and content, and
the plan's self-paced progress is unchanged. A rejected deploy persists nothing and
names what is wrong. These tests drive the two highest-stakes behaviors (frozen
prefix, empty Session) plus the happy path, over the same in-memory wiring the other
route tests use.
"""

from __future__ import annotations

from tests.quantities import reps_quantity

from datetime import date

from app.domain.load import parse_load
from app.repositories.logged_session_repository import (
    LoggedSessionDraft,
    LoggedSetDraft,
)
from app.repositories.profile_repository import (
    InMemoryProfileRepository,
    ProfileUpdate,
)
from tests.test_protocol_endpoint import (
    FakeProtocolGenerator,
    build_harness,
    _kg_protocol,
)


def _deploy_body(protocol: dict, **session_overrides) -> dict:
    """Build a deploy payload that echoes a fetched Protocol's un-performed tail,
    so a bare round-trip is a no-op unless a test edits it."""

    sessions = []
    for session in protocol["sessions"]:
        if session["performed"]:
            continue
        sessions.append(
            {
                "session_id": session["session_id"],
                "week": session["week"],
                "day": session["day"],
                "prescriptions": [
                    {
                        "exercise_id": p["exercise_id"],
                        "sets": p["sets"],
                        "reps": p["reps"],
                        "rest_seconds": p["rest_seconds"],
                        "tempo": p["tempo"],
                        "load_kind": "absolute",
                        "load_value": "",
                    }
                    for p in session["prescriptions"]
                ],
            }
        )
    body = {
        "weeks": protocol["weeks"],
        "sessions_per_week": protocol["sessions_per_week"],
        "sessions": sessions,
    }
    body.update(session_overrides)
    return body


def _perform_week_one(h, sub: str, protocol: dict) -> None:
    """Log a Completed performance of the first Session so it becomes frozen."""

    week_one = protocol["sessions"][0]
    h.logged.create(
        sub,
        LoggedSessionDraft(
            session_id=week_one["session_id"],
            performed_on=date(2026, 1, 1),
            completion_outcome="completed",
            logged_sets=[
                LoggedSetDraft(
                    exercise_id=week_one["prescriptions"][0]["exercise_id"],
                    quantity=reps_quantity(5),
                    load=parse_load("60 kg").to_dict(),
                    perceived_difficulty=6,
                )
            ],
        ),
    )


def _fresh_protocol(h, sub: str) -> dict:
    protocol_id = h.generate_protocol_id(sub)
    return h.fetch_protocol(sub, protocol_id).json()["data"]


def test_deploy_requires_authentication():
    h = build_harness(generator=FakeProtocolGenerator(result=_kg_protocol()))
    response = h.client.post("/api/protocols/1/deploy", json={"weeks": 2, "sessions_per_week": 1, "sessions": []})
    assert response.status_code == 401


def test_deploy_edits_an_un_performed_prescription_in_place():
    # Arrange — a fresh two-week kg Protocol, nothing performed yet
    h = build_harness(generator=FakeProtocolGenerator(result=_kg_protocol()))
    protocol = _fresh_protocol(h, "user_edit")
    protocol_id = protocol["id"]
    body = _deploy_body(protocol)
    # Retarget Week 1's first Prescription: 3 sets → 5, and set an absolute Load
    body["sessions"][0]["prescriptions"][0]["sets"] = 5
    body["sessions"][0]["prescriptions"][0]["load_kind"] = "absolute"
    body["sessions"][0]["prescriptions"][0]["load_value"] = "80"

    # Act
    response = h.client.post(
        f"/api/protocols/{protocol_id}/deploy",
        headers=h.auth("user_edit"),
        json=body,
    )

    # Assert — the deployed plan carries the edit
    assert response.status_code == 200
    data = response.json()["data"]
    first = data["sessions"][0]["prescriptions"][0]
    assert first["sets"] == 5
    assert first["recommended_load"] == parse_load("80 kg").to_dict()


def test_deploy_rejects_a_change_to_a_performed_session():
    # Arrange — perform Week 1 so it is frozen, then try to edit it
    h = build_harness(generator=FakeProtocolGenerator(result=_kg_protocol()))
    protocol = _fresh_protocol(h, "user_frozen")
    protocol_id = protocol["id"]
    _perform_week_one(h, "user_frozen", protocol)

    frozen_session = protocol["sessions"][0]
    body = _deploy_body(protocol)
    # Smuggle the performed Session back into the tail with an edit
    body["sessions"].insert(
        0,
        {
            "session_id": frozen_session["session_id"],
            "week": frozen_session["week"],
            "day": frozen_session["day"],
            "prescriptions": [
                {
                    "exercise_id": frozen_session["prescriptions"][0]["exercise_id"],
                    "sets": 99,
                    "reps": "1",
                    "rest_seconds": None,
                    "tempo": None,
                    "load_kind": "absolute",
                    "load_value": "",
                }
            ],
        },
    )

    # Act
    response = h.client.post(
        f"/api/protocols/{protocol_id}/deploy",
        headers=h.auth("user_frozen"),
        json=body,
    )

    # Assert — rejected server-side, naming the frozen Session; nothing persisted
    assert response.status_code == 422
    payload = response.json()
    assert payload["success"] is False
    codes = [e["code"] for e in payload["errors"]]
    assert "performed_session_modified" in codes
    offending = next(e for e in payload["errors"] if e["code"] == "performed_session_modified")
    assert offending["session_id"] == frozen_session["session_id"]

    # The Protocol is untouched: Week 1 still has its original single set count
    after = h.fetch_protocol("user_frozen", protocol_id).json()["data"]
    assert after["sessions"][0]["prescriptions"][0]["sets"] == 3


def test_deploy_rejects_an_empty_session_and_persists_nothing():
    # Arrange — strip every Prescription from Week 1
    h = build_harness(generator=FakeProtocolGenerator(result=_kg_protocol()))
    protocol = _fresh_protocol(h, "user_empty")
    protocol_id = protocol["id"]
    body = _deploy_body(protocol)
    body["sessions"][0]["prescriptions"] = []

    # Act
    response = h.client.post(
        f"/api/protocols/{protocol_id}/deploy",
        headers=h.auth("user_empty"),
        json=body,
    )

    # Assert — rejected, and the Session still has its Prescription afterward
    assert response.status_code == 422
    assert "empty_session" in [e["code"] for e in response.json()["errors"]]
    after = h.fetch_protocol("user_empty", protocol_id).json()["data"]
    assert len(after["sessions"][0]["prescriptions"]) == 1


def test_deploy_leaves_progress_and_performed_ids_unchanged():
    # Arrange — perform Week 1, then deploy an edit to Week 2 only
    h = build_harness(generator=FakeProtocolGenerator(result=_kg_protocol()))
    protocol = _fresh_protocol(h, "user_progress")
    protocol_id = protocol["id"]
    _perform_week_one(h, "user_progress", protocol)
    performed_before = h.fetch_protocol("user_progress", protocol_id).json()["data"]
    frozen_id = performed_before["sessions"][0]["session_id"]

    body = _deploy_body(performed_before)  # excludes the frozen Week 1
    body["sessions"][0]["prescriptions"][0]["reps"] = "8"

    # Act
    response = h.client.post(
        f"/api/protocols/{protocol_id}/deploy",
        headers=h.auth("user_progress"),
        json=body,
    )

    # Assert — deploy succeeds; Week 1 keeps its id and stays completed, next is Week 2
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["sessions"][0]["session_id"] == frozen_id
    assert data["sessions"][0]["performed"] is True
    assert data["completed_count"] == 1
    assert data["next_session"]["week"] == 2
    assert data["next_session"]["prescriptions"][0]["reps"] == "8"


def test_deploy_adds_and_reorders_prescriptions_in_an_un_performed_session():
    # Arrange — a fresh Protocol; Week 1 holds a single Back Squat Prescription
    h = build_harness(generator=FakeProtocolGenerator(result=_kg_protocol()))
    protocol = _fresh_protocol(h, "user_add")
    protocol_id = protocol["id"]
    original = protocol["sessions"][0]["prescriptions"][0]
    exercise_id = original["exercise_id"]

    body = _deploy_body(protocol)
    # Add a second Prescription (a movement picked from the Library — here the same
    # catalog Exercise is enough to exercise the add path) and reorder it to the
    # front, so the deployed order is the added movement, then the original.
    added = {
        "exercise_id": exercise_id,
        "sets": 4,
        "reps": "10",
        "rest_seconds": 60,
        "tempo": None,
        "load_kind": "absolute",
        "load_value": "",
    }
    body["sessions"][0]["prescriptions"] = [added, body["sessions"][0]["prescriptions"][0]]

    # Act
    response = h.client.post(
        f"/api/protocols/{protocol_id}/deploy",
        headers=h.auth("user_add"),
        json=body,
    )

    # Assert — Week 1 now holds both, in the deployed order with contiguous positions
    assert response.status_code == 200
    after = h.fetch_protocol("user_add", protocol_id).json()["data"]
    week_one = after["sessions"][0]["prescriptions"]
    assert [p["reps"] for p in week_one] == ["10", "5"]
    assert [p["position"] for p in week_one] == [0, 1]


def test_deploy_rejects_a_prescription_referencing_an_unknown_exercise():
    # Arrange — add a Prescription that points at an Exercise not in the catalog,
    # the bad-reference case a pick-only Library should make unreachable but deploy
    # must still guard server-side (ADR-0021).
    h = build_harness(generator=FakeProtocolGenerator(result=_kg_protocol()))
    protocol = _fresh_protocol(h, "user_badref")
    protocol_id = protocol["id"]
    body = _deploy_body(protocol)
    body["sessions"][0]["prescriptions"].append(
        {
            "exercise_id": 999999,
            "sets": 3,
            "reps": "8",
            "rest_seconds": None,
            "tempo": None,
            "load_kind": "absolute",
            "load_value": "",
        }
    )

    # Act
    response = h.client.post(
        f"/api/protocols/{protocol_id}/deploy",
        headers=h.auth("user_badref"),
        json=body,
    )

    # Assert — rejected, naming the offending Prescription; nothing persisted
    assert response.status_code == 422
    errors = response.json()["errors"]
    offending = next(e for e in errors if e["code"] == "unknown_exercise")
    assert offending["session_id"] == protocol["sessions"][0]["session_id"]
    assert offending["position"] == 1
    after = h.fetch_protocol("user_badref", protocol_id).json()["data"]
    assert len(after["sessions"][0]["prescriptions"]) == 1


def test_deploy_persists_the_protocol_name_and_returns_it_as_the_label():
    # Arrange — a fresh, unnamed Protocol
    h = build_harness(generator=FakeProtocolGenerator(result=_kg_protocol()))
    protocol = _fresh_protocol(h, "user_name")
    protocol_id = protocol["id"]
    body = _deploy_body(protocol)
    body["name"] = "Summer Split"

    # Act — the name rides through the DEPLOY path (ADR-0021), not a separate write
    response = h.client.post(
        f"/api/protocols/{protocol_id}/deploy",
        headers=h.auth("user_name"),
        json=body,
    )

    # Assert — the deployed Protocol carries the name, and the label is the name
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["name"] == "Summer Split"
    assert data["label"] == "Summer Split"
    # And it persists: a fresh fetch reads the name back
    after = h.fetch_protocol("user_name", protocol_id).json()["data"]
    assert after["name"] == "Summer Split"


def test_deploy_with_a_blank_name_falls_back_to_the_derived_label():
    # Arrange — a fresh Protocol; the user submits a whitespace-only name
    h = build_harness(generator=FakeProtocolGenerator(result=_kg_protocol()))
    protocol = _fresh_protocol(h, "user_blank")
    protocol_id = protocol["id"]
    body = _deploy_body(protocol)
    body["name"] = "   "

    # Act
    response = h.client.post(
        f"/api/protocols/{protocol_id}/deploy",
        headers=h.auth("user_blank"),
        json=body,
    )

    # Assert — a blank name is stored as unset and the derived label shows instead
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["name"] is None
    assert data["label"] == "gain muscle mass · strength"


def test_deploy_adds_a_new_un_performed_session_and_reenumerates_the_tail():
    # Arrange — a fresh two-week Protocol; add a third week as a new empty-id slot the
    # user filled from the Library (ADR-0020 Slice 3: add Sessions + reshape weeks)
    h = build_harness(generator=FakeProtocolGenerator(result=_kg_protocol()))
    protocol = _fresh_protocol(h, "user_addsession")
    protocol_id = protocol["id"]
    exercise_id = protocol["sessions"][0]["prescriptions"][0]["exercise_id"]

    body = _deploy_body(protocol)
    body["weeks"] = 3
    body["sessions"].append(
        {
            "session_id": None,  # a brand-new Session slot
            "week": 3,
            "day": 1,
            "prescriptions": [
                {
                    "exercise_id": exercise_id,
                    "sets": 4,
                    "reps": "6",
                    "rest_seconds": None,
                    "tempo": None,
                    "load_kind": "absolute",
                    "load_value": "",
                }
            ],
        }
    )

    # Act
    response = h.client.post(
        f"/api/protocols/{protocol_id}/deploy",
        headers=h.auth("user_addsession"),
        json=body,
    )

    # Assert — three Sessions, contiguous positions, positional week/day labels
    assert response.status_code == 200
    after = h.fetch_protocol("user_addsession", protocol_id).json()["data"]
    assert after["weeks"] == 3
    assert [s["position"] for s in after["sessions"]] == [0, 1, 2]
    assert [(s["week"], s["day"]) for s in after["sessions"]] == [(1, 1), (2, 1), (3, 1)]
    assert after["sessions"][2]["prescriptions"][0]["reps"] == "6"


def test_deploy_reshapes_the_tail_while_preserving_the_performed_prefix():
    # Arrange — perform Week 1 (frozen), then add a Week 3 to the un-performed tail
    h = build_harness(generator=FakeProtocolGenerator(result=_kg_protocol()))
    protocol = _fresh_protocol(h, "user_reshape")
    protocol_id = protocol["id"]
    _perform_week_one(h, "user_reshape", protocol)
    performed_before = h.fetch_protocol("user_reshape", protocol_id).json()["data"]
    frozen = performed_before["sessions"][0]
    exercise_id = frozen["prescriptions"][0]["exercise_id"]

    body = _deploy_body(performed_before)  # excludes the frozen Week 1
    body["weeks"] = 3
    body["sessions"].append(
        {
            "session_id": None,
            "week": 3,
            "day": 1,
            "prescriptions": [
                {
                    "exercise_id": exercise_id,
                    "sets": 3,
                    "reps": "5",
                    "rest_seconds": None,
                    "tempo": None,
                    "load_kind": "absolute",
                    "load_value": "",
                }
            ],
        }
    )

    # Act
    response = h.client.post(
        f"/api/protocols/{protocol_id}/deploy",
        headers=h.auth("user_reshape"),
        json=body,
    )

    # Assert — the frozen Week 1 keeps its id/position and stays completed; the tail is
    # re-enumerated after it into contiguous positions and weeks
    assert response.status_code == 200
    after = h.fetch_protocol("user_reshape", protocol_id).json()["data"]
    assert after["sessions"][0]["session_id"] == frozen["session_id"]
    assert after["sessions"][0]["performed"] is True
    assert [s["position"] for s in after["sessions"]] == [0, 1, 2]
    assert [s["week"] for s in after["sessions"]] == [1, 2, 3]
    assert after["completed_count"] == 1


def _superset_member(exercise_id: int, *, sets: int, group: str, round_rest: int | None) -> dict:
    """A grouped Prescription in a deploy payload: it carries the shared group tag and
    the group-owned round-rest (denormalized onto each member, ADR-0023)."""

    return {
        "exercise_id": exercise_id,
        "sets": sets,
        "reps": "8",
        "rest_seconds": None,
        "tempo": None,
        "load_kind": "absolute",
        "load_value": "",
        "superset_group": group,
        "round_rest_seconds": round_rest,
    }


def test_deploy_persists_a_superset_and_reads_it_back():
    # Arrange — a fresh Protocol; group Week 1 into a two-member Superset (both members
    # reuse the seeded Back Squat id — enough to exercise the grouping round-trip)
    h = build_harness(generator=FakeProtocolGenerator(result=_kg_protocol()))
    protocol = _fresh_protocol(h, "user_superset")
    protocol_id = protocol["id"]
    exercise_id = protocol["sessions"][0]["prescriptions"][0]["exercise_id"]

    body = _deploy_body(protocol)
    body["sessions"][0]["prescriptions"] = [
        _superset_member(exercise_id, sets=3, group="1", round_rest=120),
        _superset_member(exercise_id, sets=3, group="1", round_rest=120),
    ]

    # Act
    response = h.client.post(
        f"/api/protocols/{protocol_id}/deploy",
        headers=h.auth("user_superset"),
        json=body,
    )

    # Assert — deploy succeeds, and a fresh read shows the same Superset on both members
    assert response.status_code == 200
    after = h.fetch_protocol("user_superset", protocol_id).json()["data"]
    week_one = after["sessions"][0]["prescriptions"]
    assert [p["superset_group"] for p in week_one] == ["1", "1"]
    assert [p["round_rest_seconds"] for p in week_one] == [120, 120]


def test_deploy_hard_rejects_an_uneven_superset_and_persists_nothing():
    # Arrange — a fresh Protocol; group Week 1 into a Superset whose members disagree
    # on set count (ragged rounds), which the shared validator forbids (ADR-0023)
    h = build_harness(generator=FakeProtocolGenerator(result=_kg_protocol()))
    protocol = _fresh_protocol(h, "user_uneven")
    protocol_id = protocol["id"]
    exercise_id = protocol["sessions"][0]["prescriptions"][0]["exercise_id"]

    body = _deploy_body(protocol)
    body["sessions"][0]["prescriptions"] = [
        _superset_member(exercise_id, sets=3, group="1", round_rest=120),
        _superset_member(exercise_id, sets=4, group="1", round_rest=120),
    ]

    # Act
    response = h.client.post(
        f"/api/protocols/{protocol_id}/deploy",
        headers=h.auth("user_uneven"),
        json=body,
    )

    # Assert — hard-rejected with the located Superset error; nothing persisted
    assert response.status_code == 422
    errors = response.json()["errors"]
    offending = next(e for e in errors if e["code"] == "superset_uneven_sets")
    assert offending["session_id"] == protocol["sessions"][0]["session_id"]
    after = h.fetch_protocol("user_uneven", protocol_id).json()["data"]
    assert len(after["sessions"][0]["prescriptions"]) == 1
    assert after["sessions"][0]["prescriptions"][0]["superset_group"] is None


def test_deploy_hard_rejects_a_lone_member_superset():
    # Arrange — a single Prescription carrying a group tag (a Superset needs 2+)
    h = build_harness(generator=FakeProtocolGenerator(result=_kg_protocol()))
    protocol = _fresh_protocol(h, "user_lone")
    protocol_id = protocol["id"]
    exercise_id = protocol["sessions"][0]["prescriptions"][0]["exercise_id"]

    body = _deploy_body(protocol)
    body["sessions"][0]["prescriptions"] = [
        _superset_member(exercise_id, sets=3, group="1", round_rest=120),
    ]

    # Act
    response = h.client.post(
        f"/api/protocols/{protocol_id}/deploy",
        headers=h.auth("user_lone"),
        json=body,
    )

    # Assert — rejected with the lone-member code
    assert response.status_code == 422
    assert "superset_lone_member" in [e["code"] for e in response.json()["errors"]]


def test_deploy_hard_rejects_a_superset_for_a_sensitive_constraint_user():
    # Arrange — a user carrying a Sensitive Constraint (injury) deploys a
    # *structurally valid* Superset. Supersets compress rest and raise intensity, so
    # this is a safety hard-block of the same class as the cache bypass (ADR-0023):
    # rejected at the shared validator seam, not merely discouraged in a prompt.
    profiles = InMemoryProfileRepository()
    profiles.update("user_injured", ProfileUpdate(sensitive_constraints=["injury"]))
    h = build_harness(
        generator=FakeProtocolGenerator(result=_kg_protocol()), profiles=profiles
    )
    protocol = _fresh_protocol(h, "user_injured")
    protocol_id = protocol["id"]
    exercise_id = protocol["sessions"][0]["prescriptions"][0]["exercise_id"]

    body = _deploy_body(protocol)
    body["sessions"][0]["prescriptions"] = [
        _superset_member(exercise_id, sets=3, group="1", round_rest=120),
        _superset_member(exercise_id, sets=3, group="1", round_rest=120),
    ]

    # Act
    response = h.client.post(
        f"/api/protocols/{protocol_id}/deploy",
        headers=h.auth("user_injured"),
        json=body,
    )

    # Assert — hard-rejected with the located forbidden error; nothing persisted
    assert response.status_code == 422
    errors = response.json()["errors"]
    offending = next(
        e
        for e in errors
        if e["code"] == "superset_forbidden_under_sensitive_constraint"
    )
    assert offending["session_id"] == protocol["sessions"][0]["session_id"]
    after = h.fetch_protocol("user_injured", protocol_id).json()["data"]
    assert len(after["sessions"][0]["prescriptions"]) == 1
    assert after["sessions"][0]["prescriptions"][0]["superset_group"] is None


def test_a_non_medical_preference_user_can_still_deploy_a_superset():
    # Arrange — a Preference / Limitation is NOT a Sensitive Constraint (ADR-0023): it
    # must not suppress Supersets. This user carries only a preference and deploys a
    # valid Superset.
    profiles = InMemoryProfileRepository()
    profiles.update("user_pref", ProfileUpdate(preferences=["dislikes overhead work"]))
    h = build_harness(
        generator=FakeProtocolGenerator(result=_kg_protocol()), profiles=profiles
    )
    protocol = _fresh_protocol(h, "user_pref")
    protocol_id = protocol["id"]
    exercise_id = protocol["sessions"][0]["prescriptions"][0]["exercise_id"]

    body = _deploy_body(protocol)
    body["sessions"][0]["prescriptions"] = [
        _superset_member(exercise_id, sets=3, group="1", round_rest=120),
        _superset_member(exercise_id, sets=3, group="1", round_rest=120),
    ]

    # Act
    response = h.client.post(
        f"/api/protocols/{protocol_id}/deploy",
        headers=h.auth("user_pref"),
        json=body,
    )

    # Assert — deploy succeeds; the Superset is persisted intact
    assert response.status_code == 200
    after = h.fetch_protocol("user_pref", protocol_id).json()["data"]
    week_one = after["sessions"][0]["prescriptions"]
    assert [p["superset_group"] for p in week_one] == ["1", "1"]


def test_another_user_cannot_deploy_to_someone_elses_protocol():
    h = build_harness(generator=FakeProtocolGenerator(result=_kg_protocol()))
    protocol = _fresh_protocol(h, "user_owner")
    protocol_id = protocol["id"]
    body = _deploy_body(protocol)

    response = h.client.post(
        f"/api/protocols/{protocol_id}/deploy",
        headers=h.auth("user_intruder"),
        json=body,
    )
    assert response.status_code == 404


# --- Selecting a Progression Scheme through Deploy (ADR-0064, #432) --------------------


def _set_scheme_and_load(body: dict, scheme: str, load_value: str) -> None:
    """Stamp every tail Prescription with a chosen scheme and an absolute Load, so the
    deployed movements carry the selection and have a kilogram axis to step."""

    for session in body["sessions"]:
        for prescription in session["prescriptions"]:
            prescription["scheme"] = scheme
            prescription["load_kind"] = "absolute"
            prescription["load_value"] = load_value


def test_deploy_sets_a_prescription_scheme_and_progresses_by_it():
    # Arrange — a fresh kg Protocol; deploy Greyskull onto every un-performed movement
    h = build_harness(generator=FakeProtocolGenerator(result=_kg_protocol()))
    protocol = _fresh_protocol(h, "user_scheme")
    protocol_id = protocol["id"]
    body = _deploy_body(protocol)
    _set_scheme_and_load(body, "greyskull", "60")

    # Act — deploy the selection
    response = h.client.post(
        f"/api/protocols/{protocol_id}/deploy",
        headers=h.auth("user_scheme"),
        json=body,
    )

    # Assert — the deployed plan carries the chosen scheme on its movements
    assert response.status_code == 200
    deployed = h.fetch_protocol("user_scheme", protocol_id).json()["data"]
    assert deployed["sessions"][0]["prescriptions"][0]["scheme"] == "greyskull"

    # And it progresses by Greyskull, not the default: perform Week 1 hitting the rep
    # floor at HIGH perceived effort — Double Progression would HOLD (its low-effort gate),
    # but Greyskull steps +2.5 kg per session on any hit.
    week_one = deployed["sessions"][0]
    h.logged.create(
        "user_scheme",
        LoggedSessionDraft(
            session_id=week_one["session_id"],
            performed_on=date(2026, 1, 1),
            completion_outcome="completed",
            logged_sets=[
                LoggedSetDraft(
                    exercise_id=week_one["prescriptions"][0]["exercise_id"],
                    quantity=reps_quantity(5),
                    load=parse_load("60 kg").to_dict(),
                    perceived_difficulty=9,
                )
            ],
        ),
    )

    after = h.fetch_protocol("user_scheme", protocol_id).json()["data"]
    assert after["next_session"]["week"] == 2
    assert after["next_session"]["prescriptions"][0]["recommended_load"] == (
        parse_load("62.5 kg").to_dict()
    )


def test_deploy_rejects_an_incompatible_scheme_and_persists_nothing():
    # Arrange — a fresh kg Protocol; try to deploy Greyskull onto a pure-bodyweight
    # movement (no kilogram axis to step), the incompatible (scheme, Load) case
    h = build_harness(generator=FakeProtocolGenerator(result=_kg_protocol()))
    protocol = _fresh_protocol(h, "user_bad_scheme")
    protocol_id = protocol["id"]
    body = _deploy_body(protocol)
    for session in body["sessions"]:
        for prescription in session["prescriptions"]:
            prescription["scheme"] = "greyskull"
            prescription["load_kind"] = "bodyweight"
            prescription["load_value"] = None

    # Act
    response = h.client.post(
        f"/api/protocols/{protocol_id}/deploy",
        headers=h.auth("user_bad_scheme"),
        json=body,
    )

    # Assert — rejected via the standard error envelope, located to the Prescription
    assert response.status_code == 422
    payload = response.json()
    assert payload["success"] is False
    offending = next(e for e in payload["errors"] if e["code"] == "incompatible_scheme")
    assert offending["session_id"] == protocol["sessions"][0]["session_id"]
    assert offending["position"] == 0
    # Nothing persisted: the movement still carries no scheme (the inherited default)
    after = h.fetch_protocol("user_bad_scheme", protocol_id).json()["data"]
    assert after["sessions"][0]["prescriptions"][0]["scheme"] is None


def test_deploy_rejects_an_unknown_scheme_value_at_the_boundary():
    # Arrange — a scheme string outside the closed catalog is a client bug
    h = build_harness(generator=FakeProtocolGenerator(result=_kg_protocol()))
    protocol = _fresh_protocol(h, "user_unknown_scheme")
    protocol_id = protocol["id"]
    body = _deploy_body(protocol)
    _set_scheme_and_load(body, "banana", "60")

    # Act
    response = h.client.post(
        f"/api/protocols/{protocol_id}/deploy",
        headers=h.auth("user_unknown_scheme"),
        json=body,
    )

    # Assert — the request body validator rejects it before the deploy gate
    assert response.status_code == 422
    assert response.json()["success"] is False
