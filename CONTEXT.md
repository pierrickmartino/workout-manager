# Workout Manager

An AI-assisted application for creating, following, and tracking fitness workouts. This glossary fixes the language used across the domain so that the *plan* a user is given and the *record* of what they actually did are never confused.

## Plan vs. Record

The single most important distinction in the domain: a **plan** is what the AI prescribes; a **record** is what the user actually performed. They are separate concepts, and the same plan can be performed many times.

**Protocol**:
A user-owned training plan: a fully enumerated set of Sessions spanning a user-chosen number of weeks, each Session occupying a specific position; the same logical workout may differ from week to week to express progression and deloads. It originates as the user's own copy of an AI generation (see Adopt) and may then be **edited directly by the user** — reshaping the number of weeks and the per-week session count, adding or removing Sessions, and authoring Exercise Prescriptions by hand — so a Protocol's content is not necessarily wholly AI-generated. Editing only ever reaches the *un-performed* remainder: a Session the user has already performed is settled record and is never rewritten or reordered. May carry a user-given name. Mutating a Protocol never affects other users or the cache.
_Avoid_: Plan, routine, cycle, Program

**Current Protocol**:
The one Protocol a user is actively working through — the most recently adopted Protocol that still has an un-performed Session. It is the Protocol the Home screen surfaces the Next Session and the remaining queue from. A user may own several Protocols but has at most one Current Protocol at a time; when none exists, Home falls back to prompting a new generation. Generating a new Protocol therefore **supersedes** the prior Current Protocol: the new one is now the most-recently-adopted with an un-performed Session, so it becomes Current and the old one is **set aside** — still owned, its records intact, but no longer surfaced and not (in v1) switched back to. A Protocol is never deleted.
_Avoid_: Active plan, selected protocol, today's protocol, delete/discard/abandon/archive (a superseded Protocol is set aside, never removed)

**Next Session**:
The next un-performed Session in a self-paced Protocol's ordered sequence — what the user is prompted to do next. There is no calendar; "next" means next in position, never a dated "today". The thing a user initiates from Home is always a Session, never a whole Protocol.
_Avoid_: Today's session, today's protocol, scheduled session

**Session**:
A single prescribed workout, composed of Exercise Prescriptions. One unified concept: a Session may belong to a Protocol (carrying a Week/Day position) or stand alone (generated or hand-authored on its own, with no parent or position). It is a *plan*, not a record of execution. Logging and feedback work identically whether or not it belongs to a Protocol.
_Avoid_: Workout, training (when referring to the plan)

**Training Type**:
The kind of training a Session is, drawn from a small curated set — **strength**, **cardio**, **hiit**, **yoga**, or **mobility**. It is the dimension a **Fitness Level** is held per (a user can be Level 8 at strength and Level 2 at yoga), and it is carried on both the *plan* (a Session) and the *record* — every **Logged Session** declares its own, so History and Analytics can slice by it without reaching back to a plan, and a plan-less Logged Session (which has no plan behind it) still names one. The set is curated and fixed, never AI- or user-invented; a plan-less record's Training Type is the one such field a **Log Correction** may change. Distinct from **Muscle Group** (the coarse anatomical roll-up) and from the endurance / Quantity-kind axis; there is no finer activity taxonomy (running vs. cycling) in v1.
_Avoid_: Modality, discipline, category, workout type, session type

**Hand-Authored Session**:
A Session a user builds by hand with **no AI call** — choosing its Exercise Prescriptions, sets, reps, rest, tempo, Load, and Supersets directly — to record training done outside any generated plan. It is a first-class standalone Session (no Protocol parent) that **persists as a reusable plan** and is logged, re-logged, and corrected exactly like a generated one. Distinct from a plan-less Logged Session, which records sets with *no plan at all* behind them: a Hand-Authored Session *is* a plan, merely not an AI-authored one. Its Session Provenance is `user_authored`.
_Avoid_: Custom workout, manual workout, Workout, my routine

