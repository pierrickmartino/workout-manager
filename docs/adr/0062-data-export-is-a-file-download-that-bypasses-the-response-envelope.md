# 0062 — Data export is a file download that bypasses the response envelope

**Status:** accepted

**Export** (CONTEXT.md) lets a user take a portable copy of their own data — owned
**Protocols** and standalone **Sessions**, **Logged Sessions** and **Logged Sets**, body
metrics, and the referenced **Catalog** Exercises — off the platform. Every other endpoint
returns the `{success, data, error}` **response envelope** (`app/envelope.py`), a seam
`REVIEW.md` enforces ("never hand-roll a response shape"). A downloadable file is the one
place that seam does not fit, so we make Export a **deliberate, documented deviation**.

- **Export responds with a file download, not an envelope.** Both the **JSON** and the
  **CSV** are returned as attachments (`Content-Disposition`), with their own content type —
  not wrapped in `{success, data, error}`. A file the user saves is not an API data payload,
  and wrapping it would corrupt it; forcing the envelope here serves nothing.
- **It is synchronous in v1.** The export reads only the requesting user's own rows, a
  bounded set, so it streams from the request path — no Redis/RQ job, unlike AI generation.
- **It is export-only.** The JSON is *shaped* to be re-importable later (faithful, nested,
  self-contained via the referenced Catalog Exercises), but **no import path is built** in
  this slice.
- **Values are canonical kilograms**, regardless of the user's **Weight Unit** — portability
  favours one unambiguous unit over a display preference (CONTEXT.md, Export / Weight Unit).
- **Scope is strictly user-owned.** Export never includes the shared **Generated** cache or
  any other user's data; it is whole-account portability for the user themselves, distinct
  from **Share** (ADR-0057), which hands one plan to another user.

## Considered options

- **Envelope a JSON payload the client turns into a file (rejected for the file itself).**
  Keeps the seam uniform for JSON, but there is no honest way to envelope a **CSV** download,
  so the two formats would take divergent response shapes for one feature — more surprising
  than one clearly-marked exception. A single "export is a download" rule is easier to reason
  about.
- **An asynchronous export job with a later download link (rejected for v1).** Warranted only
  when an export is too large to build in-request; user-owned records are not, and a job adds
  queue, storage, and expiry machinery for no present benefit. Revisit if account sizes grow.
- **Emit weights in the user's Weight Unit (rejected).** Friendlier to a spreadsheet, but bakes
  a display preference into portable data and makes two users' exports incomparable; canonical
  kg with an explicit unit column keeps the data self-describing.

## Consequences

- **The envelope rule gains one named exception.** Reviewers applying `REVIEW.md` will see a
  non-enveloped response in the export route; this ADR is why it is correct, not an oversight.
  The exception is confined to Export — no other endpoint inherits it.
- **CSV grain is one row per Logged Set.** The analysis-friendly flattening picks the Logged
  Set as the natural row; plan and session context ride as columns. The JSON keeps the nested,
  faithful shape.
- **Boundary validation still applies to inputs.** Any query parameters (format, range) are
  validated at the boundary as usual; only the *response* leaves the envelope.
