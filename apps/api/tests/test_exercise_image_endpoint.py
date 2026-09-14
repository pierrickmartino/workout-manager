"""Admin Exercise Image endpoints: upload, delete, and fetch (issue #504, ADR-0041).

``POST /api/exercises/{id}/image`` stores a curator-uploaded image (admin-only), rejecting a
wrong content-type with 415 and an oversized file with 413; ``DELETE …/image`` removes it
(admin-only); ``GET …/image`` serves the bytes with the stored content-type and is readable by
**any** signed-in user (it feeds Exercise Detail), not operator-only. These tests pin the auth
matrix, the 415/413 rejections at the exact size boundary, the round-tripped bytes, the fetch's
readability by a normal user, and that ``GET /{id}`` reports ``has_image`` so the frontend can
choose the uploaded image over the legacy URL. Repositories are injected via dependency
overrides so the suite runs offline."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.domain.exercise import Provenance
from app.domain.exercise_image import MAX_IMAGE_BYTES
from app.main import create_app
from app.repositories.deps import (
    get_exercise_image_repository,
    get_exercise_relationship_repository,
    get_exercise_repository,
)
from app.repositories.exercise_image_repository import (
    InMemoryExerciseImageRepository,
)
from app.repositories.exercise_relationship_repository import (
    InMemoryExerciseRelationshipRepository,
)
from app.repositories.exercise_repository import InMemoryExerciseRepository
from tests.conftest import ISSUER, make_signing_context

PNG = b"\x89PNG\r\n\x1a\n" + bytes(range(200))


def build_client():
    ctx = make_signing_context()
    exercises = InMemoryExerciseRepository()
    relationships = InMemoryExerciseRelationshipRepository(exercises)
    images = InMemoryExerciseImageRepository()
    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_exercise_repository] = lambda: exercises
    app.dependency_overrides[get_exercise_relationship_repository] = (
        lambda: relationships
    )
    app.dependency_overrides[get_exercise_image_repository] = lambda: images
    return TestClient(app), ctx, exercises, images


def _operator(ctx, sub: str = "user_admin"):
    return {
        "Authorization": f"Bearer {ctx.mint(sub=sub, extra_claims={'role': 'admin'})}"
    }


def _normal_user(ctx):
    return {"Authorization": f"Bearer {ctx.mint(sub='user_normal')}"}


def _seed(exercises: InMemoryExerciseRepository):
    return exercises.find_or_create(
        "Walking Lunge",
        provenance=Provenance.AI_GENERATED,
        description="A split-stance stride.",
    )


def _file(data: bytes = PNG, content_type: str = "image/png", name: str = "x.png"):
    return {"file": (name, data, content_type)}


# --- Upload -----------------------------------------------------------------------------


def test_upload_requires_authentication():
    client, _, exercises, images = build_client()
    exercise = _seed(exercises)

    response = client.post(f"/api/exercises/{exercise.id}/image", files=_file())

    assert response.status_code == 401
    assert images.get(exercise.id) is None


def test_upload_rejects_a_verified_non_operator():
    client, ctx, exercises, images = build_client()
    exercise = _seed(exercises)

    response = client.post(
        f"/api/exercises/{exercise.id}/image",
        files=_file(),
        headers=_normal_user(ctx),
    )

    # Fails closed (ADR-0046): nothing is stored.
    assert response.status_code == 403
    assert images.get(exercise.id) is None


def test_upload_stores_the_image_and_returns_the_served_url():
    client, ctx, exercises, images = build_client()
    exercise = _seed(exercises)

    response = client.post(
        f"/api/exercises/{exercise.id}/image",
        files=_file(),
        headers=_operator(ctx, sub="user_curator"),
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["image_url"] == f"/api/exercises/{exercise.id}/image"
    stored = images.get(exercise.id)
    assert stored is not None
    assert stored.content_type == "image/png"
    assert stored.image_bytes == PNG
    assert stored.byte_size == len(PNG)
    assert stored.uploaded_by == "user_curator"


def test_upload_rejects_a_wrong_content_type_with_415():
    client, ctx, exercises, images = build_client()
    exercise = _seed(exercises)

    response = client.post(
        f"/api/exercises/{exercise.id}/image",
        files=_file(data=b"GIF89a", content_type="image/gif", name="x.gif"),
        headers=_operator(ctx),
    )

    assert response.status_code == 415
    assert images.get(exercise.id) is None


def test_upload_rejects_an_oversized_file_with_413():
    client, ctx, exercises, images = build_client()
    exercise = _seed(exercises)

    oversized = b"\x89PNG\r\n\x1a\n" + b"\x00" * (MAX_IMAGE_BYTES + 1)
    response = client.post(
        f"/api/exercises/{exercise.id}/image",
        files=_file(data=oversized),
        headers=_operator(ctx),
    )

    assert response.status_code == 413
    assert images.get(exercise.id) is None


def test_upload_accepts_a_file_exactly_at_the_ceiling():
    client, ctx, exercises, images = build_client()
    exercise = _seed(exercises)

    at_ceiling = b"\x00" * MAX_IMAGE_BYTES
    response = client.post(
        f"/api/exercises/{exercise.id}/image",
        files=_file(data=at_ceiling, content_type="image/webp", name="x.webp"),
        headers=_operator(ctx),
    )

    assert response.status_code == 200
    assert images.get(exercise.id).byte_size == MAX_IMAGE_BYTES


def test_upload_on_a_missing_exercise_returns_404():
    client, ctx, _, images = build_client()

    response = client.post(
        "/api/exercises/9999/image", files=_file(), headers=_operator(ctx)
    )

    assert response.status_code == 404
    assert images.get(9999) is None


def test_re_upload_replaces_the_existing_image():
    client, ctx, exercises, images = build_client()
    exercise = _seed(exercises)
    client.post(
        f"/api/exercises/{exercise.id}/image",
        files=_file(),
        headers=_operator(ctx),
    )

    webp = b"RIFFxxxxWEBPVP8 "
    response = client.post(
        f"/api/exercises/{exercise.id}/image",
        files=_file(data=webp, content_type="image/webp", name="y.webp"),
        headers=_operator(ctx),
    )

    assert response.status_code == 200
    stored = images.get(exercise.id)
    assert stored.content_type == "image/webp"
    assert stored.image_bytes == webp


# --- Delete -----------------------------------------------------------------------------


def test_delete_requires_authentication():
    client, _, exercises, images = build_client()
    exercise = _seed(exercises)
    images.put(
        exercise_id=exercise.id,
        content_type="image/png",
        image_bytes=PNG,
        byte_size=len(PNG),
        uploaded_by="user_admin",
    )

    response = client.delete(f"/api/exercises/{exercise.id}/image")

    assert response.status_code == 401
    assert images.get(exercise.id) is not None


def test_delete_rejects_a_verified_non_operator():
    client, ctx, exercises, images = build_client()
    exercise = _seed(exercises)
    images.put(
        exercise_id=exercise.id,
        content_type="image/png",
        image_bytes=PNG,
        byte_size=len(PNG),
        uploaded_by="user_admin",
    )

    response = client.delete(
        f"/api/exercises/{exercise.id}/image", headers=_normal_user(ctx)
    )

    assert response.status_code == 403
    assert images.get(exercise.id) is not None


def test_delete_removes_the_stored_image():
    client, ctx, exercises, images = build_client()
    exercise = _seed(exercises)
    images.put(
        exercise_id=exercise.id,
        content_type="image/png",
        image_bytes=PNG,
        byte_size=len(PNG),
        uploaded_by="user_admin",
    )

    response = client.delete(
        f"/api/exercises/{exercise.id}/image", headers=_operator(ctx)
    )

    # 200 envelope (not a bodyless 204) so every endpoint stays on the one response shape.
    assert response.status_code == 200
    assert response.json()["data"] == {"id": exercise.id}
    assert images.get(exercise.id) is None


def test_delete_on_a_missing_exercise_returns_404():
    client, ctx, _, _ = build_client()

    response = client.delete("/api/exercises/9999/image", headers=_operator(ctx))

    assert response.status_code == 404


def test_delete_when_no_image_is_a_no_op():
    client, ctx, exercises, _ = build_client()
    exercise = _seed(exercises)

    # The Exercise exists but carries no image; removing "nothing" still succeeds.
    response = client.delete(
        f"/api/exercises/{exercise.id}/image", headers=_operator(ctx)
    )

    assert response.status_code == 200


# --- Fetch ------------------------------------------------------------------------------


def test_fetch_requires_authentication():
    client, _, exercises, images = build_client()
    exercise = _seed(exercises)
    images.put(
        exercise_id=exercise.id,
        content_type="image/png",
        image_bytes=PNG,
        byte_size=len(PNG),
        uploaded_by="user_admin",
    )

    response = client.get(f"/api/exercises/{exercise.id}/image")

    assert response.status_code == 401


def test_fetch_is_readable_by_a_normal_signed_in_user():
    client, ctx, exercises, images = build_client()
    exercise = _seed(exercises)
    images.put(
        exercise_id=exercise.id,
        content_type="image/png",
        image_bytes=PNG,
        byte_size=len(PNG),
        uploaded_by="user_admin",
    )

    # Not operator-only: any signed-in user can read it (it feeds Exercise Detail).
    response = client.get(
        f"/api/exercises/{exercise.id}/image", headers=_normal_user(ctx)
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.content == PNG


def test_fetch_returns_404_when_the_exercise_has_no_image():
    client, ctx, exercises, _ = build_client()
    exercise = _seed(exercises)

    response = client.get(
        f"/api/exercises/{exercise.id}/image", headers=_normal_user(ctx)
    )

    assert response.status_code == 404


def test_fetch_returns_404_for_a_missing_exercise():
    client, ctx, _, _ = build_client()

    response = client.get("/api/exercises/9999/image", headers=_normal_user(ctx))

    assert response.status_code == 404


# --- has_image on the detail ------------------------------------------------------------


def test_detail_reports_has_image_false_when_none_uploaded():
    client, ctx, exercises, _ = build_client()
    exercise = _seed(exercises)

    response = client.get(
        f"/api/exercises/{exercise.id}", headers=_normal_user(ctx)
    )

    assert response.status_code == 200
    assert response.json()["data"]["has_image"] is False


def test_detail_reports_has_image_true_after_upload():
    client, ctx, exercises, _ = build_client()
    exercise = _seed(exercises)
    client.post(
        f"/api/exercises/{exercise.id}/image",
        files=_file(),
        headers=_operator(ctx),
    )

    response = client.get(
        f"/api/exercises/{exercise.id}", headers=_normal_user(ctx)
    )

    assert response.json()["data"]["has_image"] is True
