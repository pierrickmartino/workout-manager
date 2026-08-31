"""Behavior of the Data Export endpoint end to end (ADR-0062, issue #418).

Real JWKS verification, the in-memory repositories, and FastAPI wired together offline.
The pure serializer's *shape* is pinned in ``test_export_serializer``; here we assert the
two things only the route owns: **auth-scoping** (a signed-in user downloads their own
data and nothing of anyone else's) and the **download shape** (an attachment with a JSON
content type, deliberately outside the ``{success, data, error}`` envelope)."""

from __future__ import annotations

import csv
import io
from datetime import date

from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.domain.exercise import Provenance
from app.main import create_app
from app.repositories.deps import (
    get_exercise_repository,
    get_logged_session_repository,
    get_metric_entry_repository,
    get_protocol_repository,
    get_session_repository,
)
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.logged_session_repository import (
    InMemoryLoggedSessionRepository,
    LoggedSessionDraft,
    LoggedSetDraft,
)
from app.repositories.metric_entry_repository import (
    InMemoryMetricEntryRepository,
    MetricEntryDraft,
)
from app.repositories.protocol_repository import (
    InMemoryProtocolRepository,
    ProtocolDraft,
    ProtocolSessionDraft,
)
from app.repositories.session_repository import (
    InMemorySessionRepository,
    PrescriptionDraft,
    SessionDraft,
)
from tests.conftest import ISSUER, make_signing_context


class Repos:
    """The shared in-memory repository set, wired so exercise ids resolve across all."""

    def __init__(self) -> None:
        self.exercises = InMemoryExerciseRepository()
        self.protocols = InMemoryProtocolRepository(self.exercises)
        self.sessions = InMemorySessionRepository(self.exercises)
        self.logged = InMemoryLoggedSessionRepository(self.sessions, self.exercises)
        self.metrics = InMemoryMetricEntryRepository()


def build_client(repos: Repos, ctx=None):
    ctx = ctx or make_signing_context()
    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_exercise_repository] = lambda: repos.exercises
    app.dependency_overrides[get_protocol_repository] = lambda: repos.protocols
    app.dependency_overrides[get_session_repository] = lambda: repos.sessions
    app.dependency_overrides[get_logged_session_repository] = lambda: repos.logged
    app.dependency_overrides[get_metric_entry_repository] = lambda: repos.metrics
    return TestClient(app), ctx


def _auth(ctx, sub):
    return {"Authorization": f"Bearer {ctx.mint(sub=sub)}"}


def _seed_user(repos: Repos, user: str, *, name: str) -> int:
    """Give ``user`` one Protocol, one standalone Session, one Logged Session (with an
    absolute-kg Load), and one body metric. Returns the referenced Exercise id."""

    squat = repos.exercises.find_or_create(
        f"Back Squat {name}", provenance=Provenance.CURATED
    )
    repos.protocols.create(
        user,
        ProtocolDraft(
            training_type="strength",
            objective="hypertrophy",
            sessions_per_week=3,
            weeks=4,
            duration_minutes=60,
            name=f"{name} Block",
            sessions=[
                ProtocolSessionDraft(
                    week=1,
                    day=1,
                    prescriptions=[PrescriptionDraft(exercise_id=squat.id, sets=5, reps="5")],
                )
            ],
        ),
    )
    repos.sessions.create(
        user,
        SessionDraft(
            training_type="strength",
            duration_minutes=45,
            prescriptions=[PrescriptionDraft(exercise_id=squat.id, sets=3, reps="8")],
        ),
    )
    repos.logged.create(
        user,
        LoggedSessionDraft(
            session_id=None,
            training_type="strength",
            performed_on=date(2026, 1, 3),
            logged_sets=[
                LoggedSetDraft(
                    exercise_id=squat.id,
                    quantity={"kind": "repetitions", "text": "5", "count": 5},
                    load={"kind": "absolute", "text": "100 kg", "kg": 100.0},
                    body_weight_kg=80.0,
                )
            ],
        ),
    )
    repos.metrics.create(
        user,
        MetricEntryDraft(metric="weight", value=82.5, recorded_on=date(2026, 1, 1), unit="kg"),
    )
    return squat.id


def test_export_requires_authentication():
    # Arrange
    repos = Repos()
    client, _ = build_client(repos)

    # Act — no Authorization header
    response = client.get("/api/export")

    # Assert
    assert response.status_code == 401


def test_export_is_a_json_file_download_not_an_envelope():
    # Arrange
    repos = Repos()
    client, ctx = build_client(repos)
    _seed_user(repos, "user_export_a", name="A")

    # Act
    response = client.get("/api/export", headers=_auth(ctx, "user_export_a"))

    # Assert — a file download: attachment disposition + JSON content type
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    disposition = response.headers["content-disposition"]
    assert "attachment" in disposition
    assert "filename=" in disposition

    body = response.json()
    # NOT the standard envelope — the deliberate ADR-0062 deviation.
    assert "success" not in body
    assert "data" not in body
    assert "error" not in body
    # It is the export document itself, self-describing with canonical units.
    assert body["user_id"] == "user_export_a"
    assert body["units"]["weight"] == "kg"


