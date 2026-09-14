"""Curator Exercise Image endpoints: upload, delete, serve (issue #504, ADR-0041).

The admin uploads a curated illustration for a movement, replaces it, or removes it — the
curator-only picture the Enrichment AI is forbidden to fabricate. These three routes live in
their own module (rather than swelling ``exercises.py`` past the file-size ceiling): the write
paths are admin-gated (``require_admin``), while the fetch is readable by any signed-in user
because it feeds Exercise Detail for everyone. The ``has_image`` flag on the detail payload —
which decides whether the frontend serves the uploaded image or the legacy URL — lives with the
serializer in ``exercises.py``."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile

from app.auth.dependencies import get_current_user, require_admin
from app.domain.exercise_image import (
    ImageRejection,
    normalize_content_type,
    validate_image,
)
from app.envelope import success_envelope
from app.repositories.deps import (
    get_exercise_image_repository,
    get_exercise_repository,
)
from app.repositories.exercise_image_repository import ExerciseImageRepository
from app.repositories.exercise_repository import ExerciseRepository

router = APIRouter(prefix="/api", tags=["exercises"])

HTTP_NOT_FOUND = 404
HTTP_PAYLOAD_TOO_LARGE = 413
HTTP_UNSUPPORTED_MEDIA_TYPE = 415

# The rejection reason → HTTP status the upload answers with. Wrong type is a 415, an
# oversized file a 413 — the two rules the pure ``validate_image`` helper enforces.
_IMAGE_REJECTION_STATUS: dict[ImageRejection, int] = {
    ImageRejection.UNSUPPORTED_TYPE: HTTP_UNSUPPORTED_MEDIA_TYPE,
    ImageRejection.TOO_LARGE: HTTP_PAYLOAD_TOO_LARGE,
}


def _image_url(exercise_id: int) -> str:
    """The served path the frontend points an ``<img>`` at once an image exists."""

    return f"/api/exercises/{exercise_id}/image"


@router.post("/exercises/{exercise_id}/image")
async def upload_exercise_image(
    exercise_id: int,
    file: UploadFile = File(...),
    operator: str = Depends(require_admin),
    exercises: ExerciseRepository = Depends(get_exercise_repository),
    images: ExerciseImageRepository = Depends(get_exercise_image_repository),
) -> dict:
    """Upload (or replace) one Catalog Exercise's curator-only image (issue #504, ADR-0041).

    Operator-only (``require_admin``, ADR-0046): the image is a curated illustration the
    Enrichment AI is forbidden to fabricate, so only an admin sets it. The bytes, content-type,
    size, uploader, and timestamp are stored in the app database, one image per Exercise — a
    re-upload replaces the previous one. The upload is admitted only through the pure
    ``validate_image`` guard, applied to the multipart-declared content-type and size **before**
    the body is materialized: a disallowed content-type is a ``415`` and an oversized file a
    ``413`` (nothing is read into memory or stored on either), and a missing Exercise is a
    ``404`` resolved first. On success returns the served image URL via the standard envelope.
    """

    exercise = exercises.get(exercise_id)
    if exercise is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail="Exercise not found")

    # Judge type and the declared size before reading, so a wrong-type or oversized upload is
    # refused without pulling its (up to 2 MB) body into memory. ``UploadFile.size`` is the byte
    # count the multipart parser measured for this part.
    rejection = validate_image(file.content_type, file.size or 0)
    if rejection is not None:
        raise HTTPException(
            status_code=_IMAGE_REJECTION_STATUS[rejection],
            detail=(
                "Unsupported image type."
                if rejection is ImageRejection.UNSUPPORTED_TYPE
                else "Image is too large."
            ),
        )

    data = await file.read()
    images.put(
        exercise_id=exercise_id,
        # Validated above; store the same normalized media type the fetch echoes back.
        content_type=normalize_content_type(file.content_type),
        image_bytes=data,
        byte_size=len(data),
        uploaded_by=operator,
    )
    return success_envelope({"image_url": _image_url(exercise_id)})


@router.delete("/exercises/{exercise_id}/image")
def delete_exercise_image(
    exercise_id: int,
    _operator: str = Depends(require_admin),
    exercises: ExerciseRepository = Depends(get_exercise_repository),
    images: ExerciseImageRepository = Depends(get_exercise_image_repository),
) -> dict:
    """Remove one Catalog Exercise's uploaded image (issue #504, ADR-0041).

    Operator-only (``require_admin``, ADR-0046). A missing Exercise is a ``404``; otherwise the
    stored image is removed and the endpoint returns the standard envelope carrying the cleared
    Exercise's id. Returning the envelope (rather than a bodyless 204) keeps every endpoint on
    the one response shape (CLAUDE.md) and lets the JSON transport seam unwrap it like any other
    write. The delete is idempotent — removing an image from an Exercise that carries none still
    succeeds — and the legacy ``image`` URL string on the Exercise is left untouched (this only
    clears the uploaded bytes)."""

    exercise = exercises.get(exercise_id)
    if exercise is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail="Exercise not found")
    images.delete(exercise_id)
    return success_envelope({"id": exercise_id})


@router.get("/exercises/{exercise_id}/image")
def fetch_exercise_image(
    exercise_id: int,
    _: str = Depends(get_current_user),
    images: ExerciseImageRepository = Depends(get_exercise_image_repository),
) -> Response:
    """Serve one Catalog Exercise's uploaded image bytes (issue #504, ADR-0041).

    Readable by **any** signed-in user — not operator-only — because it feeds Exercise Detail
    for every user, not just admins (spec §5). Returns the raw bytes with the stored
    content-type; an Exercise with no uploaded image is a ``404`` (the frontend then falls back
    to the legacy ``image`` URL, or shows nothing — never a broken image)."""

    stored = images.get(exercise_id)
    if stored is None:
        raise HTTPException(
            status_code=HTTP_NOT_FOUND, detail="Exercise image not found"
        )
    return Response(content=stored.image_bytes, media_type=stored.content_type)
