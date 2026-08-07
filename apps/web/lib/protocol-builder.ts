// The Protocol Builder draft reducer (Module D, ADR-0020). A pure reducer over the
// client-side builder state: the whole edit is staged here and nothing touches the
// live Protocol until DEPLOY. Modeled on the Live Session reducer (`live-session.ts`)
// — every branch returns a new state and the input is never mutated. It has NO
// server-only imports, so both the Server route and the Client screen can use it.
//
// This slice edits an existing Prescription's fields and Load inside an un-performed
// Session; structural edits (add/remove/reorder/reshape) arrive in later slices.

import type { Load, LoadKind } from "./load.ts";
import type { ProtocolProgress } from "./protocols-types.ts";
import {
  dissolveSingletonGroups,
  editRoundRest,
  groupSpan,
  groupWithNext as supersetGroupWithNext,
  moveItem,
  reorderKeepingContiguous,
  supersetsAreContiguous,
  ungroup,
} from "./supersets.ts";

// The per-row Superset layout view-model lives in the shared `supersets` module now
// (ADR-0023); re-exported here so the Builder's components keep importing it from
// `protocol-builder` unchanged.
export { supersetLayout } from "./supersets.ts";
export type { SupersetSlot } from "./supersets.ts";

// One Prescription in the draft. `loadKind`/`loadValue` mirror the log form's Load
// kind-picker (ADR-0010) so building and logging speak one Load language; they are
// what the deploy payload carries and the server resolves through `load_from_input`.
export interface DraftPrescription {
  exerciseId: number;
  exerciseName: string;
  sets: number;
  reps: string;
  restSeconds: number | null;
  tempo: string | null;
  loadKind: LoadKind;
  loadValue: string;
  // Superset overlay (ADR-0023): `supersetGroup` is `null` for a flat, solo
  // Prescription; members of one Superset share the tag. `roundRestSeconds` is the
  // group-owned round-rest, denormalized onto each member so it is reorder-stable. A
  // grouped member's own `restSeconds` stays put — dormant while grouped, restored on
  // ungroup.
  supersetGroup: string | null;
  roundRestSeconds: number | null;
}

// One Session in the draft. `performed` marks the frozen prefix (ADR-0020): a
// performed Session is read-only and never included in the deploy tail. A
// newly-added Session slot has no server id yet, so it carries a unique *negative*
// client id as its draft handle; `toDeployPayload` sends it as a null `session_id`
// for the server to insert (Module A/F re-enumerate the tail on DEPLOY).
export interface DraftSession {
  sessionId: number;
  week: number;
  day: number;
  performed: boolean;
  prescriptions: DraftPrescription[];
}

export interface BuilderDraft {
  protocolId: number;
  // The user-editable Protocol name, edited in the config panel (ADR-0021). `null`
  // when unnamed — the read side falls back to the derived label. It rides through
  // DEPLOY in the payload, not a separate write.
  name: string | null;
  weeks: number;
  sessionsPerWeek: number;
  sessions: DraftSession[];
  // An Exercise deep-linked from F6's `ADD TO PROTOCOL` (ADR-0021), queued for
  // placement: SEED_QUEUED_EXERCISE holds it here until the user drops it into an
  // un-performed Session (PLACE_QUEUED_EXERCISE), which then clears it. `null` when
  // the builder was opened normally, with nothing waiting to be placed.
  queuedExercise: PickedExercise | null;
  // Whether Supersets are paused because the user carries a Sensitive Constraint
  // (ADR-0023). When true, `initBuilderDraft` opened the draft with any existing
  // Superset in the editable tail auto-unlinked (staged, not committed) and the
  // screen shows an explanatory banner — so the user never hits a confusing
  // hard-block on an unrelated edit. The DEPLOY validator remains the backstop.
  supersetsSuppressed: boolean;
}

// Which scalar field of a Prescription an edit targets. Load is edited separately
// (it is a typed kind+value pair, not a single scalar).
export type PrescriptionField = "sets" | "reps" | "restSeconds" | "tempo";

// The editable defaults a freshly-added Prescription starts from. Nothing is
// fabricated on the user's behalf beyond a followable starting point they then
// retarget: a Load is deliberately left empty (absent Loads are legitimate,
// ADR-0010), and the reps default matches the log form's placeholder.
const NEW_PRESCRIPTION_SETS = 3;
const NEW_PRESCRIPTION_REPS = "8-12";

// A catalog Exercise picked from the Library, carrying just what a new Prescription
// needs to name it (Module E surfaces the rest for the picker).
export interface PickedExercise {
  id: number;
  name: string;
}

