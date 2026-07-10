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
      return mapSessionPrescriptions(state, event.sessionId, (prescriptions) =>
        movePrescription(prescriptions, event.from, event.to),
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
