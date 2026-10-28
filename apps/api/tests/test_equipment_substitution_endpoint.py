"""Equipment Substitution preview and apply (#791, ADR-0143).

From the Session page a user states the Available Equipment they have; the preview lists
every Exercise Prescription that equipment blocks (with its catalog substitute or a
"will be generated" marker) without calling the AI or writing anything, and apply runs the
existing Substitution once per selected position, independently. Driven through the HTTP
seam with in-memory repositories and a recording fake substitute generator."""

from __future__ import annotations

from datetime import date

from app.domain.exercise import Provenance
from app.domain.substitution import RelationKind
from app.generation.generator import GenerationError
from app.generation.schema import GeneratedSubstitute
from app.generation.substitute_generator import SubstituteRequest
from app.repositories.deps import (
    get_logged_session_repository,
    get_profile_repository,
    get_session_repository,
)
from app.repositories.logged_session_repository import (
    LoggedSessionDraft,
    LoggedSetDraft,
)
from app.repositories.profile_repository import ProfileUpdate
from tests.test_substitution_endpoint import _auth, _create_session, build_client

OWNER = "user_equipment_substitution"
BENCH_POSITION = 2
ROW_POSITION = 3
CHALLENGING = {"kind": "qualitative", "text": "pick a challenging weight"}


class RecordingSubstituteGenerator:
    """Invents a substitute per request, or raises for an original named in ``failing``."""

    def __init__(self, failing: frozenset[str] = frozenset()) -> None:
        self.requests: list[SubstituteRequest] = []
        self._failing = failing

    def generate(self, request: SubstituteRequest) -> GeneratedSubstitute:
        self.requests.append(request)
        if request.original_name in self._failing:
            raise GenerationError("malformed substitute")
        return GeneratedSubstitute(
            exercise_name=f"Band {request.original_name}",
            targeted_muscles=["lats"],
            primary_muscles=["lats"],
            required_equipment=["resistance band"],
        )


class Harness:
    """A standalone Session: two generated movements that need no equipment (positions 0, 1),
    then a barbell bench press with a bodyweight catalog Alternative (position 2) and a
    barbell row the catalog has nothing for (position 3). Default Equipment: barbell, bench."""

    def __init__(self, failing: frozenset[str] = frozenset()) -> None:
        self.generator = RecordingSubstituteGenerator(failing)
        self.client, self.ctx, self.exercises, relationships = build_client(
            self.generator
        )
        overrides = self.client.app.dependency_overrides
        self.sessions = overrides[get_session_repository]()
        self.logged = overrides[get_logged_session_repository]()
        self.profiles = overrides[get_profile_repository]()
        self.profiles.update(
            OWNER, ProfileUpdate(default_equipment=["barbell", "bench"])
        )
        self.headers = _auth(self.ctx, OWNER)

        bench = self.exercises.find_or_create(
            "Barbell Bench Press",
            provenance=Provenance.CURATED,
            required_equipment=["barbell", "bench"],
        )
        self.push_up = self.exercises.find_or_create(
            "Push-up", provenance=Provenance.CURATED, required_equipment=[]
        )
        relationships.add(bench.id, self.push_up.id, RelationKind.ALTERNATIVE)
        row = self.exercises.find_or_create(
            "Barbell Row",
            provenance=Provenance.CURATED,
            required_equipment=["barbell"],
            primary_muscles=["lats"],
        )

        self.session = _create_session(self.client, self.headers)
        self.bench_id = bench.id
        self.row_id = row.id
        for exercise_id in (bench.id, row.id):
            self.client.post(
                f"{self._url()}/prescriptions",
                headers=self.headers,
                json={
                    "exercise_id": exercise_id,
                    "sets": 4,
                    "reps": "8",
                    "rest_seconds": 120,
                    "load_kind": "absolute",
                    "load_value": "70",
                },
            )

    def _url(self) -> str:
        return f"/api/sessions/{self.session['id']}"

    def preview(self, body=None, headers=None):
        return self.client.post(
            f"{self._url()}/equipment-substitution/preview",
            headers=headers or self.headers,
            json=body,
        )

    def apply(self, body, headers=None):
        return self.client.post(
            f"{self._url()}/equipment-substitution",
            headers=headers or self.headers,
            json=body,
        )

    def read(self) -> dict:
        return self.client.get(self._url(), headers=self.headers).json()["data"]

    def make_protocol_member(self) -> None:
        self.sessions._sessions[self.session["id"]].protocol_id = 1

    def log(self) -> None:
        self.logged.create(
            OWNER,
            LoggedSessionDraft(
                session_id=self.session["id"],
                performed_on=date(2026, 1, 1),
                training_type="strength",
                completion_outcome="completed",
                logged_sets=[LoggedSetDraft(exercise_id=self.bench_id)],
            ),
        )

    def group_as_superset(self, positions: tuple[int, ...]) -> None:
        for row in self.sessions._prescriptions[self.session["id"]]:
            if row.position in positions:
                row.superset_group = "ss1"
                row.round_rest_seconds = 90