export type BuilderEvent =
  | {
      type: "EDIT_PRESCRIPTION";
      sessionId: number;
      position: number;
      field: PrescriptionField;
      value: string | number | null;
    }
  | {
      type: "EDIT_LOAD";
      sessionId: number;
      position: number;
      loadKind: LoadKind;
      loadValue: string;
    }
  | {
      type: "ADD_PRESCRIPTION";
      sessionId: number;
      exercise: PickedExercise;
    }
  | {
      type: "REMOVE_PRESCRIPTION";
      sessionId: number;
      position: number;
    }
  | {
      type: "REORDER_PRESCRIPTION";
      sessionId: number;
      from: number;
      to: number;
    }
  | {
      // Group the Prescription at `position` with the next one into a Superset
      // (ADR-0023), unifying any groups they already belong to. Seeds a new group's
      // round-rest from the last member's own rest.
      type: "GROUP_WITH_NEXT";
      sessionId: number;
      position: number;
    }
  | {
      // Dissolve the Superset the Prescription at `position` belongs to: clear the
      // group tag and round-rest on every member, restoring their dormant own rest.
      type: "UNGROUP";
      sessionId: number;
      position: number;
    }
  | {
      // Edit the group-owned round-rest of the Superset at `position`, applied to
      // every member so it stays consistent regardless of order.
      type: "EDIT_ROUND_REST";
      sessionId: number;
      position: number;
      roundRestSeconds: number | null;
    }
  | {
      // Apply a drag-end that the manipulation layer already classified into a semantic
      // `DropIntent` (#217, ADR-0023). The self-healing resolver derives Superset
      // membership from the container boundary, so contiguity holds by construction —
      // superseding the old GROUP_BY_DRAG / REORDER_BY_DRAG pair.
      type: "RESOLVE_DROP";
      sessionId: number;
      intent: DropIntent;
    }
  | {
      type: "EDIT_NAME";
      name: string;
    }
  | {
      type: "ADD_SESSION";
      week: number;
    }
  | {
      type: "REMOVE_SESSION";
      sessionId: number;
    }
  | {
      type: "SET_WEEKS";
      weeks: number;
    }
  | {
      type: "SET_SESSIONS_PER_WEEK";
      sessionsPerWeek: number;
    }
  | {
      type: "SEED_QUEUED_EXERCISE";
      exercise: PickedExercise;
    }
  | {
      type: "PLACE_QUEUED_EXERCISE";
      sessionId: number;
    };

// Derive the editable kind+value pair a Prescription's Load starts from, off the
// typed Load the plan stored (ADR-0010). Mirrors `live-session.ts`'s prefill so the
// Builder and the log form surface a Load identically. An absent Load pre-fills an
// empty absolute value.
function prefillLoad(load: Load | null): { kind: LoadKind; value: string } {
  if (!load) return { kind: "absolute", value: "" };
  switch (load.kind) {
    case "absolute":
      return { kind: load.kind, value: load.kg !== undefined ? String(load.kg) : "" };
    case "percent_1rm":
      return {
        kind: load.kind,
        value: load.percent !== undefined ? String(load.percent) : "",
      };
    case "bodyweight":
      return {
        kind: load.kind,
        value: load.added_kg !== undefined ? String(load.added_kg) : "",
      };
    case "range":
      return {
        kind: load.kind,
        value:
          load.low_kg !== undefined && load.high_kg !== undefined
            ? `${load.low_kg}-${load.high_kg}`
            : "",
      };
    case "qualitative":
      return { kind: load.kind, value: load.text };
  }
}

// How the builder opens for a given user. A Sensitive-Constraint user (injury, rehab,
// postpartum, flagged medical) is never handed a Superset (ADR-0023), so the draft
// opens with grouping paused; a non-medical Preference / Limitation never sets this.
export interface InitBuilderOptions {
  hasSensitiveConstraint?: boolean;
}

// Read a fetched Protocol into an editable builder draft. Each Session keeps its
// `performed` flag so the screen renders the frozen prefix read-only, and each
// Prescription's stored Load is expanded into the kind+value the picker edits.
//
// When opened by a Sensitive-Constraint user, any Superset in the *editable* tail is
// auto-unlinked (staged, not committed) and `supersetsSuppressed` is set so the screen
// shows a banner (ADR-0023). Performed Sessions are settled record (ADR-0020) and are
// never deployed, so their grouping is left untouched.
export function initBuilderDraft(
  protocol: ProtocolProgress,
  options: InitBuilderOptions = {},
): BuilderDraft {
  const suppress = options.hasSensitiveConstraint ?? false;
  return {
    protocolId: protocol.id,
    name: protocol.name,
    weeks: protocol.weeks,
    sessionsPerWeek: protocol.sessions_per_week,
    // A freshly-read draft has nothing queued; the F6 deep-link seeds it after init.
    queuedExercise: null,
    supersetsSuppressed: suppress,
    sessions: protocol.sessions.map((session) => ({
      sessionId: session.session_id,
      week: session.week,
      day: session.day,
      performed: session.performed,
      prescriptions: session.prescriptions.map((prescription) => {
        const load = prefillLoad(prescription.recommended_load);
        // Auto-unlink the editable tail's groups under suppression; the frozen prefix
        // (a performed Session) keeps its settled grouping.
        const paused = suppress && !session.performed;
        return {
          exerciseId: prescription.exercise_id,
          exerciseName: prescription.exercise_name,
          sets: prescription.sets,
          reps: prescription.reps,
          restSeconds: prescription.rest_seconds,
          tempo: prescription.tempo,
          loadKind: load.kind,
          loadValue: load.value,
          supersetGroup: paused ? null : prescription.superset_group ?? null,
          roundRestSeconds: paused ? null : prescription.round_rest_seconds ?? null,
        };
      }),
    })),
  };
}

