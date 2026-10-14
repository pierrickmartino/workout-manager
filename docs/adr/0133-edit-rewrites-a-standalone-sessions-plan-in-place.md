# 0133 — Edit rewrites a standalone Session's plan in place

A user with a hand-made Session wants a variation of it. They Duplicate it (ADR-0043), and
then cannot do what they came for: reorder the movements and change the sets, reps and
rest. The copy can be renamed, appended to (Insert, ADR-0051), withdrawn from (Remove,
ADR-0052), swapped (Substitution) and re-schemed (ADR-0064), but its existing movements
cannot be changed. Both Insert and Remove left "a full Session editor (reorder, re-time
existing prescriptions)" out of scope as "a later call". This is that call.

**Edit replaces the whole plan of a standalone Session in place.** `PUT
/api/sessions/{id}/plan` takes the full ordered prescription list plus the Training Type
(and, optionally, the nominal duration) and rewrites the Session's prescriptions as
`0..n-1`. The web opens it from the Session's **Edit exercises** button at
`/sessions/{id}/edit`. That page is the Hand-Authored editor Build and Capture already use
(ADR-0040/0044), seeded from the Session. It reorders, groups Supersets and edits every
authored field, so Edit needed no new editor.

**The same guards as Insert and Remove.** Edit is standalone-only and owner-only. A
Protocol-member Session is refused with `protocol_member`, because editing inside a
Protocol is Deploy's tail-gated job (ADR-0020/0021), and the settled-tail invariant stays in
exactly one place. The new plan passes the Builder's `validate_deploy` (empty session,
unknown Exercise, invalid sets/reps, Superset structure, unknown scheme), with the
Sensitive-Constraint posture threaded (ADR-0023). A rejected edit persists nothing.

**The plan changes; the record does not.** Logged Sets reference a catalog Exercise, not a
prescription row, and each Logged Session stores its Completion Outcome when it finishes
(ADR-0013). Rewriting the prescriptions therefore reaches no past performance. Only future
performances see the edited plan, the same plan/record split Insert and Remove keep
(ADR-0001/0034).

**An edit, not a re-origination.** Session Provenance, Author, Session Name, Favorite and
curated lineage are untouched, exactly as for Insert and Remove (ADR-0041). Editing an
`ai_generated` Session keeps Generation Feedback and Regeneration available.

**The Progression Scheme rides along; a stranded one falls back to the default.** The
Hand-Authored editor has no scheme control, so each editor row carries its movement's
scheme untouched and the request sends it back. If an edit changes the Load to a kind the
scheme cannot step (Greyskull on a qualitative Load), the service resets that movement to
the default scheme rather than refusing the save. Deploy refuses instead, but the Builder
shows the scheme picker and this editor does not, so a refusal here would be an error the
user cannot fix. The reset is visible on the Session page's scheme control.

## Considered options

- **Duplicate opens a pre-filled builder that creates the variation** — rejected: it fixes
  only the copy. The original stays uneditable, and a new plan from `POST /sessions/plan`
  would lose the Provenance, scheme and lineage that Duplicate carries.
- **Inline controls on the Session page (up/down arrows, per-card sets/reps/rest)** —
  rejected: a second, partial editor beside the Hand-Authored one, with no Superset or
  tempo editing, and one round-trip per tweak.
- **Per-field PATCH endpoints (reorder, re-dose)** — rejected: a reorder that splits a
  Superset, or a re-dose that strands a scheme, is only valid or invalid as a whole plan.
  One validated replace matches how Deploy commits a tail.
- **Reject an incompatible carried scheme (as Deploy does)** — rejected for this editor,
  as above: it has no scheme control to fix it with.

## Consequences

- Insert and Remove remain as the one-step add and withdraw on the Session page. Edit is
  their general form, not a replacement.
- `_deploy_draft` now forwards each prescription's scheme to `validate_deploy`, so an
  unknown scheme is rejected on every hand-authored path. Build and Capture send none, so
  they are unchanged.
- A Session's edit draft is kept in browser storage under `session-edit:{id}`, like the
  Build and Capture drafts, and offered for recovery if the page is left unsaved.