**Session Provenance**:
How a Session's plan came to exist: `ai_generated` (produced by the generation pipeline) or `user_authored` (built by hand, no AI — a Hand-Authored Session). Carried on every Session so plan-quality affordances that assume the AI wrote it — Generation Feedback and Regeneration — are never offered on a `user_authored` plan. Parallel to an Exercise's Provenance and named the same way, but a distinct axis on a distinct concept (the plan, not the movement).
_Avoid_: Origin, source, generated flag

**Catalog**:
The shared, global set of all Exercises — one movement definition per normalized name (ADR-0002), owned by no user and reused across everyone: an AI-invented or user-typed movement is stored once for all. Its entries span every Provenance (curated / AI-generated / user-entered) and every Catalog Completeness tier (Stub / Listable / Enriched), and membership is never deleted. Users **Browse the Catalog** to discover Exercises and open Exercise Detail — a read-only act that never edits it. Distinct from a Protocol or Session, which are user-owned plans that *reference* Catalog Exercises.
_Avoid_: Library (that is the pick-mode widget over the Catalog, not the Catalog itself), database, exercise list, movement list

**Exercise**:
A movement definition in the shared, global Catalog — name, description, ordered Execution Steps, targeted muscles (split into Primary and Secondary), difficulty, required equipment, variations, alternatives, precautions, and an optional Exercise Image. One Exercise (e.g. "Barbell Back Squat") is shared across all users; AI-invented movements are stored once and enriched once for everyone. Distinct from the prescription of its sets/reps.
_Avoid_: Movement, Exercise Prescription (when referring to the definition)

**Execution Steps**:
The ordered sequence of instructions for performing an Exercise — an enumerated list of discrete steps, not a prose blob. The count of steps reflects what the author (AI enrichment) actually wrote; there is no sentence-level chopping that fabricates step boundaries. An Exercise with no discrete steps carries a single step (rendered as plain guidance) rather than a false "step 01 of 1".
_Avoid_: Instructions (as free text), how-to, description

**Exercise Prescription**:
The prescription of one Exercise inside a Session — the sets, prescribed **Quantity** (a typed reps / distance / duration target, not a bare rep count — ADR-0050), rest, tempo, and recommended **Load** the user is told to perform. References a catalog Exercise. Distinct from the Exercise definition.
_Avoid_: Exercise (when referring to the prescribed sets/reps)

**Superset**:
An ordered group of two or more Exercise Prescriptions within one Session, performed in **rounds** — one set of each member in turn — resting only at the **round boundary**, never between members. It is an ordering-and-rest overlay on Prescriptions: it does not change what each set *is* (reps, load, and muscle attribution are unchanged), only the sequence in which sets are performed and where rest falls. A Prescription belongs to at most one Superset, and Supersets do not nest. The one umbrella term covers two members and many (no separate "circuit" or "giant set").
_Avoid_: Circuit, giant set, block, group (bare, collides with Muscle Group), module (that is one Prescription), compound set

**Load**:
The weight prescribed or performed for a set, expressed as one of several *kinds* rather than a bare number: an **absolute** weight (e.g. 70 kg), **bodyweight** (optionally plus added load), a **percent of 1RM**, a **qualitative** effort ("moderate"), or a **range**. Only absolute loads — and bodyweight / percent loads once resolved against the user's mass or estimated 1RM — carry a numeric weight; qualitative loads never do. The free-text-ness is essential to the domain: the AI legitimately prescribes bodyweight and %-based work, so a Load is a *typed value*, never reducible to a single kg figure.
_Avoid_: Weight (bare), tonnage (for a single set), kg (as the only form)

**Quantity**:
How much of a movement a set prescribes or records, expressed as one of several *kinds* rather than a bare repetition count: a number of **repetitions**, a **distance** covered, or a **duration** worked or held. The counterpart axis to Load — Load is how hard, Quantity is how much — and typed for the same reason: a 10 km run and a set of eight squats are both real sets, and reducing either to a repetition count destroys its meaning. Derived figures such as pace are never stored on a Quantity; they are read-time projections of it, as Estimated 1RM is of a Load.
_Avoid_: Reps (bare — that is one kind), work, volume (that is kg tonnage), amount, measure

