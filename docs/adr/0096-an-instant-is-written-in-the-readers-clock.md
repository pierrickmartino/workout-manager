# 0096 — An instant is written in the reader's clock

The admin audit trail stamped each entry with

```tsx
{new Date(entry.created_at).toLocaleString()}
```

in [`app/admin/exercises/[id]/page.tsx`](../../apps/web/app/admin/exercises/%5Bid%5D/page.tsx)
— a Server Component. There is no `"use client"` in that file, so `toLocaleString()`
with no arguments resolved against the **container's** `Intl` defaults: `en-US`, UTC,
a machine in a datacentre. Admins were reading audit entries stamped in nobody's time.

Fixing the output exposed a second fault underneath it, which is the more serious of
the two.

## The moment was wrong before it was formatted

`created_at` is written by the API as `datetime.now(timezone.utc)`, but the column is
`sa.DateTime()` — `TIMESTAMP WITHOUT TIME ZONE`. So the UTC moment comes back out of
Postgres naive, and `.isoformat()` emits `2026-09-30T14:03:22.123456` with no `Z` and
no offset. ECMAScript parses that form as **local time**. A reader in Paris was not
seeing a UTC timestamp rendered in US format; they were seeing a moment shifted two
hours into the past, correctly formatted.

So [`lib/instant.ts`](../../apps/web/lib/instant.ts) owns the reading as well as the
writing. `normalizeApiInstant` treats a missing offset as UTC — assuming UTC is a
reading of *silence*, and a string that states an offset keeps the one it states — and
`parseApiInstant` returns `null`, never `NaN` or `0`, for anything that is not an
instant at all. A trail that renders "1 Jan 1970" for a malformed row has invented a
fact.

This is deliberately separate from
[`date-format.ts`](../../apps/web/lib/date-format.ts), which handles calendar *dates*
(`yyyy-mm-dd`) and is timezone-safe by never constructing a `Date` at all. A date has
no clock; an instant is nothing but one.

## Two renders, on purpose

[`components/pulse/local-instant.tsx`](../../apps/web/components/pulse/local-instant.tsx)
renders the zone-explicit text (`2026-09-30 14:03 UTC`, built from the UTC getters so
it is byte-identical everywhere) on the server and in the first client paint, then
swaps to `toLocaleString(undefined, …)` once mounted.

The first render is not a placeholder. It is a correct reading of the moment that says
which clock it is in, so a reader who sees it before hydration — or with JavaScript
off — is not misled, and so it can never be mistaken for their own time. That it is
identical on both sides is what keeps the swap out of a hydration mismatch, and
`local-instant.test.ts` asserts it by rendering both: the markup the server sends and
the markup the browser produces, compared as parsed elements.

The output is a `<time dateTime>` carrying the normalized, offset-explicit string, so
the machine-readable moment is right regardless of which of the two texts is showing.
A value that cannot be read renders as it came, in no `<time>` at all — there would be
nothing valid to put in `datetime`, and an operator looking at a broken row should see
what the row actually holds.

The year is explicit in the reader's text. An audit trail holds entries from years
back and `Mar 4, 09:05` is not a timestamp. Everything else — ordering, separators,
12- vs 24-hour — is the platform's to decide, because it is the reader's.

## The guard is about the clock, not about locale

[`lib/server-locale-policy.ts`](../../apps/web/lib/server-locale-policy.ts) sweeps
every component and page and fails a module that is **not** a Client Component and
formats a moment against the ambient locale: `toLocaleDateString` or
`toLocaleTimeString` anywhere (they exist only on a `Date`), `Intl.DateTimeFormat`,
and `toLocaleString` when its receiver is a `Date` — written in place, or an
identifier the file bound to one, because naming the `Date` first does not move the
formatting to the reader's machine.

A number's `toLocaleString` is left alone. `level-badge.tsx` renders XP with it from a
Server Component, and a thousands separator resolved in the container is a cosmetic
mismatch; a timestamp resolved there is a wrong moment. Only the second is worth
failing a build over, and a guard that conflated them would have had to carry an
exemption for the first — which would make the registry a list of things the rule does
not really mean. The registry is empty.

The audit that prompted this also suggested memoizing an `Intl.NumberFormat` for the
XP counters. That is a different change — a measured one, about allocation per render,
not about correctness — and it is not made here.

## Rendered in a browser, once

The admin editor was in no audit journey, so the trail row had never been laid out at
320px or at 200% text. The `admin` journey replicates that one row — its markup lives
in a Server Component page, so it is rebuilt from the page's own classes rather than
imported — because the instant is the longest text in it, and the reader's-locale
form is longer than the `toLocaleString()` default it replaced. Both gates are clean
with it added: 0 of 780 at 320px (100% and 200% text) and 0 of 780 at 1440px.
