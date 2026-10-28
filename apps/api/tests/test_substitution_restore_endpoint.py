"""Substitution re-expresses the Load, keeps the Prescribed Original, and Restore puts
it back (#788, ADR-0143).

Driven through the HTTP seam with in-memory repositories: a barbell movement carrying
an absolute Load and the Greyskull scheme is substituted onto a dumbbell and then a
bodyweight movement, and Restore brings back the very first Exercise, Load and scheme
exactly. Copies of the plan (Duplicate, Share → Redeem) never carry the snapshot."""

from __future__ import annotations

from datetime import date

from app.domain.exercise import Provenance
from app.domain.substitution import RelationKind
from app.repositories.deps import (
    get_logged_session_repository,
    get_profile_repository,
    get_session_repository,
    get_share_link_repository,
)
from app.repositories.logged_session_repository import (
    LoggedSessionDraft,
    LoggedSetDraft,
)
from app.repositories.profile_repository import ProfileUpdate
from app.repositories.share_link_repository import InMemoryShareLinkRepository
from tests.test_substitution_endpoint import _auth, _create_session, build_client

OWNER = "user_restore"
ABSOLUTE_60 = {"kind": "absolute", "text": "60", "kg": 60.0}
CHALLENGING = {"kind": "qualitative", "text": "pick a challenging weight"}
BODYWEIGHT = {"kind": "bodyweight", "text": "bodyweight"}


class Harness:
    """A standalone Session whose last movement is a loaded barbell squat on Greyskull,
    with a dumbbell Alternative and, from that, a bodyweight Alternative in the catalog."""

    def __init__(self) -> None:
        self.client, self.ctx, exercises, relationships = build_client()
        overrides = self.client.app.dependency_overrides
        self.sessions = overrides[get_session_repository]()
        self.logged = overrides[get_logged_session_repository]()
        share_links = InMemoryShareLinkRepository()
        overrides[get_share_link_repository] = lambda: share_links
        overrides[get_profile_repository]().update(
            OWNER, ProfileUpdate(default_equipment=["dumbbell"])
        )
        self.headers = _auth(self.ctx, OWNER)

        barbell = exercises.find_or_create(
            "Barbell Back Squat",
            provenance=Provenance.CURATED,
            required_equipment=["barbell"],
        )
        self.goblet = exercises.find_or_create(
            "Goblet Squat", provenance=Provenance.CURATED, required_equipment=["dumbbell"]
        )
        self.air = exercises.find_or_create(
            "Air Squat", provenance=Provenance.CURATED, required_equipment=[]
        )
        relationships.add(barbell.id, self.goblet.id, RelationKind.ALTERNATIVE)
        relationships.add(self.goblet.id, self.air.id, RelationKind.ALTERNATIVE)

        self.session = _create_session(self.client, self.headers)
        inserted = self._post(
            f"/api/sessions/{self.session['id']}/prescriptions",
            json={
                "exercise_id": barbell.id,
                "sets": 5,
                "reps": "5",
                "rest_seconds": 180,
                "load_kind": "absolute",
                "load_value": "60",
                "note": "brace hard",
            },
        ).json()["data"]
        self.position = inserted["prescriptions"][-1]["position"]
        chosen = self.client.put(
            self._prescription_url("scheme"),
            headers=self.headers,
            json={"scheme": "greyskull"},
        )
        assert chosen.status_code == 200, chosen.json()
        self.original = chosen.json()["data"]["prescriptions"][self.position]

    def _post(self, url: str, **kwargs):
        return self.client.post(url, headers=self.headers, **kwargs)

    def _prescription_url(self, action: str, position: int | None = None) -> str:
        at = self.position if position is None else position
        return f"/api/sessions/{self.session['id']}/prescriptions/{at}/{action}"

    def substitute(self, target_id: int) -> dict:
        response = self._post(
            self._prescription_url("substitute"), json={"target_exercise_id": target_id}
        )
        assert response.status_code == 200, response.json()
        return response.json()["data"]["prescriptions"][self.position]

    def restore(self, position: int | None = None, *, headers=None):
        return self.client.post(
            self._prescription_url("restore", position), headers=headers or self.headers
        )

    def log(self) -> None:
        self.logged.create(
            OWNER,
            LoggedSessionDraft(
                session_id=self.session["id"],
                performed_on=date(2026, 1, 1),
                training_type="strength",
                completion_outcome="completed",
                logged_sets=[
                    LoggedSetDraft(
                        exercise_id=self.session["prescriptions"][0]["exercise_id"]
                    )
                ],
            ),
        )


def test_a_swap_onto_other_equipment_re_expresses_the_load_and_keeps_the_rest():
    harness = Harness()

    swapped = harness.substitute(harness.goblet.id)

    assert swapped["exercise_name"] == "Goblet Squat"
    assert swapped["recommended_load"] == CHALLENGING
    # Greyskull steps a weight axis a qualitative Load does not have.
    assert swapped["scheme"] is None
    assert (swapped["sets"], swapped["reps"], swapped["rest_seconds"]) == (5, "5", 180)
    assert swapped["note"] == "brace hard"