**Tempo**:
The prescribed speed of a repetition's phases on an Exercise Prescription, written as the standard 3- or 4-number notation — lowering / pause / lifting (/ pause at top), each figure a count of seconds. Read by the standard **eccentric-first** convention regardless of whether a movement actually begins with the lift (a deadlift or pull-up is not re-inspected per exercise), with a `0` or `X` in a movement phase meaning *explosive* and a `0` in a pause phase meaning *no pause*. The raw code is the stored form; the plain-language phase expansion ("3s lower · 1s pause · 1s lift") and a coarse, curated **three-state label** — **Explosive**, **Controlled**, or **Slow** — are **read-time projections** of it, never stored. The label is a signal, not a score: a deterministic function of the parsed tempo (explosive lift wins, then a slow/paused eccentric, else controlled), the same species as the three-state Readiness signal. A value that does not parse as 3- or 4-token notation falls back to its raw text rather than a fabricated interpretation.
_Avoid_: Cadence, rep speed, rep timing

**Provenance**:
How a catalog Exercise came to exist and how far it can be trusted: `curated` (reviewed by a human, trusted), `ai_generated` (invented by the AI, unvalidated), or `user_entered` (typed by a user when logging an ad-hoc movement with no AI call — the least-validated tier, born with only a name). It is **immutable origin**: Enrichment fills a movement's fields but never changes its Provenance, so AI-filled content on a `user_entered` movement stays `user_entered` and never masquerades as human-reviewed. Carried on every Exercise so unvalidated content can be flagged, audited, and later enriched, merged, or corrected — important given the domain's caution around injury, rehab, and postpartum cases. A different axis from Catalog Completeness, which is *content presence*, not *trust*.
_Avoid_: Source, origin, verified flag

**Catalog Completeness**:
Whether a catalog Exercise meets the shared quality bar, expressed as a **read-time projection** over its populated fields — never a stored flag — in three states: **Stub** (name only), **Listable** (has a description, a non-empty targeted-muscle list, and at least one Execution Step), and **Enriched** (additionally carries the Primary/Secondary split, difficulty, precautions, and an Exercise Image). Measured **provenance-blind** — a `curated`, `ai_generated`, or `user_entered` Exercise is held to the same yardstick, so even a curated seed can read as sub-bar. A distinct axis from Provenance, which is *origin and trust*, not *content presence* (ADR-0041).
_Avoid_: Quality score, completeness flag/column, verified (that is Provenance), rating

**Enrichment**:
The act of lifting a catalog Exercise toward the quality bar — filling its description, targeted muscles, and (at the Enriched tier) the Primary/Secondary split and difficulty. Runs **out-of-band, never on the write path** (creation stays AI-free, ADR-0002): asynchronously when a Stub is first minted, and by a human-triggered batch that backfills the existing catalog. It **never changes Provenance** and **never writes precautions or an Exercise Image** — those are curator-only, because a fabricated safety note or a wrong illustration is actively dangerous, not merely low-quality (ADR-0041).
_Avoid_: Enrich-on-write, backfill (bare — that is one trigger), promotion (it never promotes Provenance)

**Exercise Image**:
An optional illustrative picture for a catalog Exercise, shown on Exercise Detail. **Curated-source only and never AI-fabricated** — anatomically misleading generated imagery is a safety hazard in an injury/rehab-cautious domain — and part of the Enriched (gold) tier, so its absence never holds a movement below the Listable bar. User uploads are deferred (ADR-0041).
_Avoid_: Photo, thumbnail, media, AI-generated image

**Variation**:
A catalog Exercise that is the *same* movement pattern as another, scaled in difficulty or execution (knee push-up is a Variation of push-up). Modeled as a typed relationship between Exercises.
_Avoid_: Progression, regression, scaling (as the relationship name)

