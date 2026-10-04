# PROTOTYPE — throwaway

**Question:** should the Profile view’s Fitness Level section (ADR-0112) show the **Declared**
and **Effective** readings as a *visual position on the 1–10 scale* instead of the bare `6/10`
number pair it ships today?

Four renderings of the same section, on the real `/profile` route, switchable with `?variant=`
and with ← / → (a floating bar at the bottom; never rendered in a production build):

| `?variant=` | Name | The bet it makes |
| --- | --- | --- |
| `0` | Shipped (`6/10`) | The baseline being argued with. |
| `A` | Two-zone rail | Keeps the list. One ten-notch rail per type: neutral to Declared, accent for what the record earned. The figure becomes the *gap*, and a gap is a shape. |
| `B` | Dial grid | Throws the list out. Five gauges in a grid — a dial says “position on a bounded scale” faster than a bar, and a grid is read in one glance. |
| `C` | Comparative ladder | One figure, a shared axis, a column per type. Answers a different question: *where am I strong and where am I not* — the comparison two numbers per row make hardest. Exact levels stay reachable behind a disclosure (ADR-0084’s ruling: a visible table, never `sr-only`). |

A and B drop the numerals from sight entirely (they survive as each row’s accessible readout);
C keeps them one tap away. That difference is part of what’s being judged.

## Running it

Two ways, and the second needs no backend, no Clerk keys and no database:

```bash
# The real page (needs the stack up — see README.md)
npm run dev        # then /profile?variant=A

# Offline, in the audit harness: all three variants stacked in one page
npm run audit:serve   # then http://127.0.0.1:4173/?journey=levels-visual
#                           &skin=pulse|aurora|vercel|alpine|clay|track&mode=dark|light
```

The harness fixture carries the four rows that matter: one with several earned levels, one with
a single earned level, one reading at exactly its declared level (the equal case, which is
stated rather than blank), and one over-long Training Type name that stresses the row’s
`min-w-0 break-words` pairing (ADR-0085).

## What was already checked

`npx tsc --noEmit` and `npm test` (1768 tests — every design guard: accent tint, reflow,
display headings, icon imports, copy typography, field control) pass with the prototype in the
tree. Rendered in Chromium at 320 / 390 / 1440px and at 200% text, in both Pulse dark and Vercel
light: no horizontal overflow, no page errors (`audit/shoot.prototype.mjs`,
`audit/measure.prototype.mjs`, `audit/measure200.prototype.mjs`).

The first draft of C used an `sr-only` table — table layout ignores the 1px width, so it grew
the document to 600px inside a 320px viewport. That is why it is a `<details>` disclosure now.

## Throwing it away

Everything here, plus `lib/fitness-level-visual.prototype.ts`, the `levels-visual` journey and
the three `audit/*.prototype.mjs` scripts, and the `<Suspense>` block in `app/profile/page.tsx`
(revert it to `<FitnessLevelStandings rows={fitnessLevelRows} />`). The winner gets rewritten
properly into `components/pulse/fitness-level-standings.tsx` and its view-model — this code was
written under prototype rules: no tests, no error handling, no abstractions.