def test_a_read_names_the_prescribed_original_but_never_exposes_its_load():
    harness = Harness()
    assert harness.original["prescribed_original"] is None

    harness.substitute(harness.goblet.id)
    read = harness.client.get(
        f"/api/sessions/{harness.session['id']}", headers=harness.headers
    ).json()["data"]["prescriptions"][harness.position]

    assert read["prescribed_original"] == {"exercise_name": "Barbell Back Squat"}
    assert "60" not in repr(read["prescribed_original"])


def test_swap_twice_then_restore_round_trips_the_first_exercise_load_and_scheme():
    harness = Harness()
    harness.substitute(harness.goblet.id)
    second = harness.substitute(harness.air.id)
    assert second["recommended_load"] == BODYWEIGHT
    assert second["prescribed_original"] == {"exercise_name": "Barbell Back Squat"}

    response = harness.restore()

    assert response.status_code == 200, response.json()
    body = response.json()
    assert body["success"] is True
    restored = body["data"]["prescriptions"][harness.position]
    assert restored == harness.original


def test_restore_without_a_held_snapshot_is_a_conflict():
    harness = Harness()

    response = harness.restore()

    assert response.status_code == 409
    assert response.json()["success"] is False


def test_restore_twice_is_a_conflict_the_second_time():
    harness = Harness()
    harness.substitute(harness.goblet.id)
    assert harness.restore().status_code == 200

    assert harness.restore().status_code == 409


def test_restore_on_an_unowned_session_or_absent_position_is_not_found():
    harness = Harness()
    harness.substitute(harness.goblet.id)

    intruder = harness.restore(headers=_auth(harness.ctx, "user_intruder"))
    absent = harness.restore(position=99)

    assert intruder.status_code == 404
    assert absent.status_code == 404
    assert harness.restore().status_code == 200


def test_restore_on_a_performed_protocol_session_is_a_conflict():
    harness = Harness()
    harness.substitute(harness.goblet.id)
    harness.sessions._sessions[harness.session["id"]].protocol_id = 7
    harness.log()

    response = harness.restore()

    assert response.status_code == 409
    assert response.json()["success"] is False


def test_a_duplicate_of_a_substituted_session_carries_no_snapshot():
    harness = Harness()
    harness.substitute(harness.goblet.id)

    copy = harness._post(f"/api/sessions/{harness.session['id']}/duplicate").json()[
        "data"
    ]

    copied = copy["prescriptions"][harness.position]
    assert copied["exercise_name"] == "Goblet Squat"
    assert copied["prescribed_original"] is None


def test_a_redeemed_share_of_a_substituted_session_carries_no_snapshot():
    harness = Harness()
    harness.substitute(harness.goblet.id)
    token = harness._post(f"/api/sessions/{harness.session['id']}/share").json()[
        "data"
    ]["token"]

    redeemed = harness.client.post(
        f"/api/shares/{token}/redeem", headers=_auth(harness.ctx, "user_recipient")
    )

    assert redeemed.status_code == 200, redeemed.json()
    copied = redeemed.json()["data"]["prescriptions"][harness.position]
    assert copied["exercise_name"] == "Goblet Squat"
    assert copied["prescribed_original"] is None


def _edit_body(prescriptions: list[dict]) -> dict:
    """An Edit payload echoing the read plan, one wire body per Prescription."""

    return {
        "training_type": "strength",
        "prescriptions": [
            {
                "exercise_id": p["exercise_id"],
                "sets": p["sets"],
                "reps": p["reps"],
                "rest_seconds": p["rest_seconds"],
                "load_kind": (p["recommended_load"] or {}).get("kind", "absolute"),
                "load_value": (p["recommended_load"] or {}).get("text", ""),
            }
            for p in prescriptions
        ],
    }


def _edit(harness: Harness, body: dict):
    return harness.client.put(
        f"/api/sessions/{harness.session['id']}/plan", headers=harness.headers, json=body
    )


def _read_plan(harness: Harness) -> list[dict]:
    return harness.client.get(
        f"/api/sessions/{harness.session['id']}", headers=harness.headers
    ).json()["data"]["prescriptions"]


def test_an_edit_that_keeps_the_substitute_keeps_the_prescribed_original():
    harness = Harness()
    harness.substitute(harness.goblet.id)
    body = _edit_body(_read_plan(harness))
    body["prescriptions"][harness.position]["sets"] = 4

    response = _edit(harness, body)

    assert response.status_code == 200, response.json()
    edited = response.json()["data"]["prescriptions"][harness.position]
    assert edited["sets"] == 4
    assert edited["prescribed_original"] == {"exercise_name": "Barbell Back Squat"}
    restored = harness.restore()
    assert restored.status_code == 200, restored.json()
    assert (
        restored.json()["data"]["prescriptions"][harness.position]["exercise_name"]
        == "Barbell Back Squat"
    )


def test_an_edit_that_changes_the_substituted_exercise_drops_the_prescribed_original():
    harness = Harness()
    harness.substitute(harness.goblet.id)
    body = _edit_body(_read_plan(harness))
    body["prescriptions"][harness.position]["exercise_id"] = harness.air.id

    response = _edit(harness, body)

    assert response.status_code == 200, response.json()
    edited = response.json()["data"]["prescriptions"][harness.position]
    assert edited["exercise_name"] == "Air Squat"
    assert edited["prescribed_original"] is None
    assert harness.restore().status_code == 409
