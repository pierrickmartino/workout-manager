# Workout Manager

An AI-assisted application for creating, following, and tracking fitness workouts. This glossary fixes the language used across the domain so that the *plan* a user is given and the *record* of what they actually did are never confused.

## Plan vs. Record

The single most important distinction in the domain: a **plan** is what the AI prescribes; a **record** is what the user actually performed. They are separate concepts, and the same plan can be performed many times.

**Protocol**:
A user-owned training plan: a fully enumerated set of Sessions spanning a user-chosen number of weeks, each Session occupying a specific position; the same logical workout may differ from week to week to express progression and deloads. It originates as the user's own copy of an AI generation (see Adopt) and may then be **edited directly by the user** — reshaping the number of weeks and the per-week session count, adding or removing Sessions, and authoring Exercise Prescriptions by hand — so a Protocol's content is not necessarily wholly AI-generated. Editing only ever reaches the *un-performed* remainder: a Session the user has already performed is settled record and is never rewritten or reordered. May carry a user-given name. Mutating a Protocol never affects other users or the cache.
_Avoid_: Plan, routine, cycle, Program

**Current Protocol**:
The one Protocol a user is actively working through — the most recently adopted Protocol that still has an un-performed Session. It is the Protocol the Home screen surfaces the Next Session and the remaining queue from. A user may own several Protocols but has at most one Current Protocol at a time; when none exists, Home falls back to prompting a new generation.
_Avoid_: Active plan, selected protocol, today's protocol

**Next Session**:
The next un-performed Session in a self-paced Protocol's ordered sequence — what the user is prompted to do next. There is no calendar; "next" means next in position, never a dated "today". The thing a user initiates from Home is always a Session, never a whole Protocol.
_Avoid_: Today's session, today's protocol, scheduled session

**Session**:
A single prescribed workout, composed of Exercise Prescriptions. One unified concept: a Session may belong to a Protocol (carrying a Week/Day position) or stand alone (generated on its own with no parent or position). It is a *plan*, not a record of execution. Logging and feedback work identically whether or not it belongs to a Protocol.
_Avoid_: Workout, training (when referring to the plan)

**Exercise**:
A movement definition in the shared, global catalog — name, description, ordered Execution Steps, targeted muscles (split into Primary and Secondary), difficulty, required equipment, variations, alternatives, precautions. One Exercise (e.g. "Barbell Back Squat") is shared across all users; AI-invented movements are stored once and enriched once for everyone. Distinct from the prescription of its sets/reps.
_Avoid_: Movement, Exercise Prescription (when referring to the definition)

**Execution Steps**:
The ordered sequence of instructions for performing an Exercise — an enumerated list of discrete steps, not a prose blob. The count of steps reflects what the author (AI enrichment) actually wrote; there is no sentence-level chopping that fabricates step boundaries. An Exercise with no discrete steps carries a single step (rendered as plain guidance) rather than a false "step 01 of 1".
_Avoid_: Instructions (as free text), how-to, description

**Exercise Prescription**:
The prescription of one Exercise inside a Session — the sets, repetitions, rest, tempo, and recommended load the user is told to perform. References a catalog Exercise. Distinct from the Exercise definition.
_Avoid_: Exercise (when referring to the prescribed sets/reps)

**Superset**:
An ordered group of two or more Exercise Prescriptions within one Session, performed in **rounds** — one set of each member in turn — resting only at the **round boundary**, never between members. It is an ordering-and-rest overlay on Prescriptions: it does not change what each set *is* (reps, load, and muscle attribution are unchanged), only the sequence in which sets are performed and where rest falls. A Prescription belongs to at most one Superset, and Supersets do not nest. The one umbrella term covers two members and many (no separate "circuit" or "giant set").
_Avoid_: Circuit, giant set, block, group (bare, collides with Muscle Group), module (that is one Prescription), compound set