**Alternative**:
A catalog Exercise that achieves a *similar* training effect or targets the same muscles as another, used when equipment is missing or the movement is contraindicated (goblet squat as an Alternative to barbell squat). Modeled as a typed relationship between Exercises — distinct from a Variation.
_Avoid_: Substitute, replacement (as the relationship name)

**Substitution**:
The act of swapping one Exercise Prescription's Exercise for a Variation or Alternative within the user's own Session copy. Resolved lookup-first over catalog relationships (filtered by the user's equipment, constraints, and goal), falling back to AI only when no suitable link exists. Unlimited and distinct from Regeneration.
_Avoid_: Swap, replace (as the domain term)

**Insert**:
The act of a user **hand-authoring a new Exercise Prescription into their own standalone Session**, in place and with **no AI call** — picking a catalog Exercise and its sets, Quantity, rest, tempo, and Load, appended at the end as a **solo (non-Superset)** Prescription in v1. Edits the *plan* only: it never reaches the *record*, so a Session's past Logged Sessions are frozen (plan/record separation) and only **future** performances see the added movement — the same in-place plan-edit semantics as **Substitution**, which swaps a Prescription rather than adding one. **Session Provenance is immutable origin and unchanged**: inserting into an `ai_generated` Session leaves it `ai_generated`, so Generation Feedback and Regeneration stay available (hand-adding a Prescription never makes a plan's content "wholly user-authored"). Offered on **standalone Sessions only** (generated or Hand-Authored); adding a Prescription to a Protocol-member Session goes through the Builder's tail-gated **Deploy** instead (ADR-0051). Distinct from **Substitution** (swap, not add), **Regeneration** (AI replacement of non-kept Prescriptions), and **Deploy** (the Protocol tail-edit commit).
_Avoid_: Add (bare), Append, Substitute (that is the swap), Insert a Session (that is a Builder/Deploy tail edit)

**Remove**:
The act of a user **withdrawing one Exercise Prescription from their own standalone Session**, in place and with **no AI call** — the symmetric partner of **Insert**. Edits the *plan* only: it never reaches the *record*, so a Session's past Logged Sessions are frozen (plan/record separation) and only **future** performances drop the withdrawn movement. The surviving Prescriptions are re-numbered into a contiguous sequence, and a **Superset** left with a single member is dissolved to a **solo** Prescription (a lone tagged member is not a Superset). A Session must keep at least one movement, so the **last remaining** Prescription cannot be removed. **Session Provenance is immutable origin and unchanged**: removing from an `ai_generated` Session leaves it `ai_generated`, so Generation Feedback and Regeneration stay available. Offered on **standalone Sessions only** (generated or Hand-Authored); removing a Prescription from a Protocol-member Session goes through the Builder's tail-gated **Deploy** instead (ADR-0052). Distinct from **Substitution** (swap, not remove), **Insert** (add, not remove), and **Deploy** (the Protocol tail-edit commit).
_Avoid_: Delete, Drop, Withdraw (bare), Remove a Session (that is a Builder/Deploy tail edit)

**Pinned Target**:
A user-set **rep range** committed onto one Exercise Prescription in the user's own copy, replacing the prescribed **Quantity** of the **next un-performed occurrence** of that movement and **suspending automatic Progression** for it until un-pinned. Unlike the read-time Progression overlay it supersedes, a Pinned Target is **stored**; it is confined to **pure-bodyweight** rep prescriptions (the one axis Progression steps by reps) and reaches only the single next occurrence, so a Protocol's built-in later-week deloads are left intact. Touches the *plan* only: the Logged Session that prompted it is settled record and unchanged, and Session Provenance is immutable (`ai_generated` stays `ai_generated`).
_Avoid_: Override, Locked target, Custom target, Goal, stored progression