// The pure state transition. Edits to a performed (frozen) Session are ignored — the
// same invariant the server enforces on deploy (ADR-0020). Every branch returns a new
// state; the input is never mutated.
export function builderReducer(
  state: BuilderDraft,
  event: BuilderEvent,
): BuilderDraft {
  switch (event.type) {
    case "EDIT_PRESCRIPTION":
      return mapPrescription(state, event.sessionId, event.position, (prescription) => ({
        ...prescription,
        [event.field]: event.value,
      }));

    case "EDIT_LOAD":
      return mapPrescription(state, event.sessionId, event.position, (prescription) => ({
        ...prescription,
        loadKind: event.loadKind,
        loadValue: event.loadValue,
      }));

    case "ADD_PRESCRIPTION":
      return mapSessionPrescriptions(state, event.sessionId, (prescriptions) => [
        ...prescriptions,
        newPrescription(event.exercise),
      ]);

    case "REMOVE_PRESCRIPTION":
      return mapSessionPrescriptions(state, event.sessionId, (prescriptions) =>
        prescriptions.filter((_, index) => index !== event.position),
      );

    case "REORDER_PRESCRIPTION":
      // A reorder must never leave a Superset non-contiguous (ADR-0023): if moving
      // this Prescription would split a group, the shared helper refuses the move.
      return mapSessionPrescriptions(state, event.sessionId, (prescriptions) =>
        reorderKeepingContiguous(prescriptions, event.from, event.to),
      );

    case "GROUP_WITH_NEXT":
      return mapSessionPrescriptions(state, event.sessionId, (prescriptions) =>
        groupWithNext(prescriptions, event.position),
      );

    case "UNGROUP":
      return mapSessionPrescriptions(state, event.sessionId, (prescriptions) =>
        ungroup(prescriptions, event.position),
      );

    case "EDIT_ROUND_REST":
      return mapSessionPrescriptions(state, event.sessionId, (prescriptions) =>
        editRoundRest(prescriptions, event.position, event.roundRestSeconds),
      );

    case "RESOLVE_DROP":
      return mapSessionPrescriptions(state, event.sessionId, (prescriptions) =>
        resolveDrop(prescriptions, event.intent),
      );

    case "EDIT_NAME":
      return { ...state, name: event.name };

    case "ADD_SESSION":
      return {
        ...state,
        sessions: [...state.sessions, newSession(state.sessions, event.week)],
      };

    case "REMOVE_SESSION":
      return {
        ...state,
        sessions: state.sessions.filter(
          (session) => session.sessionId !== event.sessionId || session.performed,
        ),
      };

    case "SET_WEEKS":
      return { ...state, weeks: event.weeks };

    case "SET_SESSIONS_PER_WEEK":
      return { ...state, sessionsPerWeek: event.sessionsPerWeek };

    case "SEED_QUEUED_EXERCISE":
      return { ...state, queuedExercise: event.exercise };

    case "PLACE_QUEUED_EXERCISE":
      return placeQueuedExercise(state, event.sessionId);

    default:
      return state;
  }
}

// Drop the queued Exercise (from the F6 deep-link, ADR-0021) into the un-performed
// Session `sessionId` as a new Prescription, and clear the queue — a staged edit
// deployed like any other (ADR-0020). Nothing to place (no queued Exercise), a
// performed Session (frozen prefix), or an unknown Session leaves the draft untouched,
// keeping the queue so the honest deep-link intent isn't silently dropped.
function placeQueuedExercise(
  state: BuilderDraft,
  sessionId: number,
): BuilderDraft {
  const queued = state.queuedExercise;
  if (!queued) return state;
  const target = state.sessions.find(
    (session) => session.sessionId === sessionId && !session.performed,
  );
  if (!target) return state;
  return {
    ...state,
    queuedExercise: null,
    sessions: state.sessions.map((session) =>
      session === target
        ? {
            ...session,
            prescriptions: [...session.prescriptions, newPrescription(queued)],
          }
        : session,
    ),
  };
}

