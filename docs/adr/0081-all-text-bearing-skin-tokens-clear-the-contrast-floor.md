# 0081 — All text-bearing Skin tokens clear the Contrast Floor

Supersedes ADR-0070's Text-Ramp-only scope, preserving its decision to mechanize
contrast rather than leave it to review. Every ordinary text token (the three
Text Ramp rungs and six Accents) clears every actual Skin surface in both Modes.
Every declared composite pairing clears the same floor: five Accents on their
own dim fills and the on-accent label on the cyan primary-button fill. System
copies are checked independently. on-accent is fill-specific text, not ordinary
text on neutral surfaces. Blue has no dim fill.

The single enforced threshold is **4.6:1**, retaining ADR-0070's margin above WCAG
AA normal text's 4.5:1. Measurements use unrounded ratios and sRGB alpha blending
with 8-bit channel quantization. Failures identify Skin, Mode, text token, fill,
surface and ratio. Unknown colour tokens fail closed: an author must classify
new tokens, and new text/fill conventions must extend the declared registry.
Colour-declaring blocks without a base surface are rejected rather than silently
ignored: overrides must belong to a measurable variant.

ADR-0070 rejected promoting labels to secondary partly because accent overlines
“pass”. That load-bearing claim in its considered-options section is false in
the default Active Skin: PULSE Light cyan on elevated was 3.41:1, and on its own
tint was 2.97:1. This record corrects the premise explicitly; it does not silently
edit away the earlier reasoning. Accents remain outside the Text Ramp but are
under the same Contrast Floor.

## Retuning and evidence

The original audit counted 29 failures (8 flat, 21 composite). #559's complete
matrix found 50 (18 flat, 32 composite): inherited amber/green in five Light
Skins added 20, and PULSE Light's white button label added one. Enforcing 4.6
also catches pairings between 4.5 and 4.6. All are fixed together with the guard
in one commit; no red intermediate commit is introduced.

[Derivation evidence](../development/accent-retuning.json) records all 37 retuned
Accent values, original colours, each Skin's actual three surface values,
original and target HSL lightness, and the minimum resulting ratio. Hold the
original HSL hue and saturation fixed, move lightness in 0.0001 steps toward
higher contrast, round to 8-bit hex, and choose the first value whose flat,
self-tint and (for cyan) button-label pairings all reach 4.6. Dim fills follow
that new colour with their original 0x1f alpha. Each variant is derived once;
System Light copies receive that variant's result. RGB quantization accounts
for sub-degree hue and sub-percentage-point saturation differences in hex.

Light variants darken. Dark variants must **lighten**, an explicit correction to
#561's universal instruction to reduce lightness: darkening cannot fix light
text on dark surfaces. Vercel Dark's retuned cyan is #258aff; its white
on-accent label cannot clear that lighter fill, so that label becomes #000000.
The same white label remains valid in Vercel Light with cyan #005dc9.

PULSE Light reproduces the worked examples: cyan #0891a5 → #066d7d reaches 5.47
on elevated and 4.62 on its tint; green #059669 → #04714f reaches 5.49 and 4.62.
The chip constraint binds before flat text. Darker Light Accents and lighter
Dark Accents reduce the original palette's freedom; that is an accepted cost.

This deliberately conflicts with ADR-0050's visual-identity intent and the
Vercel Skin's literal brand-blue identity. #0070f3 cleared only base by about
0.05–0.11 above AA and failed other surfaces and its chip in both Modes. It is
retuned rather than exempted. Typography, shape and surfaces also carry a Skin's
identity; preserving a literal brand hex cannot override legible text.

## Rejected alternatives

- **Lower tint alpha.** Resolves 15 of the original 21 composite failures, but
  the tightest required alpha is 0.009: a 0.9%-opacity background is not a chip.
  The other six cannot be fixed at any alpha because flat contrast already fails.
- **Opaque chip background tokens.** Fixes all 21 and permits lighter Accents,
  but trades the original estimate of 29 retuned values for roughly 45 new ones,
  widening the surface a future Skin author can get wrong. The completed matrix
  expands the retuning count to 37 without introducing another token family.
- **Separate Accent text and fill families.** Preserves designed fill chroma,
  but adds a parallel token family and migrates roughly 150 call sites.
- **Stop using Accent text on Accent tints.** Mechanically cheapest, but removes
  semantic colour-coding that makes an error alert read as an error.
- **Per-token surface allowlist for Vercel.** Restores the conditional,
  human-maintained exemption ADR-0070 was designed to prevent, and cannot solve
  its chip case anyway.
- **Ancestor fades in the registry.** The registry can check only fades someone
  remembered to declare, giving false assurance about the very bug class that
  motivated this work. Ancestor compositing stays out of this token-only registry
  and remains the browser harness's responsibility.

Perceptual separation of Text Ramp rungs remains a design-review concern; the
mechanized contrast guarantee does not claim to measure that separation.
