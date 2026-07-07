# 0017 — F6 Exercise Detail reinterprets Pulse onto honest per-exercise records

Like F1 (ADR-0008) and F3 (ADR-0011), Pulse's Exercise Detail screen is drawn around
figures the record can't all honestly back: a `PERSONAL BEST` **and** a separate
`EST. 1RM` tile, a `TOTAL LOGS` count, a "top set trend" bar chart with a `+7.5KG`
pill, and an `ADD TO PROTOCOL` primary CTA. F6 keeps Pulse's layout — a stat header
over **SPECS / HISTORY / RECORDS** tabs — but shows **only what the record honestly
supports**, reusing the shipped Estimated-1RM / PR engine (ADR-0010) rather than new
strength logic. The catalog-schema pieces (Execution Steps, muscle emphasis) are
recorded separately in ADR-0015 / ADR-0016; this ADR records the **read-side
reinterpretations and deviations**.

Concretely:

- **One strength figure, not two.** CONTEXT.md defines a **Personal Record** as the
  *highest Estimated 1RM* — explicitly "not merely the heaviest bar ever touched." Pulse's
  two tiles (`PERSONAL BEST` = a load, `EST. 1RM` = an estimate) would either be redundant
  or force the raw-load tile to wear the label the glossary reserves for the PR. So the
  header shows a **single `PERSONAL RECORD`** tile (highest Est. 1RM) beside **`TOTAL
  SETS`** (a Logged-Set count). No "personal best" load tile.
- **Strength surfaces are hidden, never zeroed, for non-absolute exercises.** Estimated 1RM
  exists only for absolute-Load sets in the trustworthy 1–12-rep window (ADR-0010). For a
  bodyweight / qualitative / %-1RM / range exercise there is no PR and no Est. 1RM, so the
  **PR tile and the trend chart are hidden** (TOTAL SETS, which always exists, remains).
  A `0 kg` would be a fabrication.
- **"Top set" is the best Estimated 1RM per session — one yardstick.** Pulse's "top set"
  is undefined. Plotting the best **Est. 1RM per session** makes the trend a literal
  Personal-Record trajectory on the *same* yardstick as the PR tile and the RECORDS tab,
  so the screen tells one strength story instead of three competing "bests". The chart is
  a new bar component over the **last 8 qualifying sessions** (no zero-padding); the pill
  is `latest − oldest` Est. 1RM; one qualifying session shows a single bar and no pill.
- **The three tabs are three non-redundant lenses.** **SPECS** (Execution Steps · muscle
  map · top-set trend), **HISTORY** (every Logged Session of this Exercise — the absorbed
  `/exercises/[id]/progress` list), **RECORDS** (only the PR-setting sets, filtered from
  `detect_personal_records`). Scalar / trajectory / milestone-history of the same Est.-1RM
  yardstick. The standalone `/progress` route is folded into HISTORY and redirected.
- **`ADD TO PROTOCOL` is deferred to F4, not faked.** A Protocol is fully enumerated up
  front (ADR-0001); no "append an Exercise Prescription" operation exists (the only Session
  mutation is Substitution — a *swap*, not an *add*). A real add needs the F4 Protocol-
  Builder mutation model (which Session, what sets/reps/Load, progression + cache
  interaction). F6 ships the read screen complete and renders the CTA as an **honest
  disabled seam** ("arrives with the Protocol Builder"), never a dead or fabricated write.

## Consequences

- The screen matches Pulse's *layout* while diverging from its *dated, load-naïve
  semantics*. A future reader should treat one-strength-tile-not-two, hidden-for-bodyweight,
  top-set-as-Est-1RM, and the disabled `ADD TO PROTOCOL` as **deliberate**, not an
  incomplete port.
- The mock's **hero photo** (the catalog stores no exercise imagery) and **favorite /
  bookmark** control (no favorites concept exists) are likewise omitted as net-new
  capabilities with no honest basis today.
- No new strength logic ships: the PR tile, top-set trend, and RECORDS tab all reuse
  `one_rep_max.py` / `personal_records.py` (ADR-0010). A real `ADD TO PROTOCOL` can layer
  on once F4 exists, without reworking this screen.
