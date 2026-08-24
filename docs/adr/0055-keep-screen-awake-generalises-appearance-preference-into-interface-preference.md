# 0055 — Keep-Screen-Awake generalises the Appearance Preference into an Interface Preference

**Status:** accepted

A **Live Session** should keep the device screen on while the user trains. We add a
per-user **Keep Screen Awake** toggle, backed by a best-effort client-side Screen
Wake Lock, defaulting **on**. Storing that toggle forced a modelling choice: it is
read-time UI state that never touches generation — the exact shape ADR-0047 gave the
**Appearance Preference** — but it is not *appearance*. Rather than overload
"Appearance" (the very erosion ADR-0047 refused when it kept Mode out of the Fitness
Profile), we **generalise the concept to an *Interface Preference*** whose members are
the visual **Mode** (still an *Appearance Preference*) and the behavioural **Keep
Screen Awake**. This ADR extends ADR-0047; it does not supersede it.

## Considered options

- **Client-only `localStorage` toggle (rejected).** Smallest change, no backend, but it
  breaks the precedent ADR-0047 set — a per-user UI preference should follow the user
  across devices. Mode would sync and Keep-Screen-Awake would not, an inconsistent
  mental model.
- **Add the field to the *Appearance Preference* as-is (rejected).** Cheapest server
  option, but it does to "Appearance" exactly what ADR-0047 forbade doing to the
  "Fitness Profile" — folds an unrelated concern into a concept and erodes its meaning.
- **A full physical rename (rejected).** Renaming the `appearance_preference` table,
  the `/api/appearance` route, and the repo/domain modules to `interface_preference`
  aligns names with the concept, but it is broad churn across working Mode code and an
  API-path change the web transport (ADR-0022) must follow — for **zero** functional
  gain.
- **Generalise the language only, keep physical names (chosen).** Add a
  `keep_screen_awake` boolean to the existing Appearance Preference store/endpoint and
  generalise the *concept* (CONTEXT.md → *Interface Preference*). The `appearance_*`
  physical names stay as an incidental legacy detail — the same discipline ADR-0018/0054
  apply, where the concept lives in docs and storage naming is incidental.

## Consequences

- **The wake lock is best-effort and silent.** Where `navigator.wakeLock` is absent or
  a request rejects, the app **no-ops** — no video-hack fallback (NoSleep-style
  hidden-looping `<video>`) and no user-facing "unsupported" notice. It is a
  progressive enhancement, not a guaranteed capability.
- **It does not alter the idle model (ADR-0014).** Idle auto-end measures from
  `lastActivityAt` (set/dispatch timestamps) with wall-clock timers, not from screen
  or visibility state. A propped-up phone that rests past 30 minutes is still
  auto-ended on the next foreground; the wake lock changes none of that accounting.
- **Re-acquisition is the real work.** The OS auto-releases the lock whenever the tab
  is hidden (phone lock, app switch, notification shade), so the lock is re-acquired on
  `visibilitychange` back to visible while the screen is in the `live` phase — held in
  `live` only, released on leaving it.
- **"Appearance Preference" is narrowed, not retired.** It remains valid prose for the
  Mode/appearance facet and is **not** added to `terminology_guard.BANNED_TERMS`; the
  concept broadened, it did not regress.
- **Testing stays offline.** The decision logic is extracted as a pure
  `wakeLockAction(visible, phase, prefEnabled)` in `apps/web/lib/` (unit-tested under
  node `--test`, no DOM); the raw `navigator.wakeLock` calls remain a thin untested
  effect shell. The new field gets backend `parse_*`/repository/endpoint tests
  mirroring Mode's, including get-or-defaults returning `keep_screen_awake: true`.