# --- Preview ---------------------------------------------------------------------------


def test_preview_lists_every_blocked_prescription_with_its_catalog_substitute():
    harness = Harness()

    response = harness.preview({"available_equipment": ["dumbbell"]})

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"]["rows"] == [
        {
            "position": BENCH_POSITION,
            "exercise_id": harness.bench_id,
            "exercise_name": "Barbell Bench Press",
            "substitute": {"exercise_id": harness.push_up.id, "name": "Push-up"},
            "needs_generation": False,
        },
        {
            "position": ROW_POSITION,
            "exercise_id": harness.row_id,
            "exercise_name": "Barbell Row",
            "substitute": None,
            "needs_generation": True,
        },
    ]


def test_preview_with_omitted_equipment_uses_the_default_equipment():
    harness = Harness()

    response = harness.preview()

    assert response.status_code == 200
    assert response.json()["data"]["rows"] == []


def test_preview_with_bodyweight_only_blocks_every_loaded_movement():
    harness = Harness()

    response = harness.preview({"available_equipment": []})

    positions = [row["position"] for row in response.json()["data"]["rows"]]
    assert positions == [BENCH_POSITION, ROW_POSITION]


def test_preview_makes_zero_generator_calls_and_writes_nothing():
    harness = Harness()
    before = harness.read()

    harness.preview({"available_equipment": []})

    assert harness.generator.requests == []
    assert harness.read() == before
    assert harness.profiles.get_or_create(OWNER).default_equipment == [
        "barbell",
        "bench",
    ]


def test_preview_for_a_user_with_no_profile_creates_none_and_reads_bodyweight_only():
    harness = Harness()
    # The owner never saved a Profile: the stored one from setup is gone.
    harness.profiles._by_user.pop(OWNER)

    response = harness.preview()

    assert response.status_code == 200, response.json()
    blocked = [row["position"] for row in response.json()["data"]["rows"]]
    assert blocked == [BENCH_POSITION, ROW_POSITION]
    assert OWNER not in harness.profiles._by_user


def test_preview_rejects_equipment_outside_the_curated_vocabulary():
    harness = Harness()

    response = harness.preview({"available_equipment": ["hoverboard"]})

    assert response.status_code == 422
    assert response.json()["success"] is False


def test_preview_of_another_users_session_is_not_found():
    harness = Harness()

    response = harness.preview(headers=_auth(harness.ctx, "someone_else"))

    assert response.status_code == 404
    assert response.json()["success"] is False


def test_preview_is_refused_on_a_performed_protocol_session():
    harness = Harness()
    harness.make_protocol_member()
    harness.log()

    response = harness.preview({"available_equipment": []})

    assert response.status_code == 409
    assert response.json()["success"] is False


def test_preview_is_allowed_on_a_performed_standalone_session():
    harness = Harness()
    harness.log()

    response = harness.preview({"available_equipment": []})

    assert response.status_code == 200


def test_constraints_still_filter_the_previewed_catalog_substitute():
    harness = Harness()
    harness.push_up.precautions = ["injury"]
    harness.profiles.update(OWNER, ProfileUpdate(sensitive_constraints=["injury"]))

    response = harness.preview({"available_equipment": []})

    bench_row = response.json()["data"]["rows"][0]
    assert bench_row["substitute"] is None
    assert bench_row["needs_generation"] is True


# --- Apply -----------------------------------------------------------------------------


