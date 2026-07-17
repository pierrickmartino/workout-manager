# 0022 — The web client has one typed HTTP transport seam

Every server-side read and write from the Next.js web client goes through a single
provider-agnostic seam, **`lib/api.ts`** (`apiGet<T>` / `apiSend<T>`), the front-end
twin of the backend's `StructuredLLM` port (ADR-0006). Before this, eleven `lib/*.ts`
data-access modules each re-declared the same four things — the `API_URL` fallback,
the `Envelope<T>` shape, a private `authHeaders()` that attaches the Clerk JWT, and the
`fetch` → `json()` → cast dance — inviting exactly the transport drift ADR-0006 rejected
for the four generators. One seam keeps the transport implemented once; each domain
module keeps only its own paths, methods, and doc-comments.

**The seam returns the raw envelope; the unwrap boundary stays at the caller.**
`apiGet<T>(path)` and `apiSend<T>(path, method, body?)` return `Promise<Envelope<T>>` —
the raw wire shape — and every one of the ~30 call sites keeps its existing
`if (!envelope.success || !envelope.data)` unwrap. This deliberately mirrors
`StructuredLLM.complete` returning raw text rather than a parsed object: the transport
moves bytes, and the `.success`/`.data`/`.error` boundary lives with the caller that
knows what to render, exactly as each generator keeps its own `parse_*`. A future reader
tempted to make `apiGet` unwrap-and-throw would be collapsing that boundary — the raw
envelope is the point, not an oversight.

**A bodyless write omits `Content-Type` on purpose.** `apiSend` attaches
`Content-Type: application/json` and stringifies only when a `body` is passed; a
bodyless call (the POST `.../substitute`) sends neither. This reproduces the pre-refactor
behavior byte-for-byte — there is no content to type — so the absent header is deliberate,
not a missing case.

**The seam is the single server-only chokepoint.** `lib/api.ts` imports Clerk's server
`auth()` and carries an explicit `import "server-only"`, so the JWT attach path can never
leak into the browser bundle — the invariant every one of these modules' comments already
asserts ("the Clerk JWT ... never reaches the browser"), now enforced at one place. The
`*-types` split is unchanged: client components still import server-free types directly.

**Scope stays transport.** The seam owns base-URL prefix, auth, `fetch`, `cache: "no-store"`,
and the envelope cast — nothing more. Path params and query strings stay inline at the
callers that know their semantics (KISS/YAGNI); a params-serializing layer for two
`encodeURIComponent` sites would be speculative generality.

## Considered Options

- **Unwrap-and-throw seam** (`apiGet<T>(path) -> Promise<T>`, throws on `!success`) —
  rejected: cleaner call sites, but it moves the validation boundary *into* the transport,
  rewrites all ~30 consumers, and turns a mechanical de-duplication into a behavioral
  change to failure rendering. Breaks the ADR-0006 symmetry.
- **Catching network/parse failures into a synthetic failure envelope** — rejected for
  this change: a genuine improvement (it would route `fetch` rejections through the same
  friendly `.success === false` UI), but a behavioral change, not extraction. Deferred to
  its own ticket so "zero domain risk" holds literally. `StructuredLLM` likewise *raises*
  on transport failure rather than smuggling it into the return shape.
- **`apiGet` / `apiPost` / `apiPut` triple** — rejected: three writers still duplicate the
  body-vs-bodyless `Content-Type` branch. One `apiSend(path, method, body?)` absorbs all
  four observed shapes (GET, POST+body, bodyless POST, PUT+body) with the branch in one
  place.
