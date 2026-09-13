# 04 — Exercise Image upload, serve, and remove

**What to build:** An admin uploads a curated **Exercise Image** for a movement, replaces
it, or removes it — the curator-only illustration the Enrichment AI is forbidden to
fabricate (ADR-0041). Uploads are restricted to safe image types and a sane maximum size.
Exercise Detail renders the uploaded image for any signed-in user, preferring an uploaded
image and falling back to the legacy curated URL when none exists.

**Blocked by:** 02 — Edit an Exercise's descriptive fields.

**Status:** ready-for-agent

- [ ] An admin-gated multipart upload endpoint stores the image (bytes + content-type + size + uploader + timestamp) in the app database, one image per Exercise.
- [ ] Wrong content-type is rejected with 415; an oversized file is rejected with 413; the size/type rules are pure, unit-tested helpers.
- [ ] An admin-gated delete endpoint removes the stored image.
- [ ] A fetch-image endpoint returns the bytes with the correct content-type and is readable by any signed-in user (not operator-only).
- [ ] Exercise Detail shows the uploaded image when present, else the legacy URL, else nothing — no broken image.
- [ ] The web app forwards the file as multipart with the Clerk JWT via a single new upload helper in the server-only transport seam; the rest of the seam stays JSON.
- [ ] The editor offers upload, preview, and remove; image-src resolution logic lives in `lib/` with tests.
