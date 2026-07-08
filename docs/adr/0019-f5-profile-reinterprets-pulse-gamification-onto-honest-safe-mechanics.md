# 0019 — F5 Profile reinterprets Pulse's gamification onto honest, safety-consistent mechanics

The Pulse design draws Profile around a game layer — XP + level, lifetime stats
including **total hours**, achievement badges, a **Settings panel** (units,
rest-timer, appearance), **Apple Health** linking, and an **Account** section
(notifications, privacy, help, log out). As with every prior screen (ADR-0008 for
Home, ADR-0011 for Analytics, ADR-0017 for Exercise Detail), F5 is **reinterpreted
onto what the model can honestly and safely back** rather than ported literally.
ADR-0018 covers the gamification *engine*; this ADR records the screen-level
*scope* decisions — most of which are deliberate **no-s** a future reader would
otherwise assume were oversights.

**The Streak is weekly, not daily — the most counterintuitive call here.** A
fitness app "should" have a don't-break-the-chain daily streak; this one
deliberately does not, for two reasons. First, the plan model is self-paced and
**calendar-free** (ADR-0001, ADR-0008): there is no "today's session" to miss, so
a daily streak would re-introduce exactly the dated semantics ADR-0008 removed.
Second, and more importantly, a daily streak is a mechanic that **pressures users
to train through rest days** — directly against a domain built around Sensitive
Constraints, Readiness caution, and postpartum/rehab safety. A weekly streak
(consecutive weeks with ≥1 Logged Session) rewards genuine consistency, assumes
rest days as legitimate, and never tells a rehabbing user they "broke" anything.

**"Total hours" is dropped from the lifetime stats.** It sums Session Duration,
which is known only for live-tracked performances (ADR-0014); most history predates
live tracking, so a lifetime total would read near-zero and badly understate
reality. This is the same call, for the same reason, that kept **avg-time off the
Analytics bento** (ADR-0011). The lifetime trio is instead **Total Sessions ·
Total Sets · Streak** — all fully covered. Total hours earns its place only once
statically-logged Sessions also capture a duration.

**Three items are omitted as honestly-unbuildable, not deferred features.**
Shipping any of them as a live control would be a faked seam, the dishonesty
ADR-0017 refused with `ADD TO PROTOCOL`:

- **Appearance / theme** — the app is committed **dark-only** (`globals.css`
  `color-scheme: dark`; the whole operator design system is built against it). A
  light theme is a large net-new effort, not a toggle, and is out of scope.
- **Apple Health** — **HealthKit has no web API**; this is a Next.js web app with
  no native iOS shell to bridge through, so the integration is not buildable in
  the current architecture at all — omitted, not stubbed.
- **Notifications settings** — there is no notification subsystem to configure; a
  preferences screen for it would be settings for nothing.

**What is built, and how it is sliced.** Gamification (Streak first, then
XP/Level, then Achievements, then the lifetime-stats UI) surfaces on **Profile
first**; the Home/Analytics fan-out is a later slice, as the PR engine shipped on
Analytics before Home (ADR-0010). Of the real Settings, the **default rest-timer
duration** (feeding the F2 Live Session) ships now as a single Profile field;
**units (kg/lb)** is its own later slice, scoped honestly as store-canonical-kg /
convert-at-every-boundary (display *and* input), not a smuggled-in toggle. In the
Account section, **log out** is surfaced from the existing Clerk control now, and
**account/data deletion** is its own later slice built to *actually* cascade-delete
(a button that only promises deletion would be the worst faked seam).

## Consequences

- Profile matches Pulse's *look* but diverges from its *semantics*; the divergences
  (weekly streak, no total-hours, no theme/Health/notifications) are deliberate and
  should not be "fixed" back toward the mock.
- The safety argument for the weekly streak is a **product constraint not visible
  in the code** — recorded here so it survives the next person who asks "why isn't
  there a daily streak?"
- Units (kg/lb), account deletion, and the Home/Analytics gamification fan-out are
  named future slices, each self-contained and layerable without reworking F5.
