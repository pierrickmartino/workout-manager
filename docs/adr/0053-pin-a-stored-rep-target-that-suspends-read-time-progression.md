# 0053 — Pin: a stored rep target that suspends read-time Progression

Progression is a **read-time projection** — it recomputes an Exercise Prescription's
recommended Load or bodyweight rep target from the user's Logged Sets on every read and
**stores nothing** (ADR-0004). A calisthenics user who beats the top of a prescribed rep
range wants the plan to reflect what they achieved *now* and to *keep* that target, rather
than let the conservative `+1` overlay drive it. We add **Pin** (`CONTEXT.md`, §Plan vs.
Record): from the log flow a confirm dialog commits a user-set **Pinned Target** (a rep
range) onto the next un-performed occurrence of that Prescription, and **suspends automatic
Progression** for it until un-pinned. The surprising part worth recording is that this
introduces a *stored* plan value where Progression deliberately kept none.

**Pin stores, Progression projects — one Prescription must not have both driving it.**
If a pinned target were merely written on top of a still-live overlay, the overlay would
re-read the very Logged Sets that triggered the Pin and step the target again — a user who
did 15 and pinned 15 would see 16 on the next read, a silent double-count. So a Pin
**freezes** its Prescription: the read-time overlay skips a pinned Prescription entirely,
and the user drives that one movement's reps manually until they un-pin. The Pin is the
manual, committed replacement for the automatic step, not a second stacked adjustment.

**Scoped to pure-bodyweight rep targets.** Pin reuses exactly the axis Progression already
moves by reps — the `_next_pure_bodyweight` floor/ceiling target — and nothing else. Load,
added load, and set count are out of scope: they are either already served by the automatic
Load step or are structural plan edits that belong to the Builder. Confining the stored
override to one typed axis keeps the new persisted surface minimal.

**Next occurrence only — the plan's deloads survive.** A generated Protocol bakes
progression and deload into its later weeks (wk1 3×8, wk2 3×10, wk3 3×6). Writing a pinned
range across the whole un-performed tail would overwrite that deliberate structure, so a Pin
reaches only the **single next un-performed occurrence** of the movement; the overlay still
governs the weeks beyond it. This also keeps the freeze scoped to exactly the one
Prescription the user acted on, consistent with the tail-only edit posture (ADR-0020).

**Editable and pre-filled, human-gated rather than effort-gated.** The dialog is offered
only when **every working set beat the top of the range** — an unambiguous "more than the
plan asked," and requiring all sets stops a single outlier from ossifying into the
prescription (the same guard as the engine's every-set-at-ceiling rule). It pre-fills the
new range from the reps performed but stays editable, so a fluke max is trimmed, not banked.
Progression gates its own step behind low perceived effort; Pin does **not**, because the
explicit human confirm replaces that gate — the user decides whether the effort was
repeatable.

**Reversible, and the harder-Variation path coexists.** Un-pin clears the target and hands
the movement back to automatic Progression — a movement is never trapped in manual mode. And
because unbounded bodyweight rep growth is exactly what the domain caps (Progression suggests
a harder **Variation** at the ceiling rather than growing reps without bound), the same
confirm dialog still offers "step up to a harder Variation instead," so the methodologically
correct calisthenics path is never hidden behind the Pin.

**Session Provenance is unchanged.** Pinning a target on an `ai_generated` Session leaves it
`ai_generated`, so Generation Feedback and Regeneration stay available — the same
immutable-origin treatment Insert, Substitution, and Enrichment already give (ADR-0051,
ADR-0041). A Pin is an edit, not a re-origination.

## Considered options

- **Pure read-time surfacing, store nothing** — rejected: the user explicitly wants to
  *keep* a target the conservative overlay will not produce on its own; an informational
  acknowledgement cannot hold a value.
- **Mirror the performed reps automatically** — rejected: a one-off max-effort set should not
  become the standing prescription. The dialog pre-fills from what was performed but leaves
  the human in the loop.
- **Let the overlay keep stepping on a pinned base (coexist)** — rejected: it double-counts
  the Logged Sets that triggered the Pin.
- **Write the pinned range across all future occurrences** — rejected: it clobbers the
  deload and progression the plan deliberately encoded into later weeks.
- **Extend Pin to Load, weighted reps, or set count** — deferred: Load already auto-steps,
  and structural edits belong to the Builder. Keeping Pin to the one bodyweight rep axis
  keeps the stored-override surface small.

## Consequences

- **The first user-chosen plan number to persist outside the Builder/Insert/Remove path.**
  A Prescription gains a nullable Pinned Target plus a user-set marker; Progression's
  read-time overlay must skip any Prescription that carries one.
- **Un-pin is a clean restore.** Because Progression is otherwise untouched and remains a
  pure projection of the record, clearing the marker returns the exact prior behavior — no
  historical-log migration, no recomputation.
- **Sensitive-Constraint posture unaffected.** A Pinned Target is user-chosen, not
  AI-served, so it raises no cache-bypass question (ADR-0003).
- **Standalone Sessions.** Pin edits that Session's own prescription in place (like Insert
  and Remove); there is only one occurrence, so "next occurrence only" is moot there.
- **Read-time projections downstream are unaffected.** XP, Streak, Personal Records, and
  Completion Outcome read the *record*, which a Pin never touches; only the forward *plan*
  changes.