// A fresh empty Session slot for `week`, appended to the un-performed tail (ADR-0020).
// It starts with no Prescriptions — nothing is fabricated; the user fills it from the
// Library. Its `day` follows the week's existing Sessions, and it takes a unique
// negative client id (see `DraftSession`) so edits can target it before it is saved.
function newSession(sessions: DraftSession[], week: number): DraftSession {
  const daysInWeek = sessions
    .filter((session) => session.week === week)
    .map((session) => session.day);
  const nextDay = daysInWeek.length > 0 ? Math.max(...daysInWeek) + 1 : 1;
  const lowestId = Math.min(0, ...sessions.map((session) => session.sessionId));
  return {
    sessionId: lowestId - 1,
    week,
    day: nextDay,
    performed: false,
    prescriptions: [],
  };
}

// A freshly-picked Library Exercise as a new draft Prescription, with editable
// defaults the user then retargets.
function newPrescription(exercise: PickedExercise): DraftPrescription {
  return {
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    sets: NEW_PRESCRIPTION_SETS,
    reps: NEW_PRESCRIPTION_REPS,
    restSeconds: null,
    tempo: null,
    loadKind: "absolute",
    loadValue: "",
    supersetGroup: null,
    roundRestSeconds: null,
  };
}

// Group the Prescription at `position` with the next one into one Superset (ADR-0023),
// seeding a new group's round-rest from the last member's own rest. Thin wrapper over the
// shared `groupWithNext` so the Builder's keyboard and drag paths share the one grouping
// rule with the Hand-Authored screen; `next.restSeconds` is the Builder-specific seed.
function groupWithNext(
  prescriptions: DraftPrescription[],
  position: number,
): DraftPrescription[] {
  return supersetGroupWithNext(
    prescriptions,
    position,
    prescriptions[position + 1]?.restSeconds ?? null,
  );
}

// Detach the Prescription at `index` from any Superset it belongs to — clearing its
// tag and round-rest — then dissolve any group the removal leaves with a single
// member (a Superset needs ≥2). Used by the drag gestures where a dragged row must
// leave its old group before being repositioned or regrouped (ADR-0023).
function detachFromGroup(
  prescriptions: DraftPrescription[],
  index: number,
): DraftPrescription[] {
  const target = prescriptions[index];
  if (!target || target.supersetGroup === null) return prescriptions;
  const detached = prescriptions.map((prescription, i) =>
    i === index
      ? { ...prescription, supersetGroup: null, roundRestSeconds: null }
      : prescription,
  );
  return dissolveSingletonGroups(detached);
}

// Drop the Prescription at `from` onto the row at `to`, forming or joining a Superset
// (ADR-0023). The dragged row is detached from any prior group first (dragging it away
// ungroups it), then moved adjacent to the target and grouped with it via the same
// `groupWithNext` union the keyboard path uses. An out-of-range or self drop is a
// no-op. Dropping onto a grouped target joins that Superset.
function groupByDrag(
  prescriptions: DraftPrescription[],
  from: number,
  to: number,
): DraftPrescription[] {
  const last = prescriptions.length - 1;
  if (from < 0 || from > last || to < 0 || to > last || from === to) {
    return prescriptions;
  }
  // Dropping a member onto a co-member of the *same* Superset is a no-op: they are
  // already grouped, so re-forming would needlessly detach — dissolving the group and
  // its edited round-rest — then rebuild the pair from an individual rest, silently
  // discarding the round-rest the user set (ADR-0023).
  const fromGroup = prescriptions[from].supersetGroup;
  if (fromGroup !== null && fromGroup === prescriptions[to].supersetGroup) {
    return prescriptions;
  }
  const detached = detachFromGroup(prescriptions, from);
  const moved = moveItem(detached, from, to);
  // After the move the dragged row sits at `to`; the drop target is the neighbour it
  // landed against — below it when dragging down, above it when dragging up.
  const anchor = from < to ? to - 1 : to;
  return groupWithNext(moved, anchor);
}

// --- The manipulation layer's two pure modules (#217, ADR-0023). A drag-intent
// classifier turns a raw @dnd-kit drag-end into a semantic intent; a self-healing
// drop resolver applies that intent to the Prescription list, deriving Superset
// membership from the container boundary so contiguity holds by construction.

// The semantic meaning of a drag-end, decoupled from @dnd-kit's raw drop event
// (ADR-0023). `reorder` repositions a row (among solos, or within its own group);
// `form-group` starts a new Superset (solo onto solo / a link chip); `join-group`
// adds the dragged row to an existing container; `leave-group` pulls a member out of
// its box. Positions index the Session's Prescription list; `group` is a Superset tag.
export type DropIntent =
  | { kind: "reorder"; from: number; to: number }
  | { kind: "form-group"; from: number; to: number }
  | { kind: "join-group"; from: number; group: string }
  | { kind: "leave-group"; from: number; to: number };

