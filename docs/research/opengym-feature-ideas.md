# openGym Comparison — Feature Ideas for workout-manager

A read-through of [`arvids-unavailable/openGym`](https://github.com/arvids-unavailable/openGym)
(August 2026), a self-hosted gym & body-weight tracker, mined for features that
**workout-manager** does not yet ship. Each item is a title, a short description,
and an explicit note on how it lands against our load-bearing invariants
(`CLAUDE.md`, `CONTEXT.md`, `docs/adr/`). Where an openGym feature pulls against
an invariant, the item says so — the point is a *conscious* position, not a
silent adoption. Nothing here changes source, ADRs, or `CONTEXT.md`; it is
forward-looking fuel for the issue tracker.

## Framing

workout-manager is already the more sophisticated system: AI generation, the
plan/record separation, read-time projections (XP, Streak, Personal Records),
typed `Load` and `Quantity`, and the two-layer generation cache with
adopt-by-copy. openGym is a simpler, framework-free CRUD tracker over JSON files.
So the value here is **not** its architecture — it is the specific user-facing
features it ships that we lack. Everything below is filtered through that lens.

openGym's own headline feature set: weekly 7-day routine scheduling, 1,324+
searchable exercises with animated demos, guided sessions, supersets, rest
timers, weight pre-population, body-weight charts with goal lines, estimated 1RM,
RIR/RPE effort logging, GitHub-style activity heatmap, muscle-group analysis,
multiple progression systems (linear / Greyskull LP / double / time-based),
bodyweight & timed exercise handling, single-arm per-side logging, screen-wake
control, import from FitNotes/Strong/Hevy/Apple Health, JSON export/import,
shareable routine files (PDF/digital), multi-profile, passkey login, 12-language
i18n, offline + cross-device sync, push notifications, and themes with accent
colors.

---

## 1. Strong fits — recommend

### Data import from other trackers (FitNotes, Strong, Hevy, Apple Health)
openGym's biggest adoption lever, and our biggest missing on-ramp. It maps
cleanly onto **plan-less Logged Sessions** — records with no plan behind them,
which we already model — plus `user_entered` catalog Exercises for movements we
don't know. An importer parses another app's export and writes plan-less Logged
Sessions; XP, Streak, and Personal Records then recompute read-time for free. No
philosophical conflict, and it is the single biggest reason someone switches
trackers.

### Full data export / account portability (JSON)
The natural pair to import, and the honest "you own your data" promise. A one-tap
export of Protocols, Sessions, and the full record. Low risk, high trust.

### Shareable Protocol export (PDF / file)
Export a user's own Protocol as a human-readable PDF or shareable file — distinct
from our cache/adoption sharing, which moves immutable Generated artifacts. This
is a document a user hands to a friend or coach. Fits because a Protocol is a
settled, fully-enumerated plan.

### Per-side / unilateral rep logging
Log left/right independently for single-arm work. A real gap that touches
**Logged Set** and possibly **Quantity** modeling — so it warrants an ADR, since
it changes what a "set" records. High value for anyone training unilaterally.

### RIR alongside RPE in effort logging
We capture Performance Feedback (RPE-ish). openGym lets the user pick RIR *or*
RPE. Because RIR↔RPE is a deterministic mapping, this is an input-mode choice /
read-time projection over existing data — cheap, and RIR is the scale most
lifters actually prefer.

### Activity heatmap (GitHub-style yearly calendar)
We already compute distinct active-days for Streak and Analytics. A yearly
heatmap is a **pure read-time projection** over data we already hold — no new
storage, fully consistent with ADR-0018/0019. Strong visual payoff for near-zero
architectural cost.

### Screen wake-lock during a Live Session
Keep the screen on while training. Trivial, client-side, and squarely within
Live Session being ephemeral / client-side (ADR-0012).

---

## 2. Good fits — consider

### Push notifications (rest-timer done, "resume your Protocol")
We are already a PWA with an offline page. A rest-timer-done notification fits
Live Session; a "you have a Next Session waiting" nudge fits Home. **Caveat:**
anything *time- or calendar-scheduled* (a daily reminder) collides with the
self-paced, calendar-free rule (ADR-0001). Keep nudges state-driven, not dated.

### Body-weight goal line on metric charts
We track body-weight metrics. A user-set goal line is a small, honest projection
over existing metric history.

### Internationalization (i18n)
openGym ships 12 languages; we ship none. A large reach multiplier but a
cross-cutting effort (extraction, locale files, RTL considerations). Worth it
only if audience growth is a near-term goal.

### Selectable progression schemes (double progression, Greyskull-style, time-based)
openGym offers several named progression systems; we have one deterministic
**Progression**. We could offer a *chosen scheme* per Protocol or per Exercise.
This is a genuine domain extension — needs an ADR and careful design to stay
deterministic and read-time where possible, and to keep the "never auto-swap a
movement" guarantee intact.

---

## 3. Poor fits — mostly skip

### Weekly 7-day scheduling
Directly violates the calendar-free invariant (ADR-0001). Skip.

### Recovery % / daily streak
We deliberately rejected both — Readiness is a 3-state signal, Streak is weekly
(ADR-0001). Skip.

### Animated exercise GIFs / demos
Conflicts with the "curated-source-only, never-fabricated Exercise Image" safety
stance (ADR-0041). Only viable if sourced from a vetted, licensed dataset —
never AI-generated.

### Multi-profile on one install
openGym needs this because it is a single-install self-hosted app. We are
already multi-tenant via Clerk, so it is redundant.

---

## Suggested starting order

1. **Import from Strong / Hevy / FitNotes** — highest adoption lever; lands on
   plan-less Logged Sessions.
2. **Activity heatmap** — near-free read-time projection over data we already
   have.
3. **JSON export** — low-risk trust feature and the natural pair to import.

These three carry the least architectural risk and sit squarely on concepts we
already model.

---

## Source

- openGym repository: <https://github.com/arvids-unavailable/openGym> (README and
  `frontend/src` structure, read August 2026).