**Pin**:
The act of a user committing a **Pinned Target** from the log flow — offered after a bodyweight Logged Session in which **every working set beat the top** of the prescribed rep range — through a confirm dialog **pre-filled with the reps performed** and editable before saving, which the same dialog pairs with the alternative of stepping up to a harder **Variation**. **Reversible** via **un-pin**, which restores automatic Progression. Offered on any bodyweight Session, Protocol-member or standalone (where it edits that Session's prescription in place). Distinct from **Progression** (the automatic, read-time step this suspends), and from **Insert / Remove / Substitution** (which add, withdraw, or swap a Prescription rather than re-target one).
_Avoid_: Override, Lock (implies permanent — a Pin is reversible), Set (bare), Bump, Progression (that is the automatic step)

**Live Session**:
A single performance of a Session while it is underway — after the user starts training, before it becomes a Logged Session. The transient, in-flight precursor to a Logged Session: it holds the sets done so far, which set is current, and how long the workout has been running. It is a *record being built*, never a plan. It becomes a Logged Session when the user finishes — or is automatically ended as Incomplete after a prolonged gap of inactivity, so a recorded Session Duration never counts time the user was away.
_Avoid_: Active Session, active plan, workout in progress

**Logged Session**:
A record of the user performing a Session on a specific date. One Session can have many Logged Sessions over the course of a Protocol.
_Avoid_: Completed session, history entry

**Logged Set**:
A record of one actual set the user performed — the real Quantity, Load, and perceived difficulty — within a Logged Session. A "set" is not exclusively a strength concept: one 800 m interval of a running session is a Logged Set exactly as one set of eight squats is.
_Avoid_: Result, performance entry

**Completion Outcome**:
Whether a Logged Session is **Completed** or **Incomplete** — a property of the record itself. Completed when every prescribed set of the Session was attempted, regardless of the reps or load achieved; Incomplete when any prescribed set was left un-attempted. A set ground out to zero reps is still *attempted*, so missing reps or training to failure never makes a Session Incomplete — only un-done prescribed work does. Only a Completed Logged Session advances a Protocol to its Next Session; an Incomplete one leaves that Session as next and must be retried by running the whole Session again.
_Avoid_: Failed, partial, abandoned (as the domain term); status

**Session Duration**:
The elapsed active time of a Logged Session — measured from when the user starts training to their last recorded activity, deliberately excluding any prolonged idle gap so the figure reflects time actually training, not wall-clock time with the phone locked. Known only when the performance was tracked live; absent when a performance is logged after the fact. It is the honest basis a future average-workout-time figure would build on.
_Avoid_: Elapsed time, workout length, wall-clock time

**Deploy**:
The atomic commit of a Builder edit — the whole staged reshaping of a Protocol's **un-performed tail** (added or removed Sessions, reshaped weeks and per-week counts, hand-authored Exercise Prescriptions, and the Protocol name) validated and written in one call, or **rejected whole with nothing persisted** so a rejected edit names its offending item(s) and leaves the plan untouched. It only ever reaches the un-performed tail; the performed prefix passes through **byte-for-byte** and its Sessions are re-enumerated into contiguous positions after it (ADR-0020/0021). Touches the *plan*, never the *record*. Distinct from **Adopt** (which *creates* a Protocol by deep-copying a generation) and from **Progression** (which adjusts a single recommended Load); the one act that commits a Builder edit.
_Avoid_: Save, publish, apply, submit

**Log Correction**:
The act of a user editing or deleting one of their own Logged Sessions after the fact — fixing, removing, or **adding** its Logged Sets, and fixing its date, duration, or (plan-less only) training type, or removing a mis-logged performance entirely. An **added** Logged Set may record **any catalog movement**, including one the plan never prescribed ("I also did dips") — the record is what the user *did*, not a mirror of the plan; such an off-plan set **never changes the Completion Outcome** (it is not *prescribed* work, so a Completed Session stays Completed) and **never trips the contiguity gate** (adding attempted work cannot un-settle a later Session). Touches only the *record*, never a plan: XP, Personal Records, Streak, Achievements, and Protocol advancement are read-time projections that simply recompute, and the performance's Performed Body Weight is carried forward from the record, never re-read from the now-changed Profile. It is the first act that mutates the record (Progression and the Builder's tail-edit touch the plan). Refused only when it would un-settle a Session that a later performed Session depends on, so the performed sequence stays gap-free.
_Avoid_: Edit history, amend, revise, log update

