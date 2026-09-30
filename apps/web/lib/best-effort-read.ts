// The one seam for a **best-effort read**: a server-side read whose failure the surface is
// already written to survive. The Exercise Detail stat header, ADD TO PROTOCOL's target, the
// Live Session's default rest, the admin audit trail and relationship manager are all of this
// kind — each page comment says so in its own words ("a failed read simply omits the header",
// "simply leaves the control a disabled seam", "the workout is never blocked on it").
//
// Why it is a module rather than an inline unwrap at each of those call sites:
//
//   1. **A best-effort read has three failure shapes and one meaning.** `apiGet` *rejects* on a
//      transport failure or a non-JSON response (a connection reset, an HTML proxy error page)
//      rather than returning an unsuccessful envelope; it returns `success: false` when the
//      backend refused; and it can return `success: true` with a null payload. All three mean
//      "could not read this", and funnelling them here is what lets a page hold one nullable
//      value instead of three branches. `home-review.ts` made this argument for Home's review
//      column first (#576 review) — this generalises it.
//   2. **Parallelising the reads is what makes it load-bearing.** Sequential `await`s fail
//      independently: a rejection takes down the page at that line and nothing after it ran
//      anyway. Inside a `Promise.all` one rejection rejects the whole settle, so collapsing a
//      waterfall without catching the optional reads trades round trips for a page that a
//      flaky bonus read can kill. `settleBestEffort` is that catch, named.
//
// Pure and server-free: the pages fetch, this classifies, and `best-effort-read.test.ts` pins
// the degradation rules without a browser (CLAUDE.md: frontend logic lives in `lib/`).

// The read result this module needs, structurally. `Envelope<T>` itself lives in the
// server-only transport seam (`api.ts`), and naming it here would drag `server-only` into a
// module the tests load directly — the same reason `home-review.ts` declares its own
// `AnalyticsReadResult`.
export interface BestEffortResult<T> {
  readonly success: boolean;
  readonly data: T | null;
}

// Settle an optional read so it can share a `Promise.all` with the page's required read without
// being able to reject it. A rejection becomes `null`, which `bestEffortData` reads as "could
// not read this" — the same as an unsuccessful envelope.
//
// **The discarded error is a deliberate, single-chokepoint swallow, and it costs a signal.**
// Before these reads were parallelised they were uncaught, so a transport failure surfaced as an
// unhandled render error that Next.js logged with a stack. Catching it here trades that for a
// page that survives, which is the whole point of a best-effort read — it is the same trade
// `resolveAppearance` already makes for the Interface Preference (`appearance.ts`) and
// `form-draft-storage` makes for a full quota. It is not logged because `apps/web` has no
// server-side logger and the repo carries no `console.*` in source by convention
// (`.claude/rules/typescript/coding-style.md`); when a logger lands, this one function is where
// every best-effort failure in the app becomes observable in a single edit.
export function settleBestEffort<T>(
  read: Promise<BestEffortResult<T>>,
): Promise<BestEffortResult<T> | null> {
  return read.catch(() => null);
}

// Unwrap a settled best-effort read to its payload, or `null` if there isn't one.
//
// The absence test is deliberately `== null` on `data` rather than a truthiness test: `false`
// (a flag) and `0` (a count) are legitimate payloads, and a best-effort read must not report
// them as unreadable.
export function bestEffortData<T>(
  result: BestEffortResult<T> | null | undefined,
): T | null {
  if (!result || !result.success || result.data == null) return null;
  return result.data;
}
