# 0095 — An image reserves its box before its bytes arrive

The app renders exactly two raw `<img>` elements — the curator-only Exercise
illustration on the Exercise page
([`specs-panel.tsx`](../../apps/web/components/exercise/specs-panel.tsx)) and its
preview in the admin editor
([`AdminExerciseImage.tsx`](../../apps/web/components/AdminExerciseImage.tsx)) — and
both were written the same way:

```tsx
<Card className="overflow-hidden p-0">
  <img src={src} alt={…} className="max-h-80 w-full object-contain" />
</Card>
```

A `max-height` is not a height. Until the bytes land and decode, that box is **zero
tall**, and everything under it sits where the picture will be. On the Exercise page
that is the description, the meta card, the Top-Set Trend, the muscle map and the
whole execution-steps list — all of which jump down by up to 320px, after the page
has been readable long enough for someone to have started reading it. Neither image
carried `loading` either, so an illustration well below the fold competed with the
page's real content for the connection.

Nothing about the picture can fix this. The catalog's images are proxied
(`/api/exercises/{id}/image`) or legacy curated URLs, of unknown and unequal
intrinsic size, which is precisely why `next/image` is not in play here (issue #504:
no remote-image host is configured). So **the box is a property of the layout, not of
the image**, and it is declared once.

## One box, declared in one place

[`lib/illustration-box.ts`](../../apps/web/lib/illustration-box.ts) holds the whole
shape: an aspect ratio (`aspect-[4/3]`), a height cap (`max-h-80`), and the
`width`/`height` pair the `<img>` carries as its ratio hint. The cap is there because
the aspect alone would make the illustration 864px tall in the 72rem wide shell
(ADR-0088).

Past roughly 427px of column — in practice only the wide shell — the cap binds: the
box is then 320px tall rather than 4:3, and the picture letterboxes horizontally
inside it. That costs nothing this ADR is about, because both the aspect and the cap
are lengths known before the image is, so the height is `min(width × 3/4, 320px)` from
the first layout either way. It does mean the ratio hint describes the **uncapped**
box — which is the right one for it to describe, since a hint is what a browser lays
out from before the stylesheet applies, when no cap is yet in play.

[`components/pulse/illustration.tsx`](../../apps/web/components/pulse/illustration.tsx)
is the only thing that reads them. Both surfaces render it, so the admin preview now
shows the curator what a reader will actually see — letterboxing included — instead
of a differently-cropped box at a different cap.

The hint and the aspect are two declarations of one shape, and are only useful while
they agree: a 4:3 box with a 16:9 hint would reserve one shape before the stylesheet
applies and another after, which is the jump this ADR exists to remove.
`illustration-box.test.ts` therefore compares those two directly — the aspect, not the
capped result — and `aspectClassRatio` returns `null`, never a guessed `1`, for a
class it cannot read, so an unreadable utility fails the comparison instead of passing
it vacuously.

## The guard, and what it does not prove

[`lib/image-policy.ts`](../../apps/web/lib/image-policy.ts) sweeps every component
and page and fails a raw `<img>` that declares no `width`, no `height`, or no
`loading`. It reads the JSX through the AST, treats a `{...props}` spread as
declaring nothing (it may or may not carry them), and ignores anything but the
lowercase element, so `<Illustration>` is not the thing being watched — bypassing it
is. The exemption registry is empty, and an entry needs a written reason.

`loading="eager"` passes. The guard asks for the *decision*, not for one answer:
an above-the-fold image should say `eager`, and saying so is the point.

`Illustration` itself only ever says `lazy`, because both of its surfaces sit below
the fold. It is the Exercise illustration's frame, not a general image element, and an
above-the-fold image is not something it should be bent into: such an image declares
its own `width`, `height` and `loading="eager"`, which is exactly what the guard
accepts. Giving `Illustration` an override before any caller needs one would be a prop
with no caller — and the reason to route images through it is the shared *box*, which
a differently-loading image would still want.

What it proves is that the attributes are **declared**, not that the numbers are
right — `width={1} height={1}` on a 4:3 illustration would pass it. That the hint
matches the reserved box is a different question, and it is held by the test above,
which compares the two declarations rather than reading the source.

`decoding` is deliberately outside the guard: it changes when a loaded image paints,
never the space it occupies. The component sets `decoding="async"` anyway, because
there is no reason for either of these to block the main thread.
