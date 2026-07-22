# 0028 — The web PWA is installable and offline-aware, but caches no authenticated navigation

The web client becomes an installable, offline-aware PWA, but its service worker is
deliberately **network-only for authenticated navigations** — it never writes a rendered
page to the browser's cache. The generic "app shell → Cache First, API data → Network First
with cache fallback" playbook does not fit this app, because under ADR-0022 the browser
**never issues an `/api/*` request**: every read and write is fetched server-side through
`lib/api.ts` with the Clerk JWT attached in Node and `cache: "no-store"`, and the resulting
per-user workout data is rendered *into* the navigation/RSC payload. Caching that payload in
the browser would write one user's private record to disk where the next user of a shared
phone could be served it. So the SW's `no-store` posture on authenticated navigations is the
browser-side continuation of the server-side `no-store` seam, and it is a **safety rule**,
not a performance tuning — the same posture ADR-0003 takes with the safety cache bypass.

## The caching policy is stated in terms of what the browser actually requests

The imported four-row matrix (app shell / API data / images / authed `/api/*`) is re-cast for
this architecture, because two of its rows describe requests the browser never makes:

| What the browser actually requests | Policy | Why |
| --- | --- | --- |
| Static build assets (content-hashed JS/CSS, self-hosted fonts) | **Cache First** | Immutable by hash; the true "app shell" |
| Images (exercise media, icons) | **Stale-While-Revalidate** | Non-private, cheap to revalidate |
| **Authenticated navigations / RSC payloads** | **Network-only, never cached** | The payload embeds per-user record data; this is where the `no-store` rule actually bites |
| Public/unauthed routes (`/offline`, sign-in shell) | **Cache First** | No private data; safe to precache |

The row people expect — "API data → Network First with cache fallback" — is **N/A here**:
there is no browser-side API request to apply it to. The data lives inside the navigation
response, and that response stays uncached.

## What ships now: a minimal installability SW, not the caching layer

Chrome suppresses "Add to Home Screen" unless **all** of HTTPS + a valid manifest + a
registered service worker with a `fetch` handler are present. Fixing the manifest icons is
necessary but not sufficient for Chrome install. So the first SW is intentionally minimal —
hand-rolled (`public/sw.js`) rather than a build plugin — with a `fetch` handler that is
network-only for navigations and serves a static, unauthed `/offline` route on network
failure. Its only precached asset is that offline page. It has **no cache-write path for
navigations at all**, so the safety property above is structural, not configured. This is
also what makes "offline is meaningful UI, never an error page" true in its smallest honest
form: exactly two states, online and the branded offline fallback.

## Consequences

- **"Show cached data immediately with a 'last updated' timestamp + refresh" is rejected,
  not deferred design.** That pattern presumes a client-side copy of the data to repaint
  while revalidating. This app has none: data is server-rendered per navigation and authed
  navigations are uncached. Adopting it would mean reversing `no-store` and introducing
  client-side data fetching (the unused `@tanstack/react-query` dependency). That is a
  different architecture; reopen this only if the app moves to client-side data fetching.
- **A UI data-freshness timestamp is permitted under the calendar-free invariant (ADR-0001).**
  A "synced N minutes ago" label describes a *record's currency*, not a dated schedule or a
  "today" to miss, so it does not conflict with the self-paced/calendar-free model. This is a
  UI concern, so it is recorded here rather than in `CONTEXT.md` (which is a domain glossary).
- **"Repeat-load LCP < 1s once the shell is cached" and field INP are not yet observable.**
  Repeat-load LCP needs the shell-caching SW, which is deferred; field INP needs real-user
  monitoring (a `web-vitals` beacon), which is a separate ticket. Lighthouse runs as a
  **non-blocking** report (`@lhci/cli`, assertions at `warn`) against a mobile/slow-4G
  throttle, with a committed `budgets.json` (LCP, CLS, TBT-as-INP-proxy, byte weight) so the
  targets are version-controlled even where enforcement is soft. Hard-fail gating is deferred
  to avoid flaky reds on shared runners.
- **iOS is not covered by Lighthouse.** Installability and Safari standalone behavior on iOS
  must be verified on a real device each major release; the icon set therefore includes an
  `apple-touch-icon` that the manifest icons do not supply.
- **Manifest icons are split `any` / `maskable`.** A single icon declared `"any maskable"`
  renders the safe-zone-padded artwork on unmasked surfaces too (shrunken with dead space);
  separate entries avoid that.
- **Sign-out cache purge becomes a precondition for the deferred caching layer.** As long as
  the SW caches nothing per-user, there is nothing to purge on Clerk sign-out. The moment a
  future SW caches any authenticated response, purge-on-sign-out stops being optional.

## Considered Options

- **Adopt the generic caching matrix as-is (Cache First shell, Network First API).** Rejected:
  its "API data" rows describe browser requests this architecture never makes, and its shell
  caching would, taken literally on navigations, cache authenticated pages — the exact private
  data leak this ADR exists to prevent.
- **Ship the full caching SW now (Serwist / `next-pwa`).** Rejected for this pass: it is
  build-time machinery for the deferred shell-caching layer, adds a dependency to run a
  ~30-line network-only SW, and tempts a future contributor to enable shell precaching without
  the sign-out-purge analysis. Adopt it deliberately when the caching layer is actually built.
- **Icons-only, no SW.** Rejected: honest but leaves Chrome install suppressed and offline as
  a raw browser error, failing "offline is meaningful UI." The minimal SW is ~30 lines and is
  the difference between installable and not.
- **Enforce Lighthouse budgets as hard CI failures now.** Rejected: lab scores wobble
  run-to-run on shared runners; a flaky red teaches contributors to ignore the gate. Start as a
  reviewed warn-report; tighten to blocking once the numbers are stable and the caching layer
  makes repeat-load LCP measurable.