// The drop-target id scheme shared by the classifier and the render layer, so the two
// never drift: a row body reorders (`row-<pos>`), a solo's link chip forms a new group
// (`chip-<pos>`), and a Superset container joins that group (`box-<group>`). The active
// (dragged) node is always a row.
const ROW_DROP_PREFIX = "row-";
const CHIP_DROP_PREFIX = "chip-";
const BOX_DROP_PREFIX = "box-";

export function rowDropId(position: number): string {
  return `${ROW_DROP_PREFIX}${position}`;
}
export function chipDropId(position: number): string {
  return `${CHIP_DROP_PREFIX}${position}`;
}
export function boxDropId(group: string): string {
  return `${BOX_DROP_PREFIX}${group}`;
}

// Parse a `<prefix><integer>` id to its position, or `null` for a mismatched prefix or
// a non-integer tail — a malformed id yields no action rather than a NaN move.
function parsePositionId(id: string, prefix: string): number | null {
  if (!id.startsWith(prefix)) return null;
  const tail = id.slice(prefix.length);
  const parsed = Number.parseInt(tail, 10);
  return Number.isInteger(parsed) && String(parsed) === tail ? parsed : null;
}

// The Superset tag encoded in a container-box id, or `null` for a mismatched prefix or
// empty tag.
function parseBoxId(id: string): string | null {
  if (!id.startsWith(BOX_DROP_PREFIX)) return null;
  const tag = id.slice(BOX_DROP_PREFIX.length);
  return tag.length > 0 ? tag : null;
}

// Map a raw drag-end (dragged row id, drop-target id) to a semantic DropIntent, or
// `null` when nothing should happen — a malformed/absent id, a drop onto self, or a
// member dropped back onto its own container (ADR-0023). The dragged node is always a
// row; the target's id prefix names the intent. A grouped member dropped on a row
// *inside* its own box is a within-group reorder; dropped *outside* it leaves the group.
export function classifyDrag(
  activeId: string,
  overId: string | null,
  prescriptions: DraftPrescription[],
): DropIntent | null {
  const from = parsePositionId(activeId, ROW_DROP_PREFIX);
  if (from === null || from < 0 || from >= prescriptions.length) return null;
  if (overId === null) return null;

  const chip = parsePositionId(overId, CHIP_DROP_PREFIX);
  if (chip !== null) {
    return chip === from ? null : { kind: "form-group", from, to: chip };
  }

  const box = parseBoxId(overId);
  if (box !== null) {
    if (prescriptions[from].supersetGroup === box) return null;
    return groupSpan(prescriptions, box)
      ? { kind: "join-group", from, group: box }
      : null;
  }

  const to = parsePositionId(overId, ROW_DROP_PREFIX);
  if (to === null || to < 0 || to >= prescriptions.length || to === from) {
    return null;
  }
  const group = prescriptions[from].supersetGroup;
  if (group !== null) {
    const span = groupSpan(prescriptions, group);
    const inside = span !== null && to >= span.first && to <= span.last;
    if (!inside) return { kind: "leave-group", from, to };
  }
  return { kind: "reorder", from, to };
}

// The escalating drag-feedback view-model (#219, ADR-0023): the visual state the render
// layer paints while a drag is in flight — which row lifted into the DragOverlay (`from`,
// also the dimmed source placeholder), where the reorder insertion line sits
// (`insertionGap`, a boundary index in `[0, length]`), which link chip or container box
// lights as a solid group drop-zone (`formGroupChip` / `joinGroup`), and which container
// is losing a member (`losingGroup`). All null-but-`from` fields mean "no escalation yet".
export interface DragFeedback {
  from: number;
  insertionGap: number | null;
  formGroupChip: number | null;
  joinGroup: string | null;
  losingGroup: string | null;
}

// Derive the live drag-feedback from the raw drag (dragged row id, hovered target id),
// or `null` when nothing should happen — a malformed/absent id, a drop onto self, or a
// member over its own container (the same no-ops `classifyDrag` rejects). Feedback is
// derived from `classifyDrag` so the escalating visuals can never promise an outcome the
// resolver won't produce (#217/#218). The insertion line sits at the target slot: below
// the hovered row when dragging downward, at it when dragging upward — matching where
// `moveItem` lands the row.
export function dragFeedback(
  activeId: string,
  overId: string | null,
  prescriptions: DraftPrescription[],
): DragFeedback | null {
  const intent = classifyDrag(activeId, overId, prescriptions);
  if (intent === null) return null;
  const base: DragFeedback = {
    from: intent.from,
    insertionGap: null,
    formGroupChip: null,
    joinGroup: null,
    losingGroup: null,
  };
  switch (intent.kind) {
    case "reorder":
      return { ...base, insertionGap: insertionGapFor(intent.from, intent.to) };
    case "form-group":
      return { ...base, formGroupChip: intent.to };
    case "join-group":
      return { ...base, joinGroup: intent.group };
    case "leave-group":
      return {
        ...base,
        losingGroup: prescriptions[intent.from].supersetGroup,
        insertionGap: insertionGapFor(intent.from, intent.to),
      };
  }
}

