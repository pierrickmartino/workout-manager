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
// performed Session is read-only and never included in the deploy tail.
export interface DraftSession {
  sessionId: number;
  week: number;
  day: number;
  performed: boolean;
  prescriptions: DraftPrescription[];
}

export interface BuilderDraft {
  protocolId: number;
  weeks: number;
  sessionsPerWeek: number;
  sessions: DraftSession[];
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
    weeks: protocol.weeks,
    sessionsPerWeek: protocol.sessions_per_week,
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

    default:
      return state;
  }
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
  session_id: number;
  week: number;
  day: number;
  prescriptions: DeployPrescriptionPayload[];
}

export interface DeployPayload {
  weeks: number;
  sessions_per_week: number;
  sessions: DeploySessionPayload[];
}

// Derive the desired un-performed tail the deploy endpoint validates and replaces.
// Only un-performed Sessions are sent — the frozen prefix is never part of the
// payload (ADR-0020).
export function toDeployPayload(draft: BuilderDraft): DeployPayload {
  return {
    weeks: draft.weeks,
    sessions_per_week: draft.sessionsPerWeek,
    sessions: draft.sessions
      .filter((session) => !session.performed)
      .map((session) => ({
        session_id: session.sessionId,
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
