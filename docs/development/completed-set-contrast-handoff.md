# Completed-set contrast — issue #560

Spec: [#560](https://github.com/pierrickmartino/workout-manager/issues/560).
Base: `09bc61cfb2663bcb4bf556de13c82e3fd81e42fb`. Branch: `main`. Model: GPT-6.

The completed SetRow no longer fades its container. Its cyan border treatment
and DONE badge remain; current and upcoming cards retain their existing styling.
No unit tests inspect styling classes. The collapsed Exercise summary button is
a separate control and retains its existing treatment.

## Browser evidence

Run `npm run audit:serve`, then `UI_AUDIT_STATES_ONLY=1 node audit/extra.mjs`
from `apps/web`. Use `UI_AUDIT_OUTPUT` with an existing directory and
`screenshots/` subdirectory to preserve a separate run. The harness completes
the first set through the production UI and measures its prescription and
synthetic previous-attempt notes. The inspector composites foreground and
background through ancestor opacity, resolving browser-supported CSS colours
through an sRGB canvas when needed. This includes Tailwind's `color-mix()`
previous-attempt colour, previously reported as unresolved.

Chromium and WebKit each covered all twelve explicit palettes. Before the fix,
24 cases failed the prescription floor; after it, 24 passed with no runner
failures. Ratios below are rounded only for display; enforcement uses the raw
ratio. Prescription results match in both engines. Previous-attempt results
are shown as Chromium / WebKit where browser colour conversion differs.

| Skin | Mode | Prescription before | Prescription after | Previous after |
| --- | --- | ---: | ---: | ---: |
| PULSE | Dark | 3.94 | 5.52 | 7.68 |
| PULSE | Light | 3.30 | 4.91 | 2.76 |
| Aurora | Dark | 3.83 | 5.31 | 6.28 |
| Aurora | Light | 3.47 | 5.18 | 3.74 / 3.71 |
| Vercel | Dark | 3.55 | 5.08 | 3.12 / 3.16 |
| Vercel | Light | 3.33 | 4.96 | 3.26 / 3.23 |
| Alpine | Dark | 4.23 | 5.76 | 6.11 |
| Alpine | Light | 3.75 | 5.73 | 4.34 |
| Clay | Dark | 4.18 | 5.67 | 5.28 |
| Clay | Light | 3.78 | 5.79 | 4.12 / 4.10 |
| Track | Dark | 4.07 | 5.56 | 5.98 |
| Track | Light | 4.00 | 6.28 | 4.42 / 4.39 |

The prescription note clears 4.5:1 everywhere. Previous-attempt text still fails
in all six light palettes and Vercel Dark; it uses alpha cyan, a separate token
pairing issue. This ticket requires measuring and reporting it, not retuning it.

Raw measurements for this session are in
`/private/tmp/workout-560-{before,after}/states.json.gz`. These temporary files
are not needed to reproduce the checks.

## Validation

Node 24.19.0: focused Live Session and Contrast Floor tests passed (31 tests),
`tsc --noEmit` passed, and the full frontend suite passed (1,290 tests, none
skipped). Browser checks used installed Chromium and WebKit via Playwright.
The behavioural regression check ran red before removing the container fade.

Independent code-review agents checked Standards and Spec against the base
commit, including REVIEW.md. Both reported zero findings. Remaining risk is the
previous-attempt contrast reported above; no review blockers remain.