**Load**:
The weight prescribed or performed for a set, expressed as one of several *kinds* rather than a bare number: an **absolute** weight (e.g. 70 kg), **bodyweight** (optionally plus added load), a **percent of 1RM**, a **qualitative** effort ("moderate"), or a **range**. Only absolute loads — and bodyweight / percent loads once resolved against the user's mass or estimated 1RM — carry a numeric weight; qualitative loads never do. The free-text-ness is essential to the domain: the AI legitimately prescribes bodyweight and %-based work, so a Load is a *typed value*, never reducible to a single kg figure.
_Avoid_: Weight (bare), tonnage (for a single set), kg (as the only form)

**Provenance**:
Whether a catalog Exercise is `ai_generated` (created by the AI, unvalidated) or `curated` (reviewed and trusted). Carried on every Exercise so unvalidated content can be flagged, audited, and later merged or corrected — important given the domain's caution around injury, rehab, and postpartum cases.
_Avoid_: Source, origin, verified flag

**Variation**:
A catalog Exercise that is the *same* movement pattern as another, scaled in difficulty or execution (knee push-up is a Variation of push-up). Modeled as a typed relationship between Exercises.
_Avoid_: Progression, regression, scaling (as the relationship name)

**Alternative**:
A catalog Exercise that achieves a *similar* training effect or targets the same muscles as another, used when equipment is missing or the movement is contraindicated (goblet squat as an Alternative to barbell squat). Modeled as a typed relationship between Exercises — distinct from a Variation.
_Avoid_: Substitute, replacement (as the relationship name)

