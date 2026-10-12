# Competitor-sourced improvement candidates — 2026-10-12

A web-research sweep of fitness and workout apps in October 2026, sorted into candidate
improvements for **workout-manager**. Each item has a title, a short description, the
competitor evidence, and a **Grill** line: the first question a grilling session should
settle before anything is specified.

Nothing here is decided. Items that pull against a load-bearing invariant (`CLAUDE.md`,
`GLOSSARY.md`, `docs/adr/`) say so. Items already tracked in [`TASKS.md`](../../TASKS.md)
are marked **(in TASKS)** so a session can merge them instead of re-opening them.

**Evidence limits.** Direct page fetches failed in this session (DNS errors on the vendor
sites), so every claim rests on search-result summaries. Most comparison articles are written
by a competing vendor. Treat feature claims as leads and prices as approximate. Check the app
or store page before quoting either.

**Already in the product, so not repeated below:** typed Load, RIR/RPE effort (ADR-0066),
structured set semantics (ADR-0065), supersets (ADR-0023), a selectable progression-scheme
registry (ADR-0064), Calibration (ADR-0111), substitution, share-by-copy links (ADR-0057),
read-time Streak/Achievements as a Training Passport (ADR-0018, ADR-0126), kg/lb, and
JSON/CSV export (ADR-0062).

---

## 1. Faster logging on the gym floor

### 1.1 Gym equipment profiles
Let a user describe what their gym actually has: plate pairs, the dumbbell ladder, cable
stack steps, machines present. Round load suggestions to weights that exist (22.5 kg, not
21.3 kg) and filter generation to the equipment on hand.
*Evidence:* MacroFactor Workouts ships gym equipment profiles; Alpha Progression rounds to
the increments your gym has; Gravl generates from the equipment you own.
**Grill:** is a profile part of the fitness profile or its own entity, and can a user have
several (home vs gym)? How does it relate to the curated Equipment vocabulary (ADR-0077)?