def test_export_contains_the_users_own_data_in_canonical_kg():
    # Arrange
    repos = Repos()
    client, ctx = build_client(repos)
    squat_id = _seed_user(repos, "user_export_b", name="B")

    # Act
    body = client.get("/api/export", headers=_auth(ctx, "user_export_b")).json()

    # Assert — every owned collection is present and nested faithfully
    assert len(body["protocols"]) == 1
    assert len(body["sessions"]) == 1
    assert len(body["logged_sessions"]) == 1
    assert len(body["metrics"]) == 1
    # The absolute Load comes out in canonical kilograms.
    logged_set = body["logged_sessions"][0]["logged_sets"][0]
    assert logged_set["load"]["kg"] == 100.0
    assert logged_set["body_weight_kg"] == 80.0
    # Self-contained: the referenced Exercise is in the catalog block, nothing dangling.
    exported_ids = {e["id"] for e in body["exercises"]}
    assert squat_id in exported_ids
    referenced = {logged_set["exercise_id"]}
    for protocol in body["protocols"]:
        for session in protocol["sessions"]:
            referenced.update(p["exercise_id"] for p in session["prescriptions"])
    for session in body["sessions"]:
        referenced.update(p["exercise_id"] for p in session["prescriptions"])
    assert referenced <= exported_ids


def test_export_excludes_other_users_data():
    # Arrange — two users each own a full data set
    repos = Repos()
    client, ctx = build_client(repos)
    _seed_user(repos, "user_owner", name="Owner")
    _seed_user(repos, "user_other", name="Other")

    # Act — the owner exports
    body = client.get("/api/export", headers=_auth(ctx, "user_owner")).json()

    # Assert — only the owner's rows, never the other user's
    assert body["user_id"] == "user_owner"
    assert len(body["protocols"]) == 1
    assert body["protocols"][0]["name"] == "Owner Block"
    assert len(body["sessions"]) == 1
    assert len(body["logged_sessions"]) == 1
    # The other user's Exercise (a distinct catalog entry) is never pulled in — the export
    # carries only Exercises the owner's own plans/records reference.
    exported_names = {e["name"] for e in body["exercises"]}
    assert exported_names == {"Back Squat Owner"}


def test_export_of_an_empty_account_is_a_well_formed_empty_document():
    # Arrange — a signed-in user who has created nothing
    repos = Repos()
    client, ctx = build_client(repos)

    # Act
    response = client.get("/api/export", headers=_auth(ctx, "user_empty"))

    # Assert — still a JSON download, with empty collections
    assert response.status_code == 200
    body = response.json()
    assert body["user_id"] == "user_empty"
    assert body["protocols"] == []
    assert body["sessions"] == []
    assert body["logged_sessions"] == []
    assert body["metrics"] == []
    assert body["exercises"] == []


def _csv_rows(response) -> list[dict]:
    return list(csv.DictReader(io.StringIO(response.text)))


def test_csv_export_is_a_csv_file_download_not_an_envelope():
    # Arrange
    repos = Repos()
    client, ctx = build_client(repos)
    _seed_user(repos, "user_csv_a", name="A")

    # Act
    response = client.get(
        "/api/export", params={"format": "csv"}, headers=_auth(ctx, "user_csv_a")
    )

    # Assert — a file download: attachment disposition + CSV content type
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    disposition = response.headers["content-disposition"]
    assert "attachment" in disposition
    assert "filename=" in disposition
    assert ".csv" in disposition
    # NOT the standard envelope — the body is CSV text, not {success, data, error}.
    assert "success" not in response.text
    assert response.text.startswith("logged_session_id,")


def test_csv_export_is_one_row_per_logged_set_in_canonical_kg():
    # Arrange — the seeded user has one Logged Session with one absolute-kg set
    repos = Repos()
    client, ctx = build_client(repos)
    _seed_user(repos, "user_csv_b", name="B")

    # Act
    response = client.get(
        "/api/export", params={"format": "csv"}, headers=_auth(ctx, "user_csv_b")
    )
    rows = _csv_rows(response)

    # Assert — one data row (one Logged Set), weight in canonical kg with a labeled unit
    assert len(rows) == 1
    assert rows[0]["weight_kg"] == "100.0"
    assert rows[0]["weight_unit"] == "kg"
    assert rows[0]["repetitions"] == "5"
    assert rows[0]["body_weight_kg"] == "80.0"


def test_csv_export_excludes_other_users_data():
    # Arrange — two users each own a full data set
    repos = Repos()
    client, ctx = build_client(repos)
    _seed_user(repos, "user_csv_owner", name="Owner")
    _seed_user(repos, "user_csv_other", name="Other")

    # Act — the owner exports CSV
    response = client.get(
        "/api/export", params={"format": "csv"}, headers=_auth(ctx, "user_csv_owner")
    )
    rows = _csv_rows(response)

    # Assert — only the owner's single set, never the other user's Exercise
    assert len(rows) == 1
    assert rows[0]["exercise_name"] == "Back Squat Owner"


def test_csv_export_of_an_empty_account_is_a_header_only_csv():
    # Arrange — a signed-in user who has logged nothing
    repos = Repos()
    client, ctx = build_client(repos)

    # Act
    response = client.get(
        "/api/export", params={"format": "csv"}, headers=_auth(ctx, "user_csv_empty")
    )

    # Assert — a well-formed CSV with the header row and no data rows
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert response.text.startswith("logged_session_id,")
    assert _csv_rows(response) == []


def test_csv_export_requires_authentication():
    # Arrange
    repos = Repos()
    client, _ = build_client(repos)

    # Act — no Authorization header
    response = client.get("/api/export", params={"format": "csv"})

    # Assert
    assert response.status_code == 401


def test_export_rejects_an_unknown_format():
    # Arrange
    repos = Repos()
    client, ctx = build_client(repos)

    # Act — a format the boundary does not accept
    response = client.get(
        "/api/export", params={"format": "xml"}, headers=_auth(ctx, "user_bad_fmt")
    )

    # Assert — validated at the boundary, rejected before any work
    assert response.status_code == 422