// The boundary index where the insertion line is drawn for a move from `from` to `to`:
// dragging downward the row lands just after the target (`to + 1`), upward it lands at
// the target (`to`) — the same slot `moveItem` splices it into.
function insertionGapFor(from: number, to: number): number {
  return from < to ? to + 1 : to;
}

// The foreshadowing microcopy view-model (#220, ADR-0027): one source rendered two ways.
// `foreshadow` is the visible, target-anchored text shown *before* release AND the
// `onDragOver` screen-reader announcement — the same words for sighted and SR users, which
// is the ADR-0027 sync obligation satisfied structurally. `commit` is the `onDragEnd`
// announcement of the settled outcome.
export interface DragMicrocopy {
  foreshadow: string;
  commit: string;
}

// Derive the live microcopy from the raw drag (dragged row id, hovered target id), or
// `null` for a no-op drop — the same cases `classifyDrag`/`dragFeedback` reject. The
// intent picks the strings: `reorder` names no group; `form-group` names the solo the new
// Superset starts with; `join-group`/`leave-group` name the group by its display letter
// (A = first Superset in the Session, matching the Live badge — `supersetGroupLetter`).
export function dragMicrocopy(
  activeId: string,
  overId: string | null,
  prescriptions: DraftPrescription[],
): DragMicrocopy | null {
  const intent = classifyDrag(activeId, overId, prescriptions);
  if (intent === null) return null;
  const movingName = prescriptions[intent.from].exerciseName;
  switch (intent.kind) {
    case "reorder":
      return { foreshadow: "Move here", commit: `Moved ${movingName}` };
    case "form-group": {
      const targetName = prescriptions[intent.to].exerciseName;
      return {
        foreshadow: `Release to start a superset with ${targetName}`,
        commit: `Started a superset with ${targetName}`,
      };
    }
    case "join-group": {
      const letter = supersetGroupLetter(prescriptions, intent.group);
      return {
        foreshadow: `Release to add to superset ${letter}`,
        commit: `Added ${movingName} to superset ${letter}`,
      };
    }
    case "leave-group": {
      const letter = supersetGroupLetter(
        prescriptions,
        prescriptions[intent.from].supersetGroup ?? "",
      );
      return {
        foreshadow: `Release to remove ${movingName} from superset ${letter}`,
        commit: `Removed ${movingName} from superset ${letter}`,
      };
    }
  }
}

// The display letter naming a Superset to the user: A for the first group in the Session,
// B for the second, and so on by order of first appearance — the same group-order badge
// the Live view shows ("superset A", `live-session.ts`). Member badges (A/B/C round order,
// `supersetLayout`) are a separate axis; this letters the *group*, not its members. An
// absent tag returns the empty string so a malformed call degrades quietly.
export function supersetGroupLetter(
  prescriptions: DraftPrescription[],
  group: string,
): string {
  if (group === "") return "";
  let ordinal = 0;
  const seen = new Set<string>();
  for (const prescription of prescriptions) {
    const tag = prescription.supersetGroup;
    if (tag === null || seen.has(tag)) continue;
    if (tag === group) return String.fromCharCode(65 + ordinal);
    seen.add(tag);
    ordinal += 1;
  }
  return "";
}

// Apply a semantic DropIntent to a Prescription list, deriving Superset membership from
// the container boundary so every result stays contiguous (ADR-0023). This replaces the
// old "refuse a move that splits a group" no-op: a reorder repositions; a leave-group
// detaches the dragged member (dissolving a group left under two); a form/join-group
// places the member adjacent to its new group and tags it. Round-rest ownership and a
// grouped member's dormant own rest are preserved throughout.
export function resolveDrop(
  prescriptions: DraftPrescription[],
  intent: DropIntent,
): DraftPrescription[] {
  switch (intent.kind) {
    case "reorder":
      // Among solos or within one group's run; a solo that would land strictly inside
      // another group is snapped to that group's edge so contiguity holds.
      return moveKeepingContiguous(prescriptions, intent.from, intent.to);
    case "leave-group": {
      // Pull the dragged member out of its box first (clearing its round-rest and
      // dissolving a group left under two), then reposition the now-solo row.
      const detached = detachFromGroup(prescriptions, intent.from);
      return moveKeepingContiguous(detached, intent.from, intent.to);
    }
    case "form-group":
      // Solo onto solo / a link chip: reuse the keyboard path's group union so drag
      // and button grouping stay one behavior.
      return groupByDrag(prescriptions, intent.from, intent.to);
    case "join-group":
      return joinGroup(prescriptions, intent.from, intent.group);
  }
}

