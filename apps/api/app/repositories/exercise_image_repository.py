"""Persistence seam for the uploaded Exercise Image (issue #504, ADR-0041).

The one image per catalog Exercise a curator uploads. The contract is deliberately tiny:
``put`` **upserts** the single row (a re-upload replaces the previous image), ``get`` reads it
back as a ``StoredImage`` view so a caller serving the bytes never touches the ORM, ``exists``
answers the cheap "is there an image?" question without loading the blob, and ``delete`` removes
it (idempotent). SQLModel-backed and in-memory implementations honor the same contract so the
route tests run offline against the fake."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from sqlmodel import Session, select

from app.db.models import ExerciseImage, _utcnow


@dataclass(frozen=True)
class StoredImage:
    """One uploaded Exercise Image, ready to serve — the ORM never leaves the repository.

    Frozen: a read-back image is settled content the route echoes verbatim (bytes +
    ``content_type``), never mutated in place."""

    exercise_id: int
    content_type: str
    image_bytes: bytes
    byte_size: int
    uploaded_by: str
    uploaded_at: datetime


class ExerciseImageRepository(Protocol):
    def put(
        self,
        *,
        exercise_id: int,
        content_type: str,
        image_bytes: bytes,
        byte_size: int,
        uploaded_by: str,
    ) -> StoredImage:
        """Upsert ``exercise_id``'s single image and return the stored view.

        One image per Exercise: a re-upload replaces the previous bytes, content-type, and
        uploader in place rather than adding a second row."""
        ...

    def get(self, exercise_id: int) -> StoredImage | None:
        """Return ``exercise_id``'s stored image, or ``None`` when it carries none."""
        ...

    def exists(self, exercise_id: int) -> bool:
        """Whether ``exercise_id`` has an uploaded image — a blob-free presence check.

        The Exercise Detail serialization asks this per read to decide the image source, so it
        must not load the (up to 2 MB) bytes just to answer yes/no."""
        ...

    def delete(self, exercise_id: int) -> None:
        """Remove ``exercise_id``'s image. Idempotent: removing a missing image is a no-op."""
        ...


def _view(row: ExerciseImage) -> StoredImage:
    return StoredImage(
        exercise_id=row.exercise_id,
        content_type=row.content_type,
        image_bytes=bytes(row.image_bytes),
        byte_size=row.byte_size,
        uploaded_by=row.uploaded_by,
        uploaded_at=row.uploaded_at,
    )


class SqlExerciseImageRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def put(
        self,
        *,
        exercise_id: int,
        content_type: str,
        image_bytes: bytes,
        byte_size: int,
        uploaded_by: str,
    ) -> StoredImage:
        row = self._session.get(ExerciseImage, exercise_id)
        if row is None:
            row = ExerciseImage(
                exercise_id=exercise_id,
                content_type=content_type,
                image_bytes=image_bytes,
                byte_size=byte_size,
                uploaded_by=uploaded_by,
                uploaded_at=_utcnow(),
            )
        else:
            # Replace the single row's content in place (one image per Exercise) — a fresh
            # upload supersedes the previous bytes, type, uploader, and timestamp.
            row.content_type = content_type
            row.image_bytes = image_bytes
            row.byte_size = byte_size
            row.uploaded_by = uploaded_by
            row.uploaded_at = _utcnow()
        self._session.add(row)
        self._session.commit()
        self._session.refresh(row)
        return _view(row)

    def get(self, exercise_id: int) -> StoredImage | None:
        row = self._session.get(ExerciseImage, exercise_id)
        return _view(row) if row is not None else None

    def exists(self, exercise_id: int) -> bool:
        # Select only the key so the blob is never loaded for a presence check.
        statement = select(ExerciseImage.exercise_id).where(
            ExerciseImage.exercise_id == exercise_id
        )
        return self._session.exec(statement).first() is not None

    def delete(self, exercise_id: int) -> None:
        row = self._session.get(ExerciseImage, exercise_id)
        if row is None:
            return
        self._session.delete(row)
        self._session.commit()


class InMemoryExerciseImageRepository:
    def __init__(self) -> None:
        self._images: dict[int, ExerciseImage] = {}

    def put(
        self,
        *,
        exercise_id: int,
        content_type: str,
        image_bytes: bytes,
        byte_size: int,
        uploaded_by: str,
    ) -> StoredImage:
        row = ExerciseImage(
            exercise_id=exercise_id,
            content_type=content_type,
            image_bytes=image_bytes,
            byte_size=byte_size,
            uploaded_by=uploaded_by,
            uploaded_at=_utcnow(),
        )
        # Upsert: the dict keyed by exercise_id enforces one image per Exercise.
        self._images[exercise_id] = row
        return _view(row)

    def get(self, exercise_id: int) -> StoredImage | None:
        row = self._images.get(exercise_id)
        return _view(row) if row is not None else None

    def exists(self, exercise_id: int) -> bool:
        return exercise_id in self._images

    def delete(self, exercise_id: int) -> None:
        self._images.pop(exercise_id, None)


__all__ = [
    "StoredImage",
    "ExerciseImageRepository",
    "SqlExerciseImageRepository",
    "InMemoryExerciseImageRepository",
]
