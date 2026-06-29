"""Behavior of the metric-history endpoints end to end: real JWKS verification,
the repository, and the response envelope wired through FastAPI. The repository is
injected via a dependency override so tests run offline.

A user records dated body-metric readings (weight, body-fat, …) and reads the
history back, most recent first and optionally narrowed to one metric. This is the
time series the Fitness Profile snapshot is not — the Profile is never touched."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.main import create_app
from app.repositories.deps import get_metric_entry_repository
from app.repositories.metric_entry_repository import InMemoryMetricEntryRepository
from tests.conftest import ISSUER, make_signing_context


def build_client(ctx=None):
    ctx = ctx or make_signing_context()
    metrics = InMemoryMetricEntryRepository()
    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_metric_entry_repository] = lambda: metrics
    return TestClient(app), ctx


def _auth(ctx, sub):
    return {"Authorization": f"Bearer {ctx.mint(sub=sub)}"}


def test_recording_a_metric_returns_the_envelope_with_the_saved_reading():
    # Arrange
    client, ctx = build_client()

    # Act
    response = client.post(
        "/api/metrics",
        headers=_auth(ctx, "user_a"),
        json={"metric": "weight", "value": 82.5, "unit": "kg",
              "recorded_on": "2026-01-01"},
    )

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["error"] is None
    data = body["data"]
    assert data["id"] is not None
    assert data["metric"] == "weight"
    assert data["value"] == 82.5
    assert data["unit"] == "kg"
    assert data["recorded_on"] == "2026-01-01"


def test_history_reads_back_most_recent_first():
    # Arrange — two weigh-ins on different dates
    client, ctx = build_client()
    headers = _auth(ctx, "user_b")
    client.post("/api/metrics", headers=headers,
                json={"metric": "weight", "value": 82.0, "recorded_on": "2026-01-01"})
    client.post("/api/metrics", headers=headers,
                json={"metric": "weight", "value": 81.0, "recorded_on": "2026-02-01"})

    # Act
    response = client.get("/api/metrics", headers=headers)

    # Assert
    assert response.status_code == 200
    data = response.json()["data"]
    assert [e["recorded_on"] for e in data] == ["2026-02-01", "2026-01-01"]


def test_history_can_be_filtered_by_metric_query_param():
    # Arrange — the user tracks weight and body-fat
    client, ctx = build_client()
    headers = _auth(ctx, "user_c")
    client.post("/api/metrics", headers=headers,
                json={"metric": "weight", "value": 82.0, "recorded_on": "2026-01-01"})
    client.post("/api/metrics", headers=headers,
                json={"metric": "body_fat", "value": 18.0, "recorded_on": "2026-01-01"})

    # Act
    response = client.get("/api/metrics?metric=weight", headers=headers)

    # Assert — only weight comes back
    data = response.json()["data"]
    assert {e["metric"] for e in data} == {"weight"}


def test_a_users_history_is_private_to_them():
    # Arrange — one user records, another reads
    client, ctx = build_client()
    client.post("/api/metrics", headers=_auth(ctx, "user_owner"),
                json={"metric": "weight", "value": 99.0, "recorded_on": "2026-01-01"})

    # Act
    response = client.get("/api/metrics", headers=_auth(ctx, "user_intruder"))

    # Assert — the intruder sees an empty history, not the owner's reading
    assert response.json()["data"] == []


def test_recording_requires_authentication():
    # Arrange
    client, _ = build_client()

    # Act — no Authorization header
    response = client.post(
        "/api/metrics",
        json={"metric": "weight", "value": 82.0, "recorded_on": "2026-01-01"},
    )

    # Assert
    assert response.status_code == 401


def test_a_blank_metric_name_is_rejected():
    # Arrange
    client, ctx = build_client()

    # Act
    response = client.post(
        "/api/metrics",
        headers=_auth(ctx, "user_d"),
        json={"metric": "", "value": 82.0, "recorded_on": "2026-01-01"},
    )

    # Assert — input validation at the boundary, in the standard envelope
    assert response.status_code == 422
    assert response.json()["success"] is False