## Profile

**Fitness Profile**:
The user's current state, used to personalize generation — gender, age, height, weight, Fitness Level (per training type), training habits, Default Equipment, constraints, and recent-workout context. A mutable snapshot of "now"; metric history (e.g. weight over time) lives in progress records, not in versioned Profile rows. A generation request may state its own Available Equipment, which replaces the Default Equipment for that generation.
_Avoid_: Account, user data, settings

**Default Equipment**:
The kit a user records on their Fitness Profile as normally available — a saved list that serves as the base Available Equipment for their generations. It is a stored preference, not a per-generation choice: a request that states no Available Equipment inherits it.
_Avoid_: Available Equipment (that is the per-generation set), gear, kit

**Available Equipment**:
The equipment a single generation actually runs with. A generation request may state its own Available Equipment — which replaces the Default Equipment for that generation — or leave it unstated, in which case the Default Equipment applies. Stating *no* equipment is itself a choice (bodyweight only), distinct from leaving it unstated, so a user with saved Default Equipment can still request a bodyweight-only plan.
_Avoid_: Default Equipment (that is the saved base), equipment (bare)

**Fitness Level**:
A 1–10 score of the user's ability, held **per training type** — a user can be Level 8 at strength training and Level 2 at yoga. It is the level dimension of the cache key for that type, and it advances over time as logged progress accumulates.
_Avoid_: Beginner/intermediate/advanced (as the stored value), skill, rank

**Progression**:
The deterministic, no-AI adjustment of an Exercise Prescription on the user's own copy, computed from Logged Sets (e.g. all reps hit at low perceived effort → advance). For a movement with an external weight it steps the recommended load; for a **bodyweight** movement carrying added load it steps that added load; for a **pure bodyweight** movement — where there is no weight to add — it steps the target reps and, at the top of the range, *suggests* advancing to a harder Variation rather than growing reps without bound. It never auto-swaps a movement (that stays a user-initiated Substitution). The primary mechanism by which recommendations adjust over time; leaves the cached artifact untouched. A Prescription carrying a **Pinned Target** is exempt: **Pin** suspends automatic Progression for that occurrence until un-pinned.
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

**Duplicate**:
The act of a user deep-copying a **Session they already own** into a new **standalone** Session — a reusable *plan*, never a record. Copies the source's Exercise Prescriptions, Supersets, and per-set sets/reps/rest/tempo/Load faithfully, and carries the source's **Session Provenance and `trace_id` lineage forward unchanged** (an `ai_generated` Session stays `ai_generated`, so Generation Feedback and Regeneration remain available on the copy; a `user_authored` one stays `user_authored`). The copy carries **no Logged Sessions** (plan/record separation) and **no Protocol position** — a Protocol-member Session's Week/Day/position are dropped so the copy stands alone. The source is untouched; mutating either copy never affects the other. Unlimited. Distinct from **Adopt** (which copies an *immutable Generated* artifact, not a user's own Session), **Deploy** (which commits a Builder tail-edit into a Protocol), and **Substitution** (which swaps one Exercise).
_Avoid_: Clone, copy (bare), Adopt (that is the Generated-artifact copy), Capture (that is the record→plan promotion), template