// Reposition the row at `from` to `to`, but never leave a Superset split: a now-solo
// row that lands strictly between two members of the same group is snapped just past
// that group's near edge, in the drag direction (ADR-0023). A move that already keeps
// every group contiguous applies as-is. This is what makes contiguity hold by
// construction, replacing the old "refuse the move" no-op.
function moveKeepingContiguous(
  prescriptions: DraftPrescription[],
  from: number,
  to: number,
): DraftPrescription[] {
  const moved = moveItem(prescriptions, from, to);
  if (moved === prescriptions || supersetsAreContiguous(moved)) return moved;
  // The dragged row (now at `to`) wedged into a group's run; both neighbours share it.
  const straddled = moved[to - 1]?.supersetGroup ?? moved[to + 1]?.supersetGroup ?? null;
  if (straddled === null) return moved;
  const span = groupSpan(moved, straddled);
  if (!span) return moved;
  return moveItem(moved, to, from < to ? span.last : span.first);
}

// Add the Prescription at `from` to the existing Superset `group`: detach it from any
// prior group, move it adjacent to the group's run, and tag it with the group's shared
// round-rest — so the join stays contiguous and rest keeps belonging to the group
// (ADR-0023). A no-op when the row is already in that group or the group is absent.
function joinGroup(
  prescriptions: DraftPrescription[],
  from: number,
  group: string,
): DraftPrescription[] {
  const target = prescriptions[from];
  if (!target || target.supersetGroup === group) return prescriptions;
  const members = prescriptions.filter((p) => p.supersetGroup === group);
  if (members.length === 0) return prescriptions;
  const roundRest = members[0].roundRestSeconds;

  const detached = detachFromGroup(prescriptions, from);
  const span = groupSpan(detached, group);
  if (!span) return prescriptions;
  const moved = moveItem(detached, from, span.last);
  return moved.map((prescription, index) =>
    index === span.last
      ? { ...prescription, supersetGroup: group, roundRestSeconds: roundRest }
      : prescription,
  );
}

// Replace an un-performed Session's whole Prescription list via `change`, returning a
// new draft. A performed Session (frozen prefix) or an unknown Session id is left
// untouched — the same invariant the server enforces on deploy (ADR-0020).
function mapSessionPrescriptions(
  state: BuilderDraft,
  sessionId: number,
  change: (prescriptions: DraftPrescription[]) => DraftPrescription[],
): BuilderDraft {
  return {
    ...state,
    sessions: state.sessions.map((session) => {
      if (session.sessionId !== sessionId || session.performed) return session;
      return { ...session, prescriptions: change(session.prescriptions) };
    }),
  };
}

// Apply `change` to the Prescription at `position` inside the un-performed Session
// `sessionId`, returning a new draft. A performed Session, an unknown Session, or an
// out-of-range position leaves the draft untouched.
function mapPrescription(
  state: BuilderDraft,
  sessionId: number,
  position: number,
  change: (prescription: DraftPrescription) => DraftPrescription,
): BuilderDraft {
  return {
    ...state,
    sessions: state.sessions.map((session) => {
      if (session.sessionId !== sessionId || session.performed) return session;
      return {
        ...session,
        prescriptions: session.prescriptions.map((prescription, index) =>
          index === position ? change(prescription) : prescription,
        ),
      };
    }),
  };
}

// One cell of the builder's positional Week × session-slot matrix (ADR-0021): the
// Session occupying a slot in its week. Positional only — `week`/`day` place the
// cell in the grid with no weekday or date semantics. `prescriptionCount` is what
// the overview renders in the cell; `performed` distinguishes the frozen prefix
// (ADR-0020) so it reads read-only; `sessionId` is the navigation target the
// screen opens in the Prescription editor.
export interface MatrixCell {
  sessionId: number;
  week: number;
  day: number;
  prescriptionCount: number;
  performed: boolean;
}

// One row of the matrix: a week and the Sessions occupying its slots, in order.
export interface MatrixRow {
  week: number;
  cells: MatrixCell[];
}

// The builder's Week × session-slot overview view-model (ADR-0021). `rows` are the
// weeks in ascending order, each carrying the *actual* Sessions in that week — so
// uneven weeks (e.g. deloads) render their real count rather than a fixed
// frequency. `cadenceLabel` is the plan's nominal cadence header, e.g. `6/WK · 6 WK`.
export interface BuilderMatrix {
  rows: MatrixRow[];
  cadenceLabel: string;
}

