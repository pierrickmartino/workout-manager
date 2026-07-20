# 0025 — Muscle Group Coverage is a neutral, windowed presence signal — not a flag

The research backlog's **Muscle Group Balance & Coverage Prompts** item proposed a passive
Analytics insight that *"flags an under-trained bucket ('Back is 4% of recent volume')"*.
Designed against the domain, it comes out the other way: the feature ships as a **neutral,
descriptive coverage signal** and deliberately does **not** flag, nudge, or prescribe. This
ADR records that reframing and the boundary decisions around it, because a future reader
will otherwise read the backlog blurb (and ADR-0024's forward-reference to it) and expect a
flag we consciously refused to build.

Concretely:

- **It does not flag — "never flag an under-trained bucket" is a hard invariant, not a
  not-yet.** The shipped Muscle-Balance drift chart (ADR-0024) is documented "descriptive
  only… flagging an under-trained bucket is a separate concern." That "descriptive only" is
  load-bearing, of a piece with Readiness-is-a-3-state-signal-not-a-score and the weekly (not
  daily) Streak (ADR-0001): a signal that says "Back is under-trained" is normative — it
  prescribes, however gently, and reintroduces the "you missed leg day" guilt mechanic the
  self-paced, calendar-free model exists to reject. So this feature stays strictly *presence*,
  never *judgment*.

- **Coverage, not balance/proportion — because proportion is where the flag hides.** Two
  distinct concepts: **Coverage** = *did you train this group at all?* (presence/absence, per
  group); **Balance** = *what share did each group get?* (proportion). Balance-over-time
  already shipped (ADR-0024's drift chart) and the snapshot split already lives on
  `/analytics`; a second proportional surface would only re-say them — and the moment it says
  "4% is *low*" it becomes the banned flag. Coverage is the genuinely additive, genuinely
  neutral frame: "trained / not trained in this window" is a fact, not a verdict. The
  "% of recent volume" framing is dropped entirely — doubly wrong, since the roll-up is
  **set-count**, never volume (`domain/muscle_groups`).

- **A fixed, labeled 8-week window — not the range toggle, not all-time.** Coverage is
  window-sensitive, and the wrong window smuggles the guilt back in. Inheriting the screen's
  7d/30d/90d toggle is a trap: over 7 days a perfectly-rotated self-paced user reads "2 of 6",
  i.e. the "you missed leg day" rebuke at the week scale (ADR-0001's exact objection). All-time
  is redundant — that *is* the Full Coverage Achievement. So coverage reads a fixed window long
  enough for a full rotation to plausibly complete, **reusing the drift chart's 8-week span**
  (`MUSCLE_BALANCE_WEEKS`) and its weekly self-paced cadence. Because both describe the same
  8-week window, coverage and the drift chart can never contradict — an absent group is exactly
  one with no segment in any of the 8 bars. The window is labeled explicitly ("last 8 weeks") so
  it visibly does *not* follow the toggle rather than looking broken.

- **On `/analytics`, ungated — because coverage is type-neutral.** `targeted_muscles` exists
  for every modality, and the Full Coverage Achievement is reachable from a pure yoga/mobility
  history. The Strength Analytics screen is gated behind absolute-Load PRs
  (`has_qualifying_strength`) — placing a Muscle-Group coverage signal there would hide it from
  exactly the non-strength users a type-neutral signal is most for. It lives on the main,
  ungated Analytics screen, beside the snapshot Muscle Split it complements (presence next to
  proportion). This is consistent with ADR-0024 keeping the item "off this screen."

- **One definition of "covered", shared with the Achievement; Unclassified never a target.**
  Recent coverage and the all-time Full Coverage Achievement must agree on *what counts as
  covering a group*: the achievement's covered-set logic (`_muscle_groups_covered`, same
  `classify`, same six real groups) is the single source, read all-time by the achievement and
  over 8 weeks by coverage. The presentation is the Achievement's own "criteria + live progress"
  pattern, windowed — so a user holding the lifetime achievement who sees a group absent recently
  reads it as obviously complementary (lifetime unlock vs. current window), not a bug. The
  **Unclassified** bucket is never a coverage target — it is not a group anyone trains — but any
  unmapped work *inside the 8-week window* is disclosed as a neutral footnote, never silently
  dropped, so the "of 6" denominator stays honest for a user whose modality produces unmapped
  muscles.

## Consequences

- This ADR **refines ADR-0024's forward-reference**: that ADR called this item "flagging an
  under-trained bucket." On design it is *not* a flag but a neutral windowed-coverage signal, and
  it lands on `/analytics`, not the strength screen. ADR-0024's decision to keep it off the
  strength screen stands and is reinforced.
- Coverage and the Muscle-Balance drift chart deliberately share the **8-week span and weekly
  cadence** but live on different screens (main vs. strength) and answer different questions
  (presence vs. proportion). A future reader should treat that split as deliberate, not
  duplication.
- No new stored state and no LLM: coverage is a pure read-time projection over Logged Sets, like
  every other gamified surface (ADR-0018/0019). The covered-set predicate is factored out of the
  achievement so the two surfaces cannot drift.
