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

// Read a fetched Protocol into an editable builder draft. Each Session keeps its
// `performed` flag so the screen renders the frozen prefix read-only, and each
// Prescription's stored Load is expanded into the kind+value the picker edits.
export function initBuilderDraft(protocol: ProtocolProgress): BuilderDraft {
  return {
    protocolId: protocol.id,
    name: protocol.name,
    weeks: protocol.weeks,
    sessionsPerWeek: protocol.sessions_per_week,
    // A freshly-read draft has nothing queued; the F6 deep-link seeds it after init.
    queuedExercise: null,
    sessions: protocol.sessions.map((session) => ({
      sessionId: session.session_id,
      week: session.week,
      day: session.day,
      performed: session.performed,
      prescriptions: session.prescriptions.map((prescription) => {
        const load = prefillLoad(prescription.recommended_load);
        return {
          exerciseId: prescription.exercise_id,
          exerciseName: prescription.exercise_name,
          sets: prescription.sets,
          reps: prescription.reps,
          restSeconds: prescription.rest_seconds,
          tempo: prescription.tempo,
          loadKind: load.kind,
          loadValue: load.value,
          supersetGroup: prescription.superset_group ?? null,
          roundRestSeconds: prescription.round_rest_seconds ?? null,
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
      // this Prescription would split a group, refuse the move.
      return mapSessionPrescriptions(state, event.sessionId, (prescriptions) => {
        const moved = movePrescription(prescriptions, event.from, event.to);
        return supersetsAreContiguous(moved) ? moved : prescriptions;
      });

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

// Move the Prescription at `from` to index `to`, shifting the rest, and return a new
// array. An out-of-range index leaves the order unchanged.
function movePrescription(
  prescriptions: DraftPrescription[],
  from: number,
  to: number,
): DraftPrescription[] {
  const last = prescriptions.length - 1;
  if (from < 0 || from > last || to < 0 || to > last || from === to) {
    return prescriptions;
  }
  const reordered = [...prescriptions];
  const [moved] = reordered.splice(from, 1);
  reordered.splice(to, 0, moved);
  return reordered;
}

// A fresh Superset tag for a Session: one past the largest numeric tag already in use,
// so a new group never collides with an existing one. Tags originate here (the reducer
// is the only author this slice), so a simple numeric scheme suffices.
function freshSupersetTag(prescriptions: DraftPrescription[]): string {
  const used = prescriptions
    .map((prescription) => prescription.supersetGroup)
    .filter((group): group is string => group !== null)
    .map((group) => Number.parseInt(group, 10))
    .filter((value) => Number.isInteger(value));
  return String(used.length > 0 ? Math.max(...used) + 1 : 1);
}

// Group the Prescription at `position` with the next one into one Superset, unifying
// any groups they already belong to (ADR-0023). The unified group takes the first
// member's tag (else the next's, else a fresh tag) and one round-rest: an existing
// group's round-rest is kept, otherwise it seeds from the last member's own rest. An
// out-of-range `position` (no next Prescription) leaves the list untouched.
function groupWithNext(
  prescriptions: DraftPrescription[],
  position: number,
): DraftPrescription[] {
  const first = prescriptions[position];
  const next = prescriptions[position + 1];
  if (!first || !next) return prescriptions;

  const tag = first.supersetGroup ?? next.supersetGroup ?? freshSupersetTag(prescriptions);
  const absorbed = new Set<string>();
  if (first.supersetGroup) absorbed.add(first.supersetGroup);
  if (next.supersetGroup) absorbed.add(next.supersetGroup);

  const existingRoundRest =
    (first.supersetGroup ? first.roundRestSeconds : null) ??
    (next.supersetGroup ? next.roundRestSeconds : null);
  const roundRest = existingRoundRest ?? next.restSeconds;

  return prescriptions.map((prescription, index) => {
    const joins =
      index === position ||
      index === position + 1 ||
      (prescription.supersetGroup !== null && absorbed.has(prescription.supersetGroup));
    if (!joins) return prescription;
    return { ...prescription, supersetGroup: tag, roundRestSeconds: roundRest };
  });
}

// Dissolve the Superset the Prescription at `position` belongs to: clear the tag and
// round-rest on every member, so each member's own (dormant) rest is live again. A
// Prescription that is not in a group leaves the list untouched.
function ungroup(
  prescriptions: DraftPrescription[],
  position: number,
): DraftPrescription[] {
  const tag = prescriptions[position]?.supersetGroup ?? null;
  if (tag === null) return prescriptions;
  return prescriptions.map((prescription) =>
    prescription.supersetGroup === tag
      ? { ...prescription, supersetGroup: null, roundRestSeconds: null }
      : prescription,
  );
}

// Set the group-owned round-rest of the Superset at `position` on every member, so the
// value stays consistent no matter which member the edit came from. A no-op when the
// Prescription is not grouped.
function editRoundRest(
  prescriptions: DraftPrescription[],
  position: number,
  roundRestSeconds: number | null,
): DraftPrescription[] {
  const tag = prescriptions[position]?.supersetGroup ?? null;
  if (tag === null) return prescriptions;
  return prescriptions.map((prescription) =>
    prescription.supersetGroup === tag
      ? { ...prescription, roundRestSeconds }
      : prescription,
  );
}

// Whether every Superset occupies an unbroken run of positions — the invariant the
// reducer maintains on reorder and the deploy gate re-checks (ADR-0023).
function supersetsAreContiguous(prescriptions: DraftPrescription[]): boolean {
  const bounds = new Map<string, { first: number; last: number; count: number }>();
  prescriptions.forEach((prescription, index) => {
    const group = prescription.supersetGroup;
    if (group === null) return;
    const bound = bounds.get(group);
    if (!bound) bounds.set(group, { first: index, last: index, count: 1 });
    else {
      bound.last = index;
      bound.count += 1;
    }
  });
  for (const { first, last, count } of bounds.values()) {
    if (last - first + 1 !== count) return false;
  }
  return true;
}

// One Prescription's Superset display facts, aligned to the Session's Prescription
// list — what the Builder renders per row (ADR-0023). Solo Prescriptions carry a null
// `memberLabel`; a grouped member gets its A/B/C badge, whether it opens or closes the
// group (so the round-rest field renders once, on the last member), and the group's
// round-rest. `canGroupWithNext` gates the "group with next" control.
export interface SupersetSlot {
  group: string | null;
  memberLabel: string | null;
  isFirstMember: boolean;
  isLastMember: boolean;
  roundRestSeconds: number | null;
  canGroupWithNext: boolean;
}

// Derive the per-Prescription Superset layout for a Session. Members of a group are
// lettered A, B, C… in order; the group's first/last members are flagged so the UI can
// bracket it and place the single round-rest field on its last member.
export function supersetLayout(
  prescriptions: DraftPrescription[],
): SupersetSlot[] {
  const totals = new Map<string, number>();
  for (const prescription of prescriptions) {
    if (prescription.supersetGroup !== null) {
      totals.set(
        prescription.supersetGroup,
        (totals.get(prescription.supersetGroup) ?? 0) + 1,
      );
    }
  }

  const ordinals = new Map<string, number>();
  return prescriptions.map((prescription, index) => {
    const group = prescription.supersetGroup;
    const next = prescriptions[index + 1];
    // A Prescription can start/extend a group with its neighbour when one exists and
    // is not already in the *same* group.
    const canGroupWithNext =
      next !== undefined && (group === null || next.supersetGroup !== group);

    if (group === null) {
      return {
        group: null,
        memberLabel: null,
        isFirstMember: false,
        isLastMember: false,
        roundRestSeconds: null,
        canGroupWithNext,
      };
    }

    const ordinal = ordinals.get(group) ?? 0;
    ordinals.set(group, ordinal + 1);
    const total = totals.get(group) ?? 1;
    return {
      group,
      memberLabel: String.fromCharCode(65 + ordinal),
      isFirstMember: ordinal === 0,
      isLastMember: ordinal === total - 1,
      roundRestSeconds: prescription.roundRestSeconds,
      canGroupWithNext,
    };
  });
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