def test_apply_substitutes_each_selected_position_and_reports_its_source():
    harness = Harness()

    response = harness.apply(
        {"available_equipment": [], "positions": [BENCH_POSITION, ROW_POSITION]}
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["outcomes"] == [
        {
            "position": BENCH_POSITION,
            "status": "substituted",
            "source": "catalog",
            "reason": None,
        },
        {
            "position": ROW_POSITION,
            "status": "substituted",
            "source": "generated",
            "reason": None,
        },
    ]
    bench, row = data["session"]["prescriptions"][BENCH_POSITION:]
    assert bench["exercise_name"] == "Push-up"
    assert bench["recommended_load"]["kind"] == "bodyweight"
    assert bench["prescribed_original"] == {"exercise_name": "Barbell Bench Press"}
    assert row["exercise_name"] == "Band Barbell Row"
    assert row["recommended_load"] == CHALLENGING
    assert (row["sets"], row["reps"], row["rest_seconds"]) == (4, "8", 120)


def test_apply_persists_the_substitutions_and_leaves_other_rows_untouched():
    harness = Harness()
    before = harness.read()["prescriptions"]

    harness.apply({"available_equipment": [], "positions": [BENCH_POSITION]})

    after = harness.read()["prescriptions"]
    assert after[BENCH_POSITION]["exercise_name"] == "Push-up"
    assert after[:BENCH_POSITION] == before[:BENCH_POSITION]
    assert after[ROW_POSITION] == before[ROW_POSITION]
    assert harness.generator.requests == []


def test_apply_sends_the_chosen_equipment_to_the_ai_fallback():
    harness = Harness()

    harness.apply({"available_equipment": ["dumbbell"], "positions": [ROW_POSITION]})

    assert harness.generator.requests[0].available_equipment == ("dumbbell",)


def test_apply_rejects_a_position_that_is_not_blocked_before_anything_runs():
    harness = Harness()
    before = harness.read()

    response = harness.apply(
        {"available_equipment": [], "positions": [ROW_POSITION, 0]}
    )

    assert response.status_code == 422
    assert response.json()["success"] is False
    assert harness.generator.requests == []
    assert harness.read() == before


def test_apply_rejects_an_out_of_range_position():
    harness = Harness()

    response = harness.apply({"available_equipment": [], "positions": [99]})

    assert response.status_code == 422


def test_apply_rejects_an_empty_or_repeated_selection():
    harness = Harness()

    empty = harness.apply({"available_equipment": [], "positions": []})
    repeated = harness.apply(
        {"available_equipment": [], "positions": [ROW_POSITION, ROW_POSITION]}
    )

    assert empty.status_code == 422
    assert repeated.status_code == 422
    assert harness.generator.requests == []


def test_apply_with_partial_failure_persists_the_rest_and_flags_the_failed_row():
    harness = Harness(failing=frozenset({"Barbell Row"}))
    before = harness.read()["prescriptions"][ROW_POSITION]

    response = harness.apply(
        {"available_equipment": [], "positions": [BENCH_POSITION, ROW_POSITION]}
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["outcomes"][1] == {
        "position": ROW_POSITION,
        "status": "failed",
        "source": None,
        "reason": "No alternative found for this equipment.",
    }
    persisted = harness.read()["prescriptions"]
    assert persisted[BENCH_POSITION]["exercise_name"] == "Push-up"
    assert persisted[ROW_POSITION] == before
    assert data["session"]["prescriptions"][ROW_POSITION] == before


def test_apply_is_refused_on_a_performed_protocol_session():
    harness = Harness()
    harness.make_protocol_member()
    harness.log()
    before = harness.read()

    response = harness.apply(
        {"available_equipment": [], "positions": [BENCH_POSITION]}
    )

    assert response.status_code == 409
    assert harness.read() == before


def test_apply_is_allowed_on_an_unperformed_protocol_session():
    harness = Harness()
    harness.make_protocol_member()

    response = harness.apply(
        {"available_equipment": [], "positions": [BENCH_POSITION]}
    )

    assert response.status_code == 200


def test_apply_is_allowed_on_a_performed_standalone_session():
    harness = Harness()
    harness.log()

    response = harness.apply(
        {"available_equipment": [], "positions": [BENCH_POSITION]}
    )

    assert response.status_code == 200


def test_apply_on_another_users_session_is_not_found():
    harness = Harness()

    response = harness.apply(
        {"available_equipment": [], "positions": [BENCH_POSITION]},
        headers=_auth(harness.ctx, "someone_else"),
    )

    assert response.status_code == 404


def test_apply_preserves_superset_grouping():
    harness = Harness()
    harness.group_as_superset((BENCH_POSITION, ROW_POSITION))

    response = harness.apply(
        {"available_equipment": [], "positions": [BENCH_POSITION, ROW_POSITION]}
    )

    bench, row = response.json()["data"]["session"]["prescriptions"][BENCH_POSITION:]
    assert (bench["superset_group"], bench["round_rest_seconds"]) == ("ss1", 90)
    assert (row["superset_group"], row["round_rest_seconds"]) == ("ss1", 90)
    assert [p["position"] for p in harness.read()["prescriptions"]] == [0, 1, 2, 3]


def test_apply_respects_constraints_when_choosing_the_catalog_substitute():
    harness = Harness()
    harness.push_up.precautions = ["injury"]
    harness.profiles.update(OWNER, ProfileUpdate(sensitive_constraints=["injury"]))

    response = harness.apply(
        {"available_equipment": [], "positions": [BENCH_POSITION]}
    )

    data = response.json()["data"]
    assert data["outcomes"][0]["source"] == "generated"
    assert data["session"]["prescriptions"][BENCH_POSITION]["exercise_name"] != (
        "Push-up"
    )
    assert harness.generator.requests[0].constraints == ("injury",)
