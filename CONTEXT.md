# Workout Manager

An AI-assisted application for creating, following, and tracking fitness workouts. This glossary fixes the language used across the domain so that the *plan* a user is given and the *record* of what they actually did are never confused.

## Plan vs. Record

The single most important distinction in the domain: a **plan** is what the AI prescribes; a **record** is what the user actually performed. They are separate concepts, and the same plan can be performed many times.

**Program**:
A user-owned training plan: a fixed, fully enumerated set of Sessions spanning a user-chosen number of weeks. Every Session for every week is generated up front and occupies a specific position; the same logical workout may differ from week to week to express progression and deloads. A Program is the user's own copy (see Adopt) — mutating it never affects other users or the cache.
_Avoid_: Plan, routine, cycle

**Session**:
A single prescribed workout, composed of Exercise Prescriptions. One unified concept: a Session may belong to a Program (carrying a Week/Day position) or stand alone (generated on its own with no parent or position). It is a *plan*, not a record of execution. Logging and feedback work identically whether or not it belongs to a Program.
_Avoid_: Workout, training (when referring to the plan)

**Exercise**:
A movement definition in the shared, global catalog — name, description, targeted muscles, difficulty, required equipment, variations, alternatives, precautions. One Exercise (e.g. "Barbell Back Squat") is shared across all users; AI-invented movements are stored once and enriched once for everyone. Distinct from the prescription of its sets/reps.
_Avoid_: Movement, Exercise Prescription (when referring to the definition)

**Exercise Prescription**:
The prescription of one Exercise inside a Session — the sets, repetitions, rest, tempo, and recommended load the user is told to perform. References a catalog Exercise. Distinct from the Exercise definition.
_Avoid_: Exercise (when referring to the prescribed sets/reps)

**Provenance**:
Whether a catalog Exercise is `ai_generated` (created by the AI, unvalidated) or `curated` (reviewed and trusted). Carried on every Exercise so unvalidated content can be flagged, audited, and later merged or corrected — important given the domain's caution around injury, rehab, and postpartum cases.
_Avoid_: Source, origin, verified flag

**Logged Session**:
A record of the user performing a Session on a specific date. One Session can have many Logged Sessions over the course of a Program.
_Avoid_: Completed session, history entry

**Logged Set**:
A record of one actual set the user performed — the real repetitions, load, and perceived difficulty — within a Logged Session.
_Avoid_: Result, performance entry

## Generation & Reuse

**Generated Program / Generated Session**:
The immutable AI output produced for a given set of normalized parameters, stored in the cache and shareable across users. Never mutated. The source content from which a user's own Program or Session is made.
_Avoid_: Template, cached program (loosely)

**Adopt**:
The act of taking a Generated Program or Generated Session and deep-copying it into a user-owned Program or Session that the user logs against, gives feedback on, swaps exercises in, and regenerates. Mutations only ever touch the user's copy.
_Avoid_: Assign, instantiate, clone
