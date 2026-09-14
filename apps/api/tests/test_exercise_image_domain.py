"""Pure image-validation rules for the curator-only Exercise Image (issue #504, ADR-0041).

``validate_image`` is the one place the upload's content-type and size are judged, so the
route stays a thin adapter that maps the verdict to a status (415 unsupported type, 413 too
large). These tests pin the allow-list, the 2 MB ceiling with its exact boundary, and the
type-before-size ordering — the rules are pure, so they are unit-tested here with no I/O."""

from __future__ import annotations

import pytest

from app.domain.exercise_image import (
    ALLOWED_IMAGE_CONTENT_TYPES,
    MAX_IMAGE_BYTES,
    ImageRejection,
    validate_image,
)


@pytest.mark.parametrize("content_type", ["image/jpeg", "image/png", "image/webp"])
def test_accepts_each_allowed_type_within_the_size_ceiling(content_type):
    # Arrange / Act
    verdict = validate_image(content_type, byte_size=1024)

    # Assert — a supported type at a sane size is accepted (no rejection).
    assert verdict is None


def test_the_allow_list_is_exactly_jpeg_png_webp():
    assert ALLOWED_IMAGE_CONTENT_TYPES == frozenset(
        {"image/jpeg", "image/png", "image/webp"}
    )


@pytest.mark.parametrize(
    "content_type",
    ["image/gif", "image/svg+xml", "application/pdf", "text/html", "", "  "],
)
def test_rejects_a_disallowed_content_type_as_unsupported(content_type):
    assert validate_image(content_type, byte_size=1024) is ImageRejection.UNSUPPORTED_TYPE


def test_rejects_a_missing_content_type_as_unsupported():
    assert validate_image(None, byte_size=1024) is ImageRejection.UNSUPPORTED_TYPE


def test_ignores_content_type_parameters_and_casing():
    # A browser may send ``image/JPEG`` or append a charset-style parameter; the media type
    # itself is what matters, so it is normalized before the allow-list check.
    assert validate_image("IMAGE/PNG", byte_size=1024) is None
    assert validate_image("image/jpeg; charset=binary", byte_size=1024) is None


def test_accepts_a_file_exactly_at_the_ceiling():
    # The boundary is inclusive: a file of exactly MAX_IMAGE_BYTES is allowed.
    assert validate_image("image/png", byte_size=MAX_IMAGE_BYTES) is None


def test_rejects_a_file_one_byte_over_the_ceiling_as_too_large():
    assert (
        validate_image("image/png", byte_size=MAX_IMAGE_BYTES + 1)
        is ImageRejection.TOO_LARGE
    )


def test_the_ceiling_is_two_megabytes():
    assert MAX_IMAGE_BYTES == 2 * 1024 * 1024


def test_type_is_judged_before_size():
    # A file that is both the wrong type and oversized is rejected on type first, so the
    # route can answer 415 without having to read the whole oversized body to size it.
    verdict = validate_image("application/zip", byte_size=MAX_IMAGE_BYTES + 1)

    assert verdict is ImageRejection.UNSUPPORTED_TYPE
