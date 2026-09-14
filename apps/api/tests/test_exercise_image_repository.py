"""The uploaded Exercise Image repository (issue #504, ADR-0041).

Pins the contract both the SQLModel-backed and in-memory implementations honor: ``put`` stores
an image and ``get`` reads its bytes / content-type / metadata back; ``put`` again on the same
Exercise *upserts* (one image per Exercise, never a second row); ``exists`` answers presence
without loading the blob; ``get``/``exists`` are scoped per Exercise; and ``delete`` removes the
image and is idempotent. Both implementations run the same parametrized cases so they never
drift."""

from __future__ import annotations

import pytest
from sqlmodel import Session, SQLModel, create_engine

from app.db.models import ExerciseImage  # noqa: F401 - ensure table is registered
from app.repositories.exercise_image_repository import (
    InMemoryExerciseImageRepository,
    SqlExerciseImageRepository,
)

PNG = b"\x89PNG\r\n\x1a\n" + bytes(range(64))
WEBP = b"RIFF\x00\x00\x00\x00WEBPVP8 "


@pytest.fixture()
def sql_repo():
    engine = create_engine("sqlite://")
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield SqlExerciseImageRepository(session)


@pytest.fixture()
def memory_repo():
    return InMemoryExerciseImageRepository()


@pytest.fixture(params=["sql", "memory"])
def repo(request, sql_repo, memory_repo):
    return sql_repo if request.param == "sql" else memory_repo


def test_put_stores_the_image_and_get_reads_it_back(repo):
    repo.put(
        exercise_id=7,
        content_type="image/png",
        image_bytes=PNG,
        byte_size=len(PNG),
        uploaded_by="user_admin",
    )

    stored = repo.get(7)

    assert stored is not None
    assert stored.exercise_id == 7
    assert stored.content_type == "image/png"
    assert stored.image_bytes == PNG
    assert stored.byte_size == len(PNG)
    assert stored.uploaded_by == "user_admin"
    assert stored.uploaded_at is not None


def test_put_returns_the_stored_view(repo):
    stored = repo.put(
        exercise_id=1,
        content_type="image/webp",
        image_bytes=WEBP,
        byte_size=len(WEBP),
        uploaded_by="user_curator",
    )

    assert stored.content_type == "image/webp"
    assert stored.image_bytes == WEBP


def test_put_again_upserts_the_single_image(repo):
    repo.put(
        exercise_id=7,
        content_type="image/png",
        image_bytes=PNG,
        byte_size=len(PNG),
        uploaded_by="user_admin",
    )

    repo.put(
        exercise_id=7,
        content_type="image/webp",
        image_bytes=WEBP,
        byte_size=len(WEBP),
        uploaded_by="user_curator",
    )

    stored = repo.get(7)
    # One image per Exercise: the re-upload replaced the bytes, type, and uploader.
    assert stored.content_type == "image/webp"
    assert stored.image_bytes == WEBP
    assert stored.uploaded_by == "user_curator"


def test_get_returns_none_for_an_exercise_with_no_image(repo):
    assert repo.get(999) is None


def test_exists_reflects_presence(repo):
    assert repo.exists(5) is False

    repo.put(
        exercise_id=5,
        content_type="image/jpeg",
        image_bytes=PNG,
        byte_size=len(PNG),
        uploaded_by="user_admin",
    )

    assert repo.exists(5) is True


def test_get_and_exists_are_scoped_per_exercise(repo):
    repo.put(
        exercise_id=1,
        content_type="image/png",
        image_bytes=PNG,
        byte_size=len(PNG),
        uploaded_by="user_admin",
    )

    assert repo.exists(1) is True
    assert repo.exists(2) is False
    assert repo.get(2) is None


def test_delete_removes_the_image(repo):
    repo.put(
        exercise_id=7,
        content_type="image/png",
        image_bytes=PNG,
        byte_size=len(PNG),
        uploaded_by="user_admin",
    )

    repo.delete(7)

    assert repo.get(7) is None
    assert repo.exists(7) is False


def test_delete_is_idempotent(repo):
    # Deleting an image that was never uploaded is a silent no-op, not an error.
    repo.delete(12345)

    assert repo.get(12345) is None
