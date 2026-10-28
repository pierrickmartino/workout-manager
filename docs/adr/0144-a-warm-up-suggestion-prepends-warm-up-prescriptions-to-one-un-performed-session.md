---
status: proposed
---

# 0144 — A Warm-up Suggestion prepends warm-up prescriptions to one un-performed Session

A user about to train wants the app to propose a short warm-up for the muscles the Session
works. We add a **Warm-up Suggestion** (`GLOSSARY.md`, §Generation & Reuse): one tap on the
Session preview, or at the start of a Live Session before the first working set is logged,
generates 4–6 general mobility/activation drills (about 5–8 minutes) from the union of the
working Prescriptions' targeted muscles, limited to the Session's equipment, the profile's
equipment and bodyweight. The user previews it and chooses **Add**, **Discard** or
**Regenerate**. On Add, the drills become ordinary Exercise Prescriptions at the front of the
Session, each with Set Type **warm-up**, so the read-time Warm-up Section (ADR-0074) picks them
up and the Live Session runs and logs them like any other movement. Three parts of this are
surprising, and each departs from an existing rule.

## It edits a Protocol-member Session outside Deploy

Insert, Remove and Edit are offered on standalone Sessions only, and a Protocol-member Session
changes only through the Builder's tail-gated Deploy (ADR-0051, ADR-0052, ADR-0133). Most
Sessions a user starts belong to a Protocol, so limiting the suggestion to standalone Sessions
would leave out most of its use. Routing it through Deploy would turn one tap into the
Builder's whole commit flow. So a Warm-up Suggestion may be added to a Protocol-member Session
directly, as a **narrow exception**: only to that one Session, only while it is un-performed
(ADR-0020), and only to the user's own adopted copy (ADR-0003). This exception is deliberate.
Do not remove it when Insert, Remove or Edit change.

If the Session already opens with a Warm-up Section, the action becomes **Replace warm-up**.
After a confirmation it swaps only that leading Warm-up Section. It never touches a Prescription
after the first one outside the section.

## Warm-up sets no longer gate the Completion Outcome

Until now the Completion Outcome was type-neutral (#453): an un-attempted warm-up set made a
Session Incomplete. An accepted suggestion carries no stored marker of where it came from, so
exempting suggested drills alone would need a second kind of warm-up. We extend the existing
rule instead: **a warm-up set never gates the Completion Outcome**, whoever authored it. A
Session is Completed when every prescribed set that is not a warm-up was attempted, and the
set-based progress bar measures those same sets. This amends ADR-0013 and the Set Type rule
from #453. Warm-up sets were already left out of Volume and strength records, so they are now
uniformly not training work. They are still logged, and they still count for XP, Streak and
Logged Count as before.

A Session made **only** of warm-up sets is the one exception (#779). It has no other work, so
exempting its warm-ups would make it vacuously Completed with nothing attempted and show a 0/0
progress bar. Its warm-up sets are what it prescribes, so all of them count. The Live Session
and the static log form apply this same rule.

## Generation is synchronous, catalog-first and cached

The suggestion follows Substitution: one synchronous LLM call through the `StructuredLLM` port
(ADR-0006), with its own `parse_*` boundary. It reuses catalog drills where they fit and saves
new drills to the catalog as `ai_generated`, because logging needs every Exercise to exist in
the catalog. Unlike Substitution it is cached, on a coarse key of the sorted muscle set and the
equipment set, and the cached suggestion is copied into the Session (ADR-0003). A user with a
Sensitive Constraint always gets a fresh generation with the constraint in the prompt, and
**Regenerate** always skips the cache. Readiness is not an input.

## Considered options

- **Advisory-only warm-up, never logged** was rejected: the user wants the drills recorded,
  and Set Type warm-up already keeps them out of Volume and strength records.
- **A separate warm-up block stored beside the Session** was rejected: it would be a second,
  parallel plan structure with its own UI and log path.
- **Ramp-up sets of the first lifts** are a different, deterministic feature that needs no AI.
  They are not in scope here.
- **Async generation through RQ** (ADR-0005) was rejected for a 4–6 drill output: polling
  costs more than the few seconds it saves.

## Consequences

- Accepting a suggestion inside a Live Session reloads it from the updated Session. This is safe
  because no set has been logged yet. The action is disabled offline, and no Sensitive
  Constraint content enters the live storage slot (ADR-0035).
- A malformed generation returns 502. The UI shows a clear message and a retry button.
