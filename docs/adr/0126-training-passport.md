# 0126 — Training Passport: Achievements presented as a collection of Stamps

**Status:** accepted

The Profile's achievement wall was a grid of identical trophy and lock tiles. An earned tile
showed a short date with no year and nothing about what earned it. Locked tiles looked like
earned ones apart from the icon, so the wall read as a list of things the user hadn't done, and
nothing said what to aim for next. A user who had logged nothing saw a wall of locks. Source:
`docs/design/pulse-creative-directions.md` §7 ("Build a personal training passport"), spec #648.

**We present Achievements as a Training Passport, a collection of Stamps.** "Stamp" and
"Training Passport" are presentation labels for **Achievements**. They are not new domain
concepts. The API keeps calling them Achievements, the profile progress endpoint keeps its
`achievements` key, and no terminology-guard entry is added.

- **Earned Stamps read oldest first**, so the Passport reads as a journey. Stamps earned on the
  same date keep catalog order, so the collection never shuffles between visits. Every earned
  date shows the year, formatted through the shared calendar-date helper (`lib/date-format.ts`).
- **One next milestone** sits beside the earned Stamps: the locked Achievement with the highest
  current/target ratio. A ratio tie keeps catalog order, and there is none once everything is
  earned. Proportional closeness, not the smallest absolute gap, is what makes the suggestion
  achievable across families whose targets differ by two orders of magnitude.
- **Every other locked Achievement waits under a "More to earn (n)" disclosure** with its
  criteria in plain words, so the Passport leads with what the user has done.
- **Ordering and the milestone choice are presentation.** They live in the pure web view-model
  (`lib/passport-view.ts`). The API keeps returning curated catalog order.
- **Streak copy names the best run.** The streak Achievements already count the longest run of
  consecutive weeks (ADR-0019), so their progress reads "Best run 3/4 consecutive weeks", never a
  current run that a rest week could break. Consistency is expressed only as consecutive weeks;
  there is no calendar language such as "first month" (ADR-0001).
- **A First Session Achievement (`sessions-1`)** heads the catalog, so the first Logged Session
  earns the first Stamp, and a user with no Logged Sessions sees an empty Passport that points
  Home instead of a page of locks. Any Completion Outcome counts, as for the other
  session-count Achievements.
- **Each Stamp opens its own page** under the Achievements route. It explains what earned the
  Stamp in plain words and links to the Logged Session that crossed the threshold. To support
  that, each evaluated Achievement carries `unlocked_by_session_id`: the crossing session the
  existing oldest-first replay already finds when it works out `unlocked_on`. Both come from
  the same replay, so they always agree. Sessions performed on the same date replay in id
  order, so the crossing session never depends on the order the repository returns them in.
  The Stamp page is served from the same profile progress read, so no endpoint is added; an
  unknown id is not found, and a locked Achievement's page shows criteria and progress with no
  source link. The page is one level deeper than the Passport, so its links slide forward and
  it has a back link (ADR-0121). The back link returns to where the Stamp was opened: a Stamp
  on the Profile summary links with `?from=profile` and returns to the Profile; any other or
  missing origin returns to the Passport, its parent. The source record sits in History, a
  related place, so that link carries no direction.
- **The First Record Stamp shows its lift.** `first-pr` carries a nullable `record`, shaped like
  the Personal Record serialisation. It is derived through the shared Personal Record
  definition, never by re-deriving which sets qualify. A bodyweight lift reads as "bodyweight +
  added load × reps" and never as a bare kg figure (ADR-0026).
- **Stamp art is generated, not authored.** One parametric SVG generator, a sibling of the
  workout sigil, draws every Stamp from (family, tier, state): the family is a silhouette,
  the tier is a ring or segment count, and the state is earned ink or a muted outline. It is
  decorative; text carries the meaning. No Rive, no Motion, no new dependency, no reveal
  animation and no "newly earned" highlight.

## Considered options

- **Keep catalog order for earned Stamps**: rejected. Catalog order puts 100 Sessions above a
  first Personal Record earned a year earlier, so the collection tells no story.
- **Sort in the API**: rejected. Order is how one screen presents the projection, the curated
  catalog order stays the one order the API states, and a pure view-model is unit-testable
  without a database.
- **Smallest absolute gap as the next milestone**: rejected. "1 week to go" on a 12-week streak
  and "1 session to go" on 100 Sessions are both small gaps, but they say nothing about how
  far the user has come. The ratio compares families fairly.
- **A stored Stamp ledger, so a Stamp stays earned forever**: rejected (ADR-0018). The Passport
  must never claim something the logbook does not support.

## Consequences

- **A Stamp can re-lock.** Inherited from ADR-0018: deleting the Logged Sessions behind an
  Achievement re-evaluates it, and its source session follows the replay to the session that
  now crosses the threshold, or the Stamp re-locks.
- The view-model words streak progress by id prefix (`streak-`). A new streak Achievement gets
  the "best run" copy by being named that way, and a new family that is not a streak keeps the
  plain "current/target" form.
- Delivered in slices (#648): the collection (earned Stamps, next milestone, More to earn) and
  this record first (#650), with the existing icons and no API change; then First Session and
  the empty Passport (#651); the Stamp page with its source session (#652); the First Record
  lift (#653); and the generated art (#654).
- The Passport and its disclosure, in both states, the empty Passport and the Stamp page,
  earned and locked, are journeys in the reflow audit (`passport`, `passport-open`,
  `passport-empty`, `stamp`, `stamp-locked`), at 320px and 200% text.
