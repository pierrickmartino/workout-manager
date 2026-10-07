# 0102 — The browser chrome is the rendered Theme's page colour

`viewport.themeColor` was one hardcoded hex, `#09090b` — PULSE dark's page — while the app
ships 6 Skins × 3 Modes (ADR-0047/0048). In any light Mode, and in any Skin whose page is
not that near-black, the address bar and the iOS standalone status bar sat in a colour the
page does not contain. On a phone in standalone that is a strip of someone else's app above
the content, and it is most wrong exactly where the Skin is most distinctive.

## Resolved per request, not conditioned per Mode

The audit's fix shape was a media-conditioned array covering Mode, with a note that covering
Skin too "means emitting the tag from the resolved theme in the layout". That is what this
does, because the Skin is **already** resolved there: `resolveActiveSkin()` and
`resolveUserMode()` run in `app/layout.tsx` to stamp `data-skin` / `data-mode` on `<html>`,
and both are React-`cache`d, so a second reader in the same request pays nothing.

So the static `viewport` export became `generateViewport()`, which reads the same two values
and asks `lib/theme-color.ts` for the colour. A stamped Mode resolves to one colour. System
Mode — which stamps no `data-mode` precisely so CSS can decide — emits the two
media-conditioned branches instead, so the chrome defers to the device exactly as the page
does. The array is not a fallback for the general case; it is the answer for the one Mode
whose polarity the server genuinely does not know.

## The page colour is restated, and held to the stylesheet

`--color-base` per Skin × polarity lives in `app/globals.css`. It cannot be read from there
at request time — it is a build artifact of the stylesheet, not a module — so
`SKIN_BASE_COLORS` restates all twelve values, and the risk is drift: a re-tuned Skin whose
chrome keeps the old page colour, silently, in one Mode.

`lib/theme-color.test.ts` removes that risk the way `illustration-box.test.ts` does for the
image box — by holding the two declarations to one number. It parses `globals.css` with
`parseColorBlocks`, the same reader the Contrast Floor uses (ADR-0081), and compares every
Skin × Mode. It also checks the System pair against the two blocks a device would actually
resolve: the Skin's dark block for a dark device, and the `prefers-color-scheme: light`
copy for a light one — which globals.css restates because CSS cannot share a block across
`@media`, and which is therefore the value that can drift on its own.

A Skin missing from the registry is a failure rather than a fallback: `skinsMissingBaseColor`
is asserted empty, so adding a seventh Skin to `KNOWN_SKINS` without a page colour fails the
test instead of shipping another Skin's chrome. At runtime an unrecognised id still falls back
to PULSE, matching `resolveActiveSkin`'s own defensive tail — the wire carries a bare string.

## What this does not cover

`apple-mobile-web-app-status-bar-style` stays `black-translucent` (ADR-0028): it takes a
keyword, not a colour, and the translucent setting is what lets the page's own background —
now the same colour as the chrome — show through the status bar. The `themeColor` tag is also
only as good as the device's honouring of it; iOS reads it for the standalone status bar and
Safari's address bar tint, and nothing here can verify that offline. What is verified is that
the colour the tag carries is the colour the stylesheet paints.
