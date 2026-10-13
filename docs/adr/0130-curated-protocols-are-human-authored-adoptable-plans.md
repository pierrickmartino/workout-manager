# 0130 — Curated Protocols are human-authored, adoptable plans with their own provenance

**Status:** accepted

Competitors such as Boostcamp win users by offering established training methodologies to
pick from. Our only way to get a Protocol today is AI generation, which asks a beginner or an
AI-skeptic to trust a plan nobody vouches for, and costs an LLM call every time. We add a small
set of **Curated Protocols**: immutable plans written by a person, shipped in the repo, and
**Adopted** by copy beside generation. The surprising part is what we refused to reuse: a
Curated Protocol is *not* a Generated Protocol, and it gets its own Session Provenance.

## What a Curated Protocol is

- **A third Session Provenance, `curated`.** A Generated Protocol is defined as immutable *AI*
  output, and `ai_generated` turns on Regeneration and Generation Feedback ("did the AI give me
  a good plan?"). Neither is true of a hand-written plan, and filing it as `user_authored`
  would credit a staff account as its Author. `curated` is named after the matching Exercise
  Provenance value, which means the same thing on the movement axis: reviewed by a human.
- **Adopt is widened, not duplicated.** Adopting a Curated Protocol deep-copies it into a
  user-owned Protocol with exactly the semantics of adopting a Generated one: the copy is the
  user's, and changing it never touches the source or other users. The domain already has four
  copy verbs (Adopt, Duplicate, Redeem, Capture), so we don't add a fifth.
- **Lineage is kept.** The adopted Protocol remembers which Curated Protocol and version it came
  from. That link is immutable and carried forward across Duplicate and Redeem, as Provenance and
  `trace_id` are (ADR-0043). A content fix never reaches existing copies, because adopting
  copies the plan once and nothing re-syncs it later.
- **Our own descriptive names, no third-party brands.** Training methods are public, but program
  names are someone's mark. Each Curated Protocol is named for what it does ("Tiered linear
  progression"), and its description says plainly what it does *not* do.

## Where the content lives and who vouches for it

Curated Protocols are **versioned data in the repo**, seeded by migration. They are a closed,
curated set, like the Progression Scheme registry, not rows an admin edits at runtime. A test
proves that every Prescription goes through the prescription spine (ADR-0069) and that every
Exercise it names exists in the Catalog as a seeded `curated` entry. Adopting a Curated
Protocol therefore **only resolves** Exercises and never creates a Catalog row. A misspelled
name fails the build instead of leaving an `ai_generated` Stub at runtime.

Each program needs a **sign-off** before it is released, and the sign-off is recorded: who
reviewed it and when. (Amended by issue #694: no proof of qualification is recorded. The owner
decided a named reviewer is enough, so `CoachSignOff` holds a name and a date, no credential.)
An LLM may help draft one, but the shipped content must be human-authored in substance, or
`curated` would be a false claim.

## Built only from mechanics we already have

v1 ships four programs: a beginner linear progression, a push/pull/legs split, a wave program
and a tiered program. **No new Progression Scheme is added.** The wave and tiered programs are
honest approximations of the methodologies that inspired them:

- **Curated Prescriptions carry explicit scheme selections.** This is a deliberate exception to
  ADR-0064's "generation is scheme-agnostic": a person chose the scheme on purpose, which is the
  point of a known program.
- **Tiered program:** T1 main lifts at 5×3 with an AMRAP last set use Greyskull-style Linear,
  which resets the weight after a missed session. T2 (3×10) and T3 (3×15 with an AMRAP last
  set) use Double Progression. Changing the set-and-rep scheme after a miss (5×3 → 6×2 → 10×1)
  is **not** claimed and not done.
- **Wave program:** `percent_1rm` loads aren't converted to kilograms on the plan side, and an
  Estimated 1RM exists only once a user has records (ADR-0010). So at adopt time the user enters
  a recent working set for each main lift. Every week's wave is computed from it **once** and
  written as **absolute** kilograms, with a fixed increment per cycle, under the **Static**
  scheme so the waves and deloads survive (ADR-0064). The increment applies whether or not the
  user hit their reps, and the description says so. **Calibrate** (ADR-0111) is the existing way
  to re-pitch the weights if the increments outrun the user.

## Adopting one

- **Starting weights:** a short form asks for a starting weight per main lift. It is prefilled
  from the Estimated 1RM when records exist, and otherwise uses a conservative default.
  Accessories get qualitative Loads. The computed weights are shown before anything is saved.
- **Length:** the user chooses the length within the program's minimum and maximum, and the
  weekly pattern repeats to fill it. That keeps ADR-0001's user-chosen weeks true with no
  exceptions.
- **Equipment:** every program is listed. A mismatch with the user's equipment is flagged,
  never hidden and never auto-substituted ("never auto-swap", ADR-0064). The user can Substitute
  afterwards.
- **Sensitive Constraints:** a Curated Protocol is shared, untailored content, so we apply the
  Redeem rule (ADR-0058). Users with a Sensitive Constraint may adopt one and see the caveat,
  but the copy arrives **set aside**, never Current. They make it Current with an explicit
  **Switch** (ADR-0125) once they have seen the caveat.
- **After adopting:** Regeneration and Generation Feedback are not offered. Substitution,
  Calibrate, Builder edits, Switch, Duplicate and Redeem all work as usual.
- **Where:** a peer choice at the new-Protocol entry point ("Generate for me" / "Choose a
  Curated Protocol") and on Home's empty state. There's no separate destination, and it is never
  labelled "Library", which already names the Catalog pick widget.
- **Free on every tier:** adopting one costs no LLM call, and gating it would undercut the trust
  and cold-start job it exists for.

## Amendment: a Session typed and timed apart from its Curated Protocol

Added with the strength and running program, a fifth program that ships unreleased until its own
sign-off. A hybrid week mixes lifting Sessions and run Sessions, and History and Analytics slice the
record by Training Type, so typing a 45-minute run `strength` would corrupt what they project from.
A `PatternSession` may therefore name its own `training_type` and `duration_minutes`; left unset,
each falls back to the Curated Protocol's. The integrity gate requires every Training Type, the
protocol's and any override, to be in the closed set, and an overriding duration to be positive.
Adopt writes the Session's own values onto each Session, and a Builder deploy carries an edited
Session's values through the rewritten tail as it carries its title. A fresh slot takes the
Protocol's.

Runs reuse the `Running` movement 0019 already seeds, held flat on **Static**: no Progression Scheme
steps a distance or duration, so the description says the run targets stay the same every week.
Per-week authored run doses, a generalized Wave, are deferred.

## Considered options

- **Store them as Generated Protocols in the cache and reuse Adopt unchanged:** rejected. It
  breaks the Generated Protocol definition and would offer Regenerate and "did the AI do well?"
  on a plan the AI never wrote.
- **File them as `user_authored`, written by an admin account:** rejected. The Author byline
  would credit a staff account, and it hides the trust signal `curated` carries.
- **Admin-curated rows in the database (the ADR-0075 posture):** rejected for v1. There are a
  handful of programs, they rarely change and they matter for safety. Code review and a build
  test are a stronger gate than a runtime editor.
- **Faithful wave and tiered programs via new schemes (a stored Training Max, a set-and-rep
  scheme that changes after a miss):** deferred. Each needs its own ADR and a new stored or
  derived concept. The approximations ship now, with names and descriptions that don't overpromise.
- **Resolve `percent_1rm` loads on the plan at read time for the wave program:** rejected. It
  shows a new user bare percentages, because they have no records to resolve against.
- **Hide programs the user lacks equipment for:** rejected. In a catalog this small, a hidden
  option confuses more than a flagged one.
- **An "AI-tailor this program" bridge:** deferred (YAGNI). It also blurs provenance: the result
  would be `ai_generated` content derived from `curated` content.

## Consequences

- **Session Provenance gains a third value.** Everything that branches on `ai_generated` vs
  `user_authored` has to decide where `curated` falls. The rule: features that rate or redo the
  AI's work (Generation Feedback, Regeneration) are offered on `ai_generated` only.
- **Adopt has two sources.** The adoption service resolves curated Exercises without creating
  any, and it never makes the copy Current for a user with a Sensitive Constraint.
- **The Sensitive Constraint cache bypass (ADR-0003) is unchanged.** It governs *generation*.
  A Curated Protocol is never generated, so the caveat-and-set-aside rule above is its safety
  posture instead.