### 1.2 Plate and warm-up calculator (in TASKS §9 P1-4)
Show the plates per side for an absolute Load, and generate warm-up sets ramping to the
first working set.
*Evidence:* table stakes in Strong, Hevy and Boostcamp.
**Grill:** are warm-up sets prescribed (plan) or only suggested at log time? Do they count
toward volume and PRs (they shouldn't)?

### 1.3 One-tap "Easy / Hard" set rating
A two-button effort shortcut after each set, mapped onto the typed effort value, for users
who won't type an RIR number.
*Evidence:* Gravl adjusts the next prescription from Easy/Hard set ratings; Alpha
Progression keeps RIR optional and still progresses.
**Grill:** what RIR does "Easy" or "Hard" normalize to in the progression gate (ADR-0066),
and is a third "Just right" state needed?

### 1.4 Drop sets and partial reps
Log drop sets as a chained run under one set, and partial reps beside full ones.
*Evidence:* MacroFactor Workouts logs drop sets and partials; Liftosaur scripts myo-reps and
drop sets.
**Grill:** is a drop set one Logged Set or several, and how does it affect Estimated 1RM
eligibility and volume?

### 1.5 Swap an exercise "just today" or "from now on"
When substituting, ask whether the swap applies to this Session only or to the rest of the
Protocol.
*Evidence:* Hevy Trainer (2026) swaps for a single session or for all future workouts.
**Grill:** "from now on" must touch only the un-performed tail (ADR-0020). Does it also
re-pitch Loads the way a Calibration does?

---

## 2. Programming and progression intelligence

### 2.1 Reps-first or weight-first progression preference
Let the user choose whether a progression step adds reps before weight, or the reverse.
*Evidence:* MacroFactor Workouts added a reps-first vs weight-first setting (April 2026).
**Grill:** is this a new scheme in the registry (ADR-0064) or a parameter on the existing
double-progression scheme?

### 2.2 User-authored progression rules
Let advanced users define their own progression (stages, failure resets, rep-sum
thresholds), in the spirit of GZCLP-style logic.
*Evidence:* Liftosaur's Liftoscript offers linear, double and reps-sum progressions plus
fully scripted custom logic, evaluated when a workout ends.
**Grill:** form-based rule builder or a small DSL? How is a user-authored scheme validated
and kept pure (`app/domain/`) without becoming a scripting runtime?

### 2.3 RIR targets that change across a block, with a planned deload
Prescribe RIR targets that tighten over a block and end in a deload Session, all
enumerated in the Protocol.
*Evidence:* Alpha Progression organizes mesocycles with changing RIR targets and an
integrated deload.
**Grill:** blocks must stay self-paced (ADR-0001). Is a "block" a GLOSSARY term or just a
generation pattern inside an enumerated Protocol?

### 2.4 Weekly sets per muscle while building
Show the set count per Muscle Group, per Session and across the Protocol's repeating
unit, live in the builder.
*Evidence:* MacroFactor Workouts added daily and weekly muscle-group set counts to its
program editor (April 2026).
**Grill:** "weekly" is calendar language. Is the unit "per Protocol cycle" instead? Reuse
the coverage projection (ADR-0025) or a builder-only count?

### 2.5 In-session fatigue awareness
Lower later prescriptions in a Session when earlier sets show fatigue (missed reps, low
RIR).
*Evidence:* MacroFactor announced in-session fatigue estimation (shipping not confirmed).
**Grill:** is this a Live Session suggestion only (the plan stays untouched), and how is
it explained to the user?

### 2.6 "Neglected lift" and recent-training awareness in generation
Feed generation what was trained last and which movement patterns or muscles have been
missing lately.
*Evidence:* Gravl factors in last session, recovering muscles and neglected lifts.
**Grill:** how is this kept within the 3-state readiness signal and away from a recovery
score (ADR-0001)? What does it do to the coarse cache key (ADR-0003)?

### 2.7 A library of established programs
Offer well-known public programs (beginner linear progression, 5/3/1-style, GZCLP-style,
PPL) as adoptable Protocols beside AI generation.
*Evidence:* Boostcamp's main draw is choosing from established training methodologies.
**Grill:** licensing and naming of branded programs; are they curated Generated content
(adopt-by-copy) or a new provenance?
**Decided (ADR-0130):** a new `curated` provenance with adopt-by-copy semantics; our own
descriptive names, no third-party brands.

---

## 3. AI coaching

### 3.1 Explain safety adjustments in the plan
When a Sensitive Constraint changed a prescription, say so on the exercise ("swapped
because of your shoulder"), and say when skipping is the better call.
*Evidence:* Gravl explains injury-aware adjustments; Hevy lists injury management as
upcoming.
**Grill:** where does the explanation come from (generation output, or a deterministic
rule), and does it count as health data in telemetry (ADR-0039)?

### 3.2 Import a program from text or a screenshot
Paste a program from a forum post, PDF or photo, and let AI turn it into a Hand-Authored
Protocol for review before saving.
*Evidence:* Gravl lists AI routine imports.
**Grill:** goes through the LLM port with its own `parse_*` boundary. What happens to
unknown exercise names (catalog Stubs, ADR-0041)?

### 3.3 "Send to an AI" from the finish screen (in TASKS §8)
One-tap export of a Logged Session in a prompt-ready format for ChatGPT or Claude.
*Evidence:* Hevy 3.1.14 (September 2026) sends workouts to ChatGPT and Claude from the
finish screen.
**Grill:** clipboard text, a share sheet, or a deep link? What leaves the device for a
Sensitive Constraint user?

### 3.4 Conversational coach (in TASKS §8)
A chat surface in front of regenerate, substitute and Calibration.
*Evidence:* Fitbit's Gemini health coach; coach apps marketed against "loggers".
**Grill:** which actions may the chat take without confirmation, and how does every change
stay limited to the un-performed tail?

### 3.5 Camera form check in the browser
Opt-in pose estimation with the phone camera for a few key lifts: rep counting plus range
of motion and posture cues, processed on the device.
*Evidence:* a 2026 wave of form-check apps (Form Coach, SnapRep) on Apple Vision or
MediaPipe; browser-based webcam research does the same; Fitbod reportedly testing it.
**Grill:** on-device only (video never uploaded)? Which lifts first, and how to word
feedback so it isn't read as medical advice?

---

## 4. Integrations and ecosystem

### 4.1 Strava sync
Post finished Logged Sessions to Strava with exercises, sets, reps and Loads.
*Evidence:* Hevy has had full-detail Strava sync since June 2026; Gravl syncs with Strava.
**Grill:** push on finish or on demand? Is the activity text a privacy surface for
Sensitive Constraint users?

### 4.2 Apple Health / Health Connect write-out (in TASKS §8)
Write finished workouts to the platform health store.
*Evidence:* on MacroFactor's roadmap; Gravl and most watch loggers do it.
**Grill:** impossible from a PWA. This item stands or falls with the native-shell ADR
(TASKS §3).

### 4.3 Send a Session to a Garmin watch
Export the next Session as a Garmin Connect structured strength workout, so the watch
guides sets and counts reps.
*Evidence:* Garmin watches count reps (single move per set, editable after) and accept
strength workouts created in Garmin Connect.
**Grill:** is a partner API reachable for a small app? How do edited reps on the watch
come back as a Logged Session (and what wins on conflict)?

### 4.4 Import from other loggers (in TASKS §9 P0-1)
Hevy, Strong and JEFIT CSV into plan-less Logged Sessions.
*Evidence:* Gript's help pages on importing from all of them; the main switching cost.
**Grill:** exercise-name matching, and whether imported history feeds PRs and Estimated
1RM straight away.

---

## 5. Platform and wearables

### 5.1 Wrist logging
Log sets and see rest timers from a watch while the phone stays in the bag.
*Evidence:* Hevy, Fitbod and Gravl have watch apps; standalone watch loggers (Reps & Sets,
GymLogger X) market "leave your phone in the locker".
**Grill:** needs native code. Is the Live Session's client-only state (ADR-0012) the sync
contract between phone and watch?

### 5.2 Passive load estimation from a wearable (deliberately contested)
Estimate muscular load from wrist motion without manual logging.
*Evidence:* WHOOP Passive MSK (February 2026) and AI exercise linking (March 2026);
validation not public.
**Grill:** conflicts with "a record is what the user did". Is an estimate ever a Logged
Set, or only an annotation? Default answer: don't build it.

---

## 6. Motivation and community

### 6.1 A periodic recap
A "your last 30 workouts" or end-of-month story: volume, new PRs, Stamps earned.
*Evidence:* Hevy's July 2026 update added monthly achievement celebrations.
**Grill:** month-based recaps clash with "calendar-free". Count-based ("every 10 Logged
Sessions") instead? Read-time only (ADR-0018).

### 6.2 Coach-led groups without a feed
Small groups following the same Protocol with a group chat and shared progress, without a
public social feed.
*Evidence:* Ladder's model: coach-led "teams", a new plan each week, team chat on every
plan; Caliber lets users train with friends.
**Grill:** builds on share-by-copy (ADR-0057). Who owns a group Protocol, and what is
visible to the group from a Sensitive Constraint user?

### 6.3 Shareable milestone cards (in TASKS §8)
An image card for a PR, Stamp or finished Protocol.
*Evidence:* common across Hevy, Strava-style apps; pairs with the Training Passport.
**Grill:** generated on the server or the client, and what data is allowed on the image?

---

## 7. Human coaching and business model

### 7.1 A human-coach tier
A coach reviews Logged Sessions, adjusts the un-performed tail and answers messages.
*Evidence:* Future (about $199/month, one coach), Caliber Premium Coaching, Ladder's 1:1
coach tiers, Trainwell.
**Grill:** the plan/record split maps well (coach edits plans, never records). What role
model and authorization does a coach need?

### 7.2 Pricing and freemium line (in TASKS §9 P2-10)
Pick where the free tier ends.
*Evidence (approximate):* Hevy PRO $2.99/mo, $23.99/yr, $74.99 lifetime; Strong PRO
$4.99/mo, $29.99/yr; Boostcamp Pro $59.99/yr; Fitbod $12.99–15.99/mo; Alpha Progression
about $10–13/mo; Ladder about $25–30/mo.
**Grill:** gate on generation volume (the real cost) or on features? Is a lifetime tier
compatible with ongoing LLM spend?

---

## 8. Contested by our invariants

### 8.1 Recovery-based scheduling from HRV or sleep
Pick today's training from wearable recovery data.
*Evidence:* WHOOP, Oura and Fitbit's coach; Gravl's recovery-based scheduling; vendor
reports call adaptive, data-driven plans the 2026 expectation.
**Grill:** ADR-0001 rejects recovery percentages and daily scheduling. Is there a bounded
version that only feeds the 3-state readiness signal (open question Q1 in research
2026-10-05), or does the line hold?

---

## Sources

- Hevy: [community update, July 2026](https://www.hevyapp.com/community-updates/july-26/),
  [App Store listing](https://appshunter.io/ios/app/hevy/id1458862350),
  [pricing listing](https://macmyths.com/apps/hevy/)
- MacroFactor Workouts: [product page](https://macrofactorapp.com/workouts/),
  [January 2026 launch](https://macrofactor.com/mm-jan-2026/),
  [April 2026 update](https://macrofactor.com/mm-april-2026/)
- Fitbod: [2026 review](https://www.indiehackers.com/post/fitbod-app-review-2026-honest-take-after-real-testing-45d5f07a1b),
  [AI fitness apps guide](https://www.rapidnative.com/blogs/ai-fitness-apps),
  [pricing overview](https://subger.com/en/service/fitbod)
- Alpha Progression: [progressive overload apps](https://alphaprogression.com/en/blog/best-progressive-overload-apps),
  [vs Hevy](https://alphaprogression.com/en/blog/alpha-progression-vs-hevy),
  [vs Gravl](https://alphaprogression.com/en/blog/alpha-progression-vs-gravl) (vendor-written)
- Strong, Boostcamp: [JEFIT 2026 comparison](https://www.jefit.com/blog/best-strength-training-apps-for-2026-7-options-tested-by-lifters),
  [Boostcamp strength roundup](https://www.boostcamp.app/best/strength-training) (vendor-written)
- Liftosaur: [Liftoscript docs](https://www.liftosaur.com/doc/liftoscript),
  [overview](https://www.liftosaur.com/blog/posts/liftosaur-overview/)
- Gravl: [App Store listing](https://apps.apple.com/gb/app/id6450921637)
- Ladder: [2026 review](https://www.sensai.fit/blog/ladder-app-review-2026),
  [App Store listing](https://apps.apple.com/us/app/-/id1502936453)
- Future, Caliber: [Trainwell vs Caliber](https://www.trainwell.net/blog/trainwell-vs-caliber-personal-coaching-apps-compared-2026),
  [Future alternatives](https://www.trainwell.net/blog/best-future-app-alternatives-in-2026-apps-with-real-human-coaches) (vendor-written)
- WHOOP: [2026 what's new](https://www.whoop.com/ae/en/thelocker/2026-whats-new/),
  [Passive MSK explained](https://the5krunner.com/2026/02/28/new-whoop-strength-trainer-update/)
- Garmin: [Recording a strength training activity](https://www8.garmin.com/manuals/webhelp/GUID-C144B465-A0C8-4FE9-AFE6-41A3FE3F1D9A/EN-US/GUID-49D892BF-429E-454D-B0C6-D4AE07E9D4A0.html)
- Watch loggers: [best strength apps for Apple Watch 2026](https://www.findyouredge.app/news/best-strength-training-apps-apple-watch-2026),
  [Reps & Sets 26](https://apps.apple.com/us/app/reps-sets-26/id6753645105)
- Form check: [best AI form-check apps 2026](https://www.sensai.fit/blog/best-ai-workout-form-check-apps-2026),
  [Form Coach](https://mwm.ai/apps/form-coach/6770110788)
- Trends: [Feed.fm 2026 digital fitness report](https://www.feed.fm/2026-digital-fitness-ecosystem-report),
  [Virtuagym 2026 trends](https://business.virtuagym.com/blog/fitness-trends/) (vendor-written)