**Capture**:
The act of a user turning one of their own **plan-less Logged Sessions** (an ad-hoc record, no `session_id`) into a new **standalone Session** — a reusable *plan* synthesized from what they actually performed. Crosses the plan/record line the opposite way from Duplicate: Duplicate copies an existing Session (*plan → plan*); Capture turns a plan-less *record into a plan* (*record → plan*). Because it authors a fresh plan from a record that had none behind it, the result is always a `user_authored` Hand-Authored Session with no `trace_id` lineage — never `ai_generated` (contrast Duplicate, which preserves the source's Provenance and lineage). The synthesized plan carries the performed exercises, per-set counts, and loads forward as an editable seed; **rest, tempo, and Supersets are left unset** — the record never captured them — for the user to finalize before saving. The source record is left plan-less and **untouched**: Capture spawns a plan *alongside* it, never converts or re-links it, and the new plan carries **no Logged Sessions** (plan/record separation). Offered only on a plan-less record; a plan-backed record reuses its plan through **Repeat** instead.
_Avoid_: Promote, convert, save-as-plan (bare), Duplicate (that is the plan→plan copy), Adopt

**Repeat**:
The act of running one of a user's own **plan-backed** Logged Sessions again by returning to its **existing source Session** (the plan) — where the user can Start a new Live Session or Log it after the fact. **No copy is made and nothing new is authored**: Repeat is pure navigation back to the source plan, touching neither plan nor record. It is the record-side "do this workout again," reachable from the record (History); a plan-less record has no plan to return to and offers **Capture** instead, so the two are mutually exclusive. Distinct from **Duplicate** (which forks a *separate editable copy* of a Session for divergent editing), **Adopt** (which copies an immutable Generated artifact), and **Capture** (record→plan). Because it reuses the one shared source plan, later edits to that plan are seen by every Repeat — unlike Duplicate, which forks an independent copy.
_Avoid_: Redo, re-run (bare), Duplicate (that forks a copy), Clone, Adopt

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

## Endurance

**Distance**:
A **read-time projection** of the endurance axis: the total kilometres a stretch of the user's record covered, summed from the metres of every **`distance`-kind Quantity** on their Logged Sets and bucketed **by week** (the shared Monday week-start the Streak and Muscle-Group balance use). It is the endurance counterpart to Volume's kg tonnage — computed from the *record* at read time, never a stored ledger (ADR-0018/0049) — but, because a `distance` Quantity already carries exact metres, it converts **without partiality**: there is no coverage caveat as tonnage has. Surfaced on the Analytics screen as the **Weekly Distance** chart, shown only to a user whose history contains distance work. A set logged by time alone (a `duration` Quantity) carries no distance and simply does not appear; **combined across all distance work in v1**, with no per-activity split — a running / cycling / rowing breakdown would need an activity taxonomy the domain does not yet have (ADR-0049).
_Avoid_: Mileage (imperial; the app is metric-canonical), volume (that is kg tonnage), pace (a separate distance÷duration projection), cardio (the activity, not this figure)

## Analytics

**History Depth**:
The span from a user's **earliest Logged Session** to now — a **read-time** signal, never stored, that gates which Analytics **windows** (30D / 90D / 150D) the range selector offers. A longer window is offered only once History Depth reaches **past** the next-shorter one, so a window is never shown when its graph would merely repeat the shorter window's ("if the graphs are the same, there is no interest"): 90D needs depth past 30 days, 150D past 90 days, and 30D is the always-available floor (ADR-0049). Measured as the oldest-session age — the same record-derived species as Streak and XP — so a user with no history is offered only the 30D floor. The gate is enforced server-side: an out-of-depth requested window is **clamped** to the deepest available one rather than served a redundant graph (ADR-0056).
_Avoid_: History length, data range, retention, window depth, coverage (that is Muscle Group Coverage)

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

**Training Heatmap**:
A GitHub-style mosaic on Profile — one cell per **day** over a **rolling trailing ~53 weeks**, Monday-aligned columns (the shared week edge the Streak and Weekly Distance use) — shaded by the count of **attempted Logged Sets** logged that day. A **read-time projection** of the record (ADR-0018/0054), never stored: a corrected or deleted log simply recomputes it. Deliberately and strictly **descriptive** — it derives **no** daily run, **no** daily streak, and **no** daily Achievement; the weekly **Streak** stays the sole consecutiveness metric, so the calendar-free "no today" model (ADR-0001) is never reintroduced as a chain to defend. Shade buckets are **fixed** (coarse, tunable constants), never per-user relative, so a past day's cell never recolors when later logs land — a settled record is never re-rendered (ADR-0020). Empty days render **neutral** ("nothing logged"), never as a shamed "missed" cell; a user with under a year of history shows the full frame with neutral pre-history. A cell is *a day*, not an **active day** (that is Analytics' distinct-date scalar count, a different thing).
_Avoid_: Activity heatmap (activity is vague), Contribution graph, daily streak / don't-break-the-chain (the mechanic this deliberately omits), active days (that is the Analytics scalar count), calendar / training calendar (there is no calendar binding, ADR-0001), consistency grid

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

