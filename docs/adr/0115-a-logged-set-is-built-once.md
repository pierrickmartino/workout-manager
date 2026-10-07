# 0115 — A Logged Set is built once

ADR-0106 wrote a Logged Set's *entry field* once. The step after it, turning a performed-set row
into the `LogSetInput` the record endpoints accept, was still written five times, one per
logging path:

| Path | Builder | Reader |
| --- | --- | --- |
| Plan-backed log | `buildLogSet` (`log-session-form.ts`) | `readLogFormRows` |
| Ad-hoc log | `toSet` (`adhoc-log.ts`) | `readAdhocFormRows` |
| Log Correction | `toSet` (`log-correction.ts`) | `readRows` inside the `"use server"` action |
| Hand-Authored Session | `toLoggedSet` (`hand-authored-session.ts`) | — (held in client state) |
| Live Session finish | `mapFinishToLog` (`live-session-mapper.ts`) | — (held in client state) |

Each reader had its own `readField` and its own `MAX_SET_ROWS = 500`. Log Correction kept a
private copy of `parseDurationSeconds`, which `quantity.ts` already exports.

## The copies had drifted

| Rule | Plan-backed | Ad-hoc | Correction | Hand-Authored | Live |
| --- | --- | --- | --- | --- | --- |
| Garbled distance or duration | error | dropped silently | dropped silently | error | — |
| Garbled rep count | dropped silently | dropped silently | dropped silently | dropped silently | — |
| Typed Effort (ADR-0066) | sent | not collected | RPE only | RPE only | RPE only |
| Set Note | sent | not collected | sent | not collected | not collected |

Two comments claimed a parity the code didn't have: the plan-backed distance rule said it
mirrored the ad-hoc one, and the correction builder said it mirrored the ad-hoc form.

One drift lost data. Log Correction is a full replace (ADR-0034) and sent only
`perceived_difficulty`, so a set logged as RIR 2 came back from a correction, including the
History outcome toggle, as RPE 8: same number, different meaning. A silent drop in Correction was
the other risk: editing "5" into "5,2" removed that set from the record.

## One module, one policy

`lib/logged-set.ts` owns the row → request step and the posted-form reader:

- **The row is `SetEntryValues` plus the resolved Exercise id.** ADR-0106's vocabulary already is
  the wire contract and holds raw strings until the write seam, so a second row type would only
  bring back a mapping table.
- **A blank amount skips the row; a garbled amount is an error** that rejects the whole
  submission, on every path and for every Quantity kind. The plan-backed log's kind-worded
  messages are the ones kept.
- **Effort is sent typed whenever present.** A correction row carries its record's typed Effort
  (`CarriedEffort`) in a hidden `carried_effort` field, with the RPE text the cell was seeded
  with. While the cell still reads that, the typed Effort is re-sent unchanged; an edit sends the
  new RPE value, and clearing the cell clears the Effort. Editing *in* RIR is a separate feature;
  this only stops the loss.
- **A non-blank Set Note is sent** wherever a form collects one.
- **Load is converted to canonical kilograms** (#417), defaulting a blank kind.

Only two things legitimately differ between paths, and they are the module's only options:

- `performedMark`: the path has an explicit performed mark (the plan-backed Done toggle, a
  completed Live Session set), so a blank rep count on a marked row is 0 reps, because a set
  ground out to failure is still attempted.
- `defaultLoadKind`: what a blank Load picker means. `absolute`, except on the Hand-Authored
  Session, where it follows the exercise's Quantity kind (a hold or a run defaults to
  bodyweight).

A third option is a policy question to settle in the module, not a flag to add.

`readPostedSetRows` reads every entry field plus the hidden Exercise id, the done mark and a
carried Effort, and drops nothing. Which rows count stays the path's rule, one small function
each: Done rows (`loggedSetRowsFromForm`), rows naming a movement (`readAdhocFormRows`), or
existing-plus-added rows (`correctionRowsFromForm`, which drops an added row without an amount
*before* its movement is resolved, so no orphan Exercise is minted, ADR-0033). The correction
reader leaving the server action makes it testable for the first time.

This is the write-side twin of ADR-0029's single read-side flattening.

## What changed for a user, deliberately

- The ad-hoc log and Log Correction now reject a garbled distance or duration instead of dropping
  the set, and every path rejects a garbled rep count.
- A correction, and the History outcome toggle, keep an RIR or half-step Effort as it was logged.
- The Hand-Authored Session and Live Session send typed Effort. An unedited correction
  of a record that had only `perceived_difficulty` now stores the same value as a typed RPE.

## What did not change

- **Live Session stays reps-only.** A live set is a rep count against its prescription
  (ADR-0114), so a timed hold or a run finished live is still recorded as reps. Typing it needs a
  hold-time and distance cell in the set table, so it gets its own decision, built on this module.
- **No Set Type on the record from the web.** The backend accepts `set_type` on every record
  write, but no web form collects one, so the row doesn't carry it. The backend comment that
  claimed four web paths send it now says they don't.
- No form gained a field: the ad-hoc log still collects no Effort or note, and the Hand-Authored
  performed set and the Live Session no note. A posted field now reaches the record through the
  module with no builder change; the Live Session would also map it in `liveSetRow`.

## Consequences

- `lib/logged-set.test.ts` holds the policy: each Quantity kind × blank / garbage / valid, both
  options, Load and kg conversion, typed and carried Effort, the note, and the reader's bounds and
  forged inputs. The builder-quirk tests in the five paths' suites are deleted. Each path keeps its
  header tests (date, Training Type, outcome, the empty-record message) and a test of which posted
  rows it keeps.
- `mapFinishToLog` throws if the build ever rejects a live set. A live rep count is a whole,
  non-negative number by construction, so a rejection means an invariant broke, and failing
  loudly beats a record with sets silently missing.