**Substitution**:
The act of swapping one Exercise Prescription's Exercise for a Variation or Alternative within the user's own Session copy. Resolved lookup-first over catalog relationships (filtered by the user's equipment, constraints, and goal), falling back to AI only when no suitable link exists. Unlimited and distinct from Regeneration.
_Avoid_: Swap, replace (as the domain term)

**Live Session**:
A single performance of a Session while it is underway — after the user starts training, before it becomes a Logged Session. The transient, in-flight precursor to a Logged Session: it holds the sets done so far, which set is current, and how long the workout has been running. It is a *record being built*, never a plan. It becomes a Logged Session when the user finishes — or is automatically ended as Incomplete after a prolonged gap of inactivity, so a recorded Session Duration never counts time the user was away.
_Avoid_: Active Session, active plan, workout in progress

**Logged Session**:
A record of the user performing a Session on a specific date. One Session can have many Logged Sessions over the course of a Protocol.
_Avoid_: Completed session, history entry

**Logged Set**:
A record of one actual set the user performed — the real repetitions, load, and perceived difficulty — within a Logged Session.
_Avoid_: Result, performance entry

**Completion Outcome**:
Whether a Logged Session is **Completed** or **Incomplete** — a property of the record itself. Completed when every prescribed set of the Session was attempted, regardless of the reps or load achieved; Incomplete when any prescribed set was left un-attempted. A set ground out to zero reps is still *attempted*, so missing reps or training to failure never makes a Session Incomplete — only un-done prescribed work does. Only a Completed Logged Session advances a Protocol to its Next Session; an Incomplete one leaves that Session as next and must be retried by running the whole Session again.
_Avoid_: Failed, partial, abandoned (as the domain term); status

**Session Duration**:
The elapsed active time of a Logged Session — measured from when the user starts training to their last recorded activity, deliberately excluding any prolonged idle gap so the figure reflects time actually training, not wall-clock time with the phone locked. Known only when the performance was tracked live; absent when a performance is logged after the fact. It is the honest basis a future average-workout-time figure would build on.
_Avoid_: Elapsed time, workout length, wall-clock time

## Profile

**Fitness Profile**:
The user's current state, used to personalize generation — gender, age, height, weight, Fitness Level (per training type), training habits, default equipment, constraints, and recent-workout context. A mutable snapshot of "now"; metric history (e.g. weight over time) lives in progress records, not in versioned Profile rows. Each generation request may override the Profile's default equipment.
_Avoid_: Account, user data, settings

**Fitness Level**:
A 1–10 score of the user's ability, held **per training type** — a user can be Level 8 at strength training and Level 2 at yoga. It is the level dimension of the cache key for that type, and it advances over time as logged progress accumulates.
_Avoid_: Beginner/intermediate/advanced (as the stored value), skill, rank

**Progression**:
The deterministic, no-AI adjustment of an Exercise Prescription on the user's own copy, computed from Logged Sets (e.g. all reps hit at low perceived effort → advance). For a movement with an external weight it steps the recommended load; for a **bodyweight** movement carrying added load it steps that added load; for a **pure bodyweight** movement — where there is no weight to add — it steps the target reps and, at the top of the range, *suggests* advancing to a harder Variation rather than growing reps without bound. It never auto-swaps a movement (that stays a user-initiated Substitution). The primary mechanism by which recommendations adjust over time; leaves the cached artifact untouched.
_Avoid_: Progress (the records), adaptation

**Preference / Limitation**:
A non-medical constraint that steers exercise selection ("no running", "no jumping in the apartment", "avoid overhead but not injured"). Influences generation but does **not** trigger the safety cache bypass. Distinct from a Sensitive Constraint.
_Avoid_: Constraint (bare), restriction

## Generation & Reuse

**Generated Protocol / Generated Session**:
The immutable AI output produced for a given set of normalized parameters, stored in the cache and shareable across users. Never mutated. The source content from which a user's own Protocol or Session is made.
_Avoid_: Template, cached protocol (loosely), Generated Program

**Adopt**:
The act of taking a Generated Protocol or Generated Session and deep-copying it into a user-owned Protocol or Session that the user logs against, gives feedback on, swaps exercises in, and regenerates. Mutations only ever touch the user's copy.
_Avoid_: Assign, instantiate, clone

**Sensitive Constraint**:
A profile condition that demands extra caution — injury, rehabilitation, postpartum, or a flagged medical limitation. A user with any Sensitive Constraint is never served a shared/cached Generated Protocol; the system always generates fresh so postnatal/rehab caution can be applied.
_Avoid_: Restriction, limitation (generic)

## Readiness

**Readiness**:
A qualitative, three-state signal — **Ready**, **Caution**, or **Extra Caution** — of how cautiously the user should train right now, shown on the Home screen. It is derived from the user's constraints (a Sensitive Constraint forces Extra Caution; a Preference / Limitation or a recently hard performance yields Caution) and is deliberately **not** a computed recovery percentage: the self-paced, calendar-free plan model (ADR-0001) gives no honest basis for a "time since last workout" recovery score.
_Avoid_: Readiness score, recovery %, 87% ready

## Strength & Records

**Performed Body Weight**:
The user's body mass at the moment a Logged Set was performed, captured onto the record so a bodyweight set's strength estimate is fixed by what actually happened and can never drift when the user's current weight later changes. Distinct from the Fitness Profile's mutable "now" weight and from a dated body-metric reading. Absent on sets logged before it was captured, or when no weight was on file at log time — which simply leaves that set outside strength records rather than guessing a mass.
_Avoid_: Bodyweight (bare — collides with the Load kind), current weight, mass

**Estimated 1RM**:
A single comparable strength figure derived from one Logged Set's resolved Load and integer reps — an *estimate* of the heaviest single repetition the user could perform, never a measured lift. It is the common yardstick for detecting a Personal Record and for the per-Exercise strength number on the Exercise Detail screen. Defined for **absolute** Loads and for **bodyweight** Loads once resolved against the set's Performed Body Weight (plus any added load); still undefined for percent-of-1RM and qualitative Loads and for very-high-rep sets, where the estimate is not trustworthy. For a bodyweight movement it serves only as the *within-Exercise* ordering yardstick — full body weight is an unreliable absolute across movements (a push-up lifts far less of it than a pull-up), so a bodyweight record is never surfaced as a kilogram headline comparable to a barbell lift.
_Avoid_: 1RM (bare, implies a measured lift), one-rep max (as if tested)

**Personal Record (PR)**:
The best performance a user has ever logged for an Exercise, measured as the highest Estimated 1RM achieved on it. Comparable across rep ranges — a heavier estimated max at five reps outranks a lighter true single — so a PR reflects genuine strength gain, not merely the heaviest bar ever touched. Detected purely from Logged Sets (the record), never from a plan; absolute-Load sets, and **bodyweight sets carrying a Performed Body Weight**, within a trustworthy rep range can set one. Surfaced on the Exercise Detail screen as the single strength figure — never split into a separate "personal best" load tile, which would collide with this term. A bodyweight movement's record is shown as the *set* that achieved it (its reps and any added load), not as a kilogram figure, since bodyweight is an unreliable absolute across movements.
_Avoid_: Best, max weight, record (bare), personal best (for the raw heaviest load)

**Top Set**:
The single best Estimated 1RM set within one Logged Session for a given Exercise — that session's strength high-water mark. It is the per-session scalar the Exercise Detail top-set trend plots over the last several sessions, so the trend reads as Personal-Record trajectory on one yardstick. Distinct from the Personal Record, which is the best Top Set across *all* sessions; undefined for a session with no absolute-Load or Performed-Body-Weight set in the trustworthy rep range.
_Avoid_: Best set (bare), heaviest set, top weight

**Muscle Group**:
A coarse, curated bucket — Legs, Chest, Back, Shoulders, Arms, or Core — that a catalog Exercise's free-form targeted muscles roll up into, used to show how a user's training is distributed across the body on the Analytics screen. The mapping is curated, not AI-derived; a targeted muscle with no known mapping falls into an explicit **Unclassified** bucket rather than being silently dropped. Coarser than an Exercise's own targeted-muscle list, and distinct from the training-type dimension.
_Avoid_: Body part, region, muscle (bare)

**Muscle Group Coverage**:
Which of the six real Muscle Groups a stretch of the user's record has trained *at all* — a presence/absence fact per group, distinct from the proportional split (the Muscle Group distribution / balance). Read over a recent window on the Analytics screen and, all-time, by the Full Coverage Achievement; the two share one definition of "covered". The Unclassified bucket is never a coverage target — it is not a group anyone trains — though recent unmapped work is disclosed, never silently dropped. Descriptive only: coverage names what has and hasn't appeared, and never prescribes training a gap.
_Avoid_: Balance, distribution (those are the proportional split, not presence), quota, missed leg day

**Primary / Secondary Muscle**:
The emphasis split of an Exercise's targeted muscles: the Primary muscles are the prime movers a movement is chosen to train; the Secondary muscles assist. Their union is the Exercise's full targeted-muscle list — the durable set the Muscle Group roll-up reads — so the split is an *emphasis annotation* layered on top, not a replacement. Present only where the AI enrichment actually asserted it (or a curator did); an Exercise with no asserted split has no Primary/Secondary distinction and is shown as a flat muscle list rather than one with a fabricated primacy. Distinct from Muscle Group, which is the coarse six-bucket roll-up.
_Avoid_: Prime/assisting mover (as the stored term), main muscle

## Gamification

**XP**:
The honest experience currency of an account — a single accumulating figure derived **read-time** from the user's Logged Sessions and Logged Sets, never a stored, awarded, or write-hooked balance. Like a Personal Record, it is a pure projection of the *record*: a corrected, back-dated, or deleted log simply recomputes it, so it can never drift from what the user actually logged. It counts training-type-neutral units (Logged Sessions and attempted Logged Sets), deliberately **not** converted volume or Session Duration, so a yoga session and a barbell session earn comparably and no honesty caveat (load-conversion coverage, live-only duration) leaks in. It rewards work *performed*, not plan adherence, so an Incomplete Logged Session still earns XP for the sets attempted.
_Avoid_: Points (bare), score, balance, reward currency

**Operator Level**:
The account-wide progression tier a user's total XP maps into — a single unbounded number ("LVL 12") that climbs as lifetime logged work accumulates. Distinct from Fitness Level in every dimension: an Operator Level is **one number for the whole account** and measures *investment* (how much you have logged), whereas a Fitness Level is a **per-training-type 1–10 score** measuring *ability*. The UI may shorten it to "LVL"; it is never a Fitness Level, a rank, or a skill.
_Avoid_: Level (bare), Fitness Level, rank, XP level

**Streak**:
The number of consecutive weeks in which the user logged at least one Session — a consistency signal shown on Profile. Deliberately **weekly, not daily**: the plan model is self-paced and calendar-free (ADR-0001), so there is no "today" to miss, and a daily streak would pressure training through the rest days the domain's safety posture (Sensitive Constraints, Readiness caution) treats as legitimate. Derived **read-time** from Logged Sessions' dates — the same distinct-date basis as Analytics' active days, bucketed by week — so it recomputes from the record and is never a stored counter. Any Logged Session keeps it alive regardless of Completion Outcome (work performed, not plan adherence).
_Avoid_: Daily streak, don't-break-the-chain, active days (that is the distinct-date count, not the consecutive-week run)

**Achievement**:
A named, curated training milestone a user unlocks when their logged history satisfies its predicate — e.g. a session-count threshold, a Streak length, covering all six Muscle Groups, or a first Personal Record. A milestone that names another term reads **that term's own definition**, never a private variant: the first-Personal-Record milestone qualifies a set exactly as a Personal Record does, so a **bodyweight** set carrying a Performed Body Weight unlocks it on the same basis it sets a record on Home, Analytics, and Exercise Detail. Evaluated **read-time** over the record like a Personal Record: "unlocked" iff the predicate currently holds, with an honest unlock date recovered as the earliest point in the replayed history where it first held — there is no achievement table and no unlock write hook. The catalog is **curated and fixed** (like the Muscle Group buckets), not AI-generated, and deliberately **type-neutral** so a yoga or mobility user is never faced with an all-locked strength wall. A locked Achievement shows its criteria and live progress. Because it is a pure predicate over current logs, an Achievement can **re-lock** if the logs behind it are deleted — the same non-monotonicity as Operator Level.
_Avoid_: Badge (as a separate concept — it is the visual of an Achievement), trophy, unlock record, reward

## Feedback

Two distinct concepts. Never collapse them into one "Feedback".

**Generation Feedback**:
A positive/negative verdict on a generated/adopted Protocol or Session — "did the AI give me a good plan?" — with an optional free-text reason. Captured at the level being judged (Protocol or Session) and is the trigger for regeneration.
_Avoid_: Feedback (bare), rating

**Performance Feedback**:
The user's perceived effort/difficulty for a workout they actually did, recorded against a Logged Session or Logged Set. Part of the record; feeds future AI recommendations. Not a judgment of the plan's quality.
_Avoid_: Feedback (bare), RPE (loosely)

**Regeneration**:
Replacing the non-kept Exercise Prescriptions of a single Session with fresh AI output, conditioned on the kept Prescriptions and the negative Generation Feedback reason. Operates only on a Session (never a whole Protocol), on the user's own copy, and is limited to once per Session in v1. Produces **flat** replacement Prescriptions — Regeneration is **not Superset-aware** in v1: the prompt never asks for grouping, the path does not validate it, and the regenerate splice appends replacements without re-namespacing group tags, so any Superset the model volunteers is stripped rather than persisted invalid or colliding with a kept group (ADR-0023).
_Avoid_: Regenerate protocol, retry, redo