## Appearance & Theming

**Theme**:
The rendered appearance of the app for one user at one moment — always the *composition* of the app-wide **Skin** and that user's own **Mode**, never a single stored choice. There is no "the theme": what a user sees is a global visual identity (the Active Skin) expressed at their chosen surface polarity (their Mode).
_Avoid_: Style, look, colour scheme (as the concept name)

**Skin**:
A named **visual identity** — the coordinated **colour, typography, and shape** the whole app draws with (ADR-0050). Skins come from a **fixed, curated catalog** (never user- or AI-authored). A Skin's **colour** is polarity-dependent, so each Skin defines **both a light and a dark variant** and composes with any Mode; its **typography** (typefaces) and **shape** (corner roundness) are Mode-invariant, defined once per Skin. Exactly one Skin is live app-wide at a time (the Active Skin); an ordinary user never chooses a Skin. Distinct from Mode, which is the light/dark polarity chosen *within* a Skin.
_Avoid_: Theme (bare), palette / colour scheme (a Skin is more than its colours; palette names only the colour group)

**Mode**:
A user's chosen surface polarity — **Light**, **Dark**, or **System** — applied on top of whichever Skin is active. Held per user and the **only** appearance choice an ordinary user makes; System defers to the device's own light/dark preference rather than a fixed polarity. Distinct from Skin, the palette family a Mode is expressed within.
_Avoid_: Theme, dark mode (as the concept name), colour scheme

**Active Skin**:
The single Skin currently published for the whole app — what every user's Mode renders within until it changes. Exactly one exists at any moment, defaulting to the original **PULSE** Skin. Only an **admin** changes it, and only by **publishing**: a Skin is previewed privately first, then deliberately made the Active Skin for everyone, restyling the app on each user's *next visit* rather than mid-action. The admin who publishes is the **admin** — never the "Operator", which would collide with Operator Level.
_Avoid_: Current theme, global theme, default skin (that is only the Active Skin's starting value)

**Interface Preference**:
A user's own per-account UI choice — read-time state that steers how the app **behaves or presents** for them, never what the AI generates — kept deliberately **separate from the Fitness Profile**. The Fitness Profile is what the AI conditions a generation on; an Interface Preference steers nothing about the plan and must never leak into generation or its cache key. Server-synced so the choice follows the user across devices (ADR-0047, ADR-0055). Its members are the user's **Mode** (the appearance facet — an **Appearance Preference**) and whether to **Keep Screen Awake** during a Live Session.
_Avoid_: Settings, profile (that is the generation-input Fitness Profile)

**Appearance Preference**:
The **appearance** facet of a user's **Interface Preference** — specifically their **Mode**. Named separately because appearance is the facet ADR-0047 first carved out of the Fitness Profile; like any Interface Preference it steers nothing about the plan and never reaches generation or its cache key.
_Avoid_: Settings, profile (that is the generation-input Fitness Profile), theme

**Keep Screen Awake**:
A user's **Interface Preference** for whether the device screen is held on while a **Live Session** is underway — a best-effort, **client-only** screen wake lock, defaulting **on** (ADR-0055). Purely ephemeral UI behaviour (ADR-0012): it is never part of the record, never reaches generation, and does **not** change idle auto-end (ADR-0014), which still measures from last activity.
_Avoid_: No-sleep, wake lock (that is the browser API behind it, not the user's preference)
