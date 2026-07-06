# Workout Manager

An AI-assisted application for creating, following, and tracking fitness workouts. This glossary fixes the language used across the domain so that the *plan* a user is given and the *record* of what they actually did are never confused.

## Plan vs. Record

The single most important distinction in the domain: a **plan** is what the AI prescribes; a **record** is what the user actually performed. They are separate concepts, and the same plan can be performed many times.

**Protocol**:
A user-owned training plan: a fixed, fully enumerated set of Sessions spanning a user-chosen number of weeks. Every Session for every week is generated up front and occupies a specific position; the same logical workout may differ from week to week to express progression and deloads. A Protocol is the user's own copy (see Adopt) — mutating it never affects other users or the cache.
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
A movement definition in the shared, global catalog — name, description, targeted muscles, difficulty, required equipment, variations, alternatives, precautions. One Exercise (e.g. "Barbell Back Squat") is shared across all users; AI-invented movements are stored once and enriched once for everyone. Distinct from the prescription of its sets/reps.
_Avoid_: Movement, Exercise Prescription (when referring to the definition)

**Exercise Prescription**:
The prescription of one Exercise inside a Session — the sets, repetitions, rest, tempo, and recommended load the user is told to perform. References a catalog Exercise. Distinct from the Exercise definition.
_Avoid_: Exercise (when referring to the prescribed sets/reps)

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
The deterministic, no-AI adjustment of an Exercise Prescription's recommended load on the user's own copy, computed from Logged Sets (e.g. all reps hit at low perceived effort → increase load). The primary mechanism by which recommendations adjust over time; leaves the cached artifact untouched.
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

**Estimated 1RM**:
A single comparable strength figure derived from one Logged Set's absolute Load and integer reps — an *estimate* of the heaviest single repetition the user could perform, never a measured lift. It is the common yardstick for detecting a Personal Record and for the per-Exercise strength number on the Exercise Detail screen. Undefined for non-absolute Loads (bodyweight, percent-of-1RM, qualitative) and for very-high-rep sets, where the estimate is not trustworthy.
_Avoid_: 1RM (bare, implies a measured lift), one-rep max (as if tested)

**Personal Record (PR)**:
The best performance a user has ever logged for an Exercise, measured as the highest Estimated 1RM achieved on it. Comparable across rep ranges — a heavier estimated max at five reps outranks a lighter true single — so a PR reflects genuine strength gain, not merely the heaviest bar ever touched. Detected purely from Logged Sets (the record), never from a plan; only absolute-Load sets within a trustworthy rep range can set one.
_Avoid_: Best, max weight, record (bare)

**Muscle Group**:
A coarse, curated bucket — Legs, Chest, Back, Shoulders, Arms, or Core — that a catalog Exercise's free-form targeted muscles roll up into, used to show how a user's training is distributed across the body on the Analytics screen. The mapping is curated, not AI-derived; a targeted muscle with no known mapping falls into an explicit **Unclassified** bucket rather than being silently dropped. Coarser than an Exercise's own targeted-muscle list, and distinct from the training-type dimension.
_Avoid_: Body part, region, muscle (bare)

## Feedback

Two distinct concepts. Never collapse them into one "Feedback".

**Generation Feedback**:
A positive/negative verdict on a generated/adopted Protocol or Session — "did the AI give me a good plan?" — with an optional free-text reason. Captured at the level being judged (Protocol or Session) and is the trigger for regeneration.
_Avoid_: Feedback (bare), rating

**Performance Feedback**:
The user's perceived effort/difficulty for a workout they actually did, recorded against a Logged Session or Logged Set. Part of the record; feeds future AI recommendations. Not a judgment of the plan's quality.
_Avoid_: Feedback (bare), RPE (loosely)

**Regeneration**:
Replacing the non-kept Exercise Prescriptions of a single Session with fresh AI output, conditioned on the kept Prescriptions and the negative Generation Feedback reason. Operates only on a Session (never a whole Protocol), on the user's own copy, and is limited to once per Session in v1.
_Avoid_: Regenerate protocol, retry, redo