// Derive the positional Week × session-slot matrix from a builder draft. Sessions
// are grouped by their week into ascending rows, each row's cells ordered by `day`
// (the slot within the week). No week is fabricated: only weeks that actually hold
// Sessions become rows, so the grid reflects the real per-week count including
// uneven weeks. The cadence header reports the plan's nominal frequency × weeks.
export function builderMatrix(draft: BuilderDraft): BuilderMatrix {
  const byWeek = new Map<number, MatrixCell[]>();
  for (const session of draft.sessions) {
    const cell: MatrixCell = {
      sessionId: session.sessionId,
      week: session.week,
      day: session.day,
      prescriptionCount: session.prescriptions.length,
      performed: session.performed,
    };
    const bucket = byWeek.get(session.week);
    if (bucket) bucket.push(cell);
    else byWeek.set(session.week, [cell]);
  }

  const rows: MatrixRow[] = [...byWeek.keys()]
    .sort((a, b) => a - b)
    .map((week) => ({
      week,
      cells: (byWeek.get(week) ?? [])
        .slice()
        .sort((a, b) => a.day - b.day),
    }));

  return {
    rows,
    cadenceLabel: `${draft.sessionsPerWeek}/WK · ${draft.weeks} WK`,
  };
}

// One Prescription as the deploy endpoint receives it: the Load travels as its
// kind+value (resolved server-side through `load_from_input`), never a pre-resolved
// dict, so building and logging share one Load path.
export interface DeployPrescriptionPayload {
  exercise_id: number;
  sets: number;
  reps: string;
  rest_seconds: number | null;
  tempo: string | null;
  load_kind: LoadKind;
  load_value: string;
  // Superset overlay (ADR-0023): the shared group tag and group-owned round-rest, both
  // null on a flat, solo Prescription. The deploy gate validates the grouping.
  superset_group: string | null;
  round_rest_seconds: number | null;
}

export interface DeploySessionPayload {
  // A real Session id for an edited existing Session, or `null` for a newly-added
  // slot the server inserts and enumerates on DEPLOY (ADR-0020).
  session_id: number | null;
  week: number;
  day: number;
  prescriptions: DeployPrescriptionPayload[];
}

export interface DeployPayload {
  weeks: number;
  sessions_per_week: number;
  // The user-editable name rides through DEPLOY (ADR-0021); the server normalizes a
  // blank value to the derived label.
  name: string | null;
  sessions: DeploySessionPayload[];
}

// Derive the desired un-performed tail the deploy endpoint validates and replaces.
// Only un-performed Sessions are sent — the frozen prefix is never part of the
// payload (ADR-0020).
export function toDeployPayload(draft: BuilderDraft): DeployPayload {
  return {
    weeks: draft.weeks,
    sessions_per_week: draft.sessionsPerWeek,
    name: draft.name,
    sessions: draft.sessions
      .filter((session) => !session.performed)
      .map((session) => ({
        // A negative client id marks a not-yet-persisted slot — send null so the
        // server inserts it (Module A/F).
        session_id: session.sessionId < 0 ? null : session.sessionId,
        week: session.week,
        day: session.day,
        prescriptions: session.prescriptions.map((prescription) => ({
          exercise_id: prescription.exerciseId,
          sets: prescription.sets,
          reps: prescription.reps,
          rest_seconds: prescription.restSeconds,
          tempo: prescription.tempo,
          load_kind: prescription.loadKind,
          load_value: prescription.loadValue,
          superset_group: prescription.supersetGroup,
          round_rest_seconds: prescription.roundRestSeconds,
        })),
      })),
  };
}

// One Prescription as the SIMULATE endpoint reads it: just the two facts a
// non-predictive balance preview needs — which catalog Exercise (to roll its muscles
// up server-side) and how many Sets it prescribes (the weight).
export interface SimulatePrescriptionPayload {
  exercise_id: number;
  sets: number;
}

export interface SimulateSessionPayload {
  week: number;
  prescriptions: SimulatePrescriptionPayload[];
}

export interface SimulatePayload {
  weeks: number;
  sessions_per_week: number;
  sessions: SimulateSessionPayload[];
}

// Derive the whole-plan preview payload for SIMULATE (Module C, ADR-0021). Unlike
// `toDeployPayload`, every Session is sent — the performed prefix included — so the
// per-week counts and Muscle-Group split reflect the whole edited plan, unsaved edits
// and all, not just the un-performed tail. It carries no reps/rest/tempo/Load: the
// preview only counts Sets and rolls Exercises up by muscle.
export function toSimulatePayload(draft: BuilderDraft): SimulatePayload {
  return {
    weeks: draft.weeks,
    sessions_per_week: draft.sessionsPerWeek,
    sessions: draft.sessions.map((session) => ({
      week: session.week,
      prescriptions: session.prescriptions.map((prescription) => ({
        exercise_id: prescription.exerciseId,
        sets: prescription.sets,
      })),
    })),
  };
}
