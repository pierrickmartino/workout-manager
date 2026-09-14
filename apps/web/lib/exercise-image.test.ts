import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  resolveExerciseImageSrc,
  validateImageUpload,
} from "./exercise-image.ts";

// `resolveExerciseImageSrc` decides which picture the Exercise Image shows: the
// curator-uploaded image (served by the API) is preferred, else the legacy curated
// URL, else nothing — so a movement with no picture renders no broken image.

test("prefers the uploaded image when one exists", () => {
  // Arrange — an Exercise with an uploaded image AND a legacy URL
  const src = resolveExerciseImageSrc({
    id: 7,
    has_image: true,
    image: "https://cdn.example.com/legacy.png",
  });

  // Assert — the uploaded image (served by the API) wins over the legacy URL
  assert.equal(src, "/api/exercises/7/image");
});

test("falls back to the legacy URL when no image is uploaded", () => {
  const src = resolveExerciseImageSrc({
    id: 7,
    has_image: false,
    image: "https://cdn.example.com/legacy.png",
  });

  assert.equal(src, "https://cdn.example.com/legacy.png");
});

test("returns null when there is neither an uploaded image nor a legacy URL", () => {
  const src = resolveExerciseImageSrc({ id: 7, has_image: false, image: null });

  assert.equal(src, null);
});

test("treats a blank legacy URL as no image", () => {
  // A whitespace-only legacy value is not a real reference, so it never becomes a src.
  const src = resolveExerciseImageSrc({ id: 7, has_image: false, image: "   " });

  assert.equal(src, null);
});

test("prefers the uploaded image even when the legacy URL is blank", () => {
  const src = resolveExerciseImageSrc({ id: 42, has_image: true, image: null });

  assert.equal(src, "/api/exercises/42/image");
});

// `validateImageUpload` is the client-side twin of the backend's `validate_image`
// (415/413): it spares an obviously-bad round trip and gives the editor an inline
// message. The backend re-validates and stays the real gate.

test("accepts each allowed image type within the size ceiling", () => {
  for (const type of ALLOWED_IMAGE_TYPES) {
    assert.equal(validateImageUpload({ type, size: 1024 }), null);
  }
});

test("the allow-list is exactly JPEG, PNG, and WebP", () => {
  assert.deepEqual(
    [...ALLOWED_IMAGE_TYPES].sort(),
    ["image/jpeg", "image/png", "image/webp"],
  );
});

test("rejects a disallowed content type with a message", () => {
  const message = validateImageUpload({ type: "image/gif", size: 1024 });

  assert.ok(message);
  assert.match(message, /JPEG|PNG|WebP/);
});

test("ignores casing and parameters on the content type", () => {
  assert.equal(validateImageUpload({ type: "IMAGE/PNG", size: 1024 }), null);
  assert.equal(
    validateImageUpload({ type: "image/jpeg; charset=binary", size: 1024 }),
    null,
  );
});

test("accepts a file exactly at the ceiling", () => {
  assert.equal(
    validateImageUpload({ type: "image/png", size: MAX_IMAGE_BYTES }),
    null,
  );
});

test("rejects a file one byte over the ceiling with a message", () => {
  const message = validateImageUpload({
    type: "image/png",
    size: MAX_IMAGE_BYTES + 1,
  });

  assert.ok(message);
  assert.match(message, /2 MB|too large|smaller/i);
});

test("the ceiling is two megabytes", () => {
  assert.equal(MAX_IMAGE_BYTES, 2 * 1024 * 1024);
});

test("judges type before size", () => {
  // A wrong-type, oversized file is rejected on type first, mirroring the backend.
  const message = validateImageUpload({
    type: "application/zip",
    size: MAX_IMAGE_BYTES + 1,
  });

  assert.ok(message);
  assert.match(message, /JPEG|PNG|WebP/);
});
