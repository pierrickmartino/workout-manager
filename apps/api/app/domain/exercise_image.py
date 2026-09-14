"""Curator-only Exercise Image validation (issue #504, ADR-0041).

The Exercise Image is the one illustration a curator uploads for a movement — the picture the
Enrichment AI is *forbidden* to fabricate, because a misleading generated image is a safety
hazard in an injury/rehab-cautious domain. An upload is admitted only when it is a real image
of a safe type and a sane size, so this module owns those two rules as pure, unit-tested
predicates: the route reads the verdict and maps it to a status (415 unsupported type, 413 too
large), never re-deciding the policy itself."""

from __future__ import annotations

from enum import Enum

# The safe raster types a browser can render without a plugin and that carry no active
# content: JPEG, PNG, WebP. SVG is deliberately excluded — it is XML that can carry script,
# so it is an XSS vector, not a photo of a movement.
ALLOWED_IMAGE_CONTENT_TYPES: frozenset[str] = frozenset(
    {"image/jpeg", "image/png", "image/webp"}
)

# A sane ceiling for a single illustration: 2 MB is generous for a photo yet small enough
# that one upload never bloats the app database (images live in Postgres, ADR-choice Q14a).
MAX_IMAGE_BYTES: int = 2 * 1024 * 1024


class ImageRejection(str, Enum):
    """Why an image upload is refused — each maps to one HTTP status at the route boundary.

    ``UNSUPPORTED_TYPE`` → 415 (the content-type is not in the allow-list); ``TOO_LARGE`` →
    413 (the file exceeds ``MAX_IMAGE_BYTES``)."""

    UNSUPPORTED_TYPE = "unsupported_type"
    TOO_LARGE = "too_large"


def normalize_content_type(content_type: str | None) -> str:
    """Reduce a raw ``Content-Type`` header to its bare media type, lowercased.

    A browser may send parameters (``image/jpeg; charset=binary``) or vary the casing; the
    media type alone decides the allow-list, so strip any ``;``-parameters and casing first.
    Public so the upload route stores the same normalized type it was validated against,
    rather than re-deriving it inline."""

    if not content_type:
        return ""
    return content_type.split(";", 1)[0].strip().lower()


def validate_image(content_type: str | None, byte_size: int) -> ImageRejection | None:
    """Judge one upload's type and size, returning the rejection reason or ``None`` if allowed.

    Type is checked before size on purpose: a wrong-type upload is refused as ``UNSUPPORTED_TYPE``
    regardless of how large it is, so the answer is deterministic when a file is both. The size
    ceiling is inclusive — a file of exactly ``MAX_IMAGE_BYTES`` is accepted; one byte more is
    ``TOO_LARGE``. Pure: no I/O, so it is trivially unit-testable and the route stays a thin
    adapter that only maps the verdict to an HTTP status."""

    if normalize_content_type(content_type) not in ALLOWED_IMAGE_CONTENT_TYPES:
        return ImageRejection.UNSUPPORTED_TYPE
    if byte_size > MAX_IMAGE_BYTES:
        return ImageRejection.TOO_LARGE
    return None


__all__ = [
    "ALLOWED_IMAGE_CONTENT_TYPES",
    "MAX_IMAGE_BYTES",
    "ImageRejection",
    "normalize_content_type",
    "validate_image",
]
