import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";

import { loadTsx } from "./tsx-harness.ts";
import { buildAuthorPlanRequest } from "./hand-authored-session.ts";
import { buildInsertPrescriptionRequest } from "./insert-prescription.ts";
import {
  PRESCRIPTION_SURFACES,
  authoredRowPatch,
  builderPrescriptionEvent,
  prescriptionControlSet,
  type PrescriptionControl,
  type PrescriptionControlSet,
  type PrescriptionSurface,
} from "./prescription-controls.ts";
import { toDeployPayload, type DraftPrescription } from "./protocol-builder.ts";

// ADR-0129: a surface declares which Prescription controls it authors, and the declaration is
// held to what that surface's request actually sends. The old stack inferred the set from which
// optional handlers a caller passed, so a forgotten handler dropped a control silently; a
// declaration that drifted from its payload would now accept input and then lose it, or send a
// field nobody can edit. Both fail here.

// Each request key a surface sends, mapped to the stack control that authors it. `null` marks a
// key the stack does not author: the Exercise is the surface's own picker, the Superset overlay
// is the surface's grouping chrome, and the Progression Scheme is the Builder's `advanced` slot.
// A key missing from this table fails the test, so a new payload field forces a decision about
// which control authors it.
const REQUEST_KEY_CONTROL: Record<string, PrescriptionControl | null> = {
  exercise_id: null,
  superset_group: null,
  round_rest_seconds: null,
  scheme: null,
  sets: "sets",
  reps: "target",
  quantity_kind: "quantity",
  quantity_unit: "quantity",
  load_kind: "load",
  load_value: "load",
  rest_seconds: "rest",
  tempo: "tempo",
  set_type: "setType",
  target_effort_scale: "targetEffort",
  target_effort_value: "targetEffort",
  note: "note",
};

function controlsSentBy(request: object): Set<PrescriptionControl> {
  const controls = new Set<PrescriptionControl>();
  for (const key of Object.keys(request)) {
    assert.ok(key in REQUEST_KEY_CONTROL, `request key ${key} is mapped to no control`);
    const control = REQUEST_KEY_CONTROL[key];
    if (control) controls.add(control);
  }
  return controls;
}

function declared(surface: PrescriptionSurface): Set<PrescriptionControl> {
  return new Set(PRESCRIPTION_SURFACES[surface].controls);
}

function draftPrescription(overrides: Partial<DraftPrescription> = {}): DraftPrescription {
  return {
    exerciseId: 7,
    exerciseName: "Back Squat",
    sets: 3,
    reps: "8-12",
    quantityKind: "repetitions",
    quantityUnit: "km",
    restSeconds: 90,
    tempo: "3-1-1",
    loadKind: "absolute",
    loadValue: "60",
    supersetGroup: null,
    roundRestSeconds: null,
    scheme: null,
    setType: "drop",
    targetEffort: { scale: "rpe", value: 8 },
    note: "pause on the chest",
    ...overrides,
  };
}

test("Insert declares exactly the controls its request carries", () => {
  // Arrange
  const result = buildInsertPrescriptionRequest(
    {
      exerciseId: 7, kind: "repetitions", unit: "km", sets: "3", reps: "8-12",
      restSeconds: "90", tempo: "3-1-1", setType: "drop", loadKind: "absolute",
      loadValue: "60",
    },
    "kg",
  );
  assert.ok(result.ok);

  // Act
  const sent = controlsSentBy(result.request);

  // Assert — no Target Effort and no Note: the request has nowhere to put them.
  assert.deepEqual(sent, declared("insert"));
});

test("the Hand-Authored form declares exactly the controls its request carries", () => {
  // Arrange — every optional field filled, so each key that can ride does.
  const result = buildAuthorPlanRequest(
    {
      trainingType: "strength",
      exercises: [{
        exerciseId: 7, kind: "repetitions", unit: "km", sets: "3", reps: "8-12",
        restSeconds: "90", tempo: "3-1-1", setType: "drop", note: "pause on the chest",
        targetEffortScale: "rpe", targetEffortValue: "8", loadKind: "absolute",
        loadValue: "60", supersetGroup: null, roundRestSeconds: null, performedSets: [],
      }],
    },
    "kg",
  );
  assert.ok(result.ok);

  // Act
  const sent = controlsSentBy(result.request.prescriptions[0]);

  // Assert
  assert.deepEqual(sent, declared("handAuthored"));
});

test("the Builder declares exactly the controls its Deploy payload carries", () => {
  // Arrange
  const payload = toDeployPayload(
    {
      protocolId: 1, name: null, weeks: 1, sessionsPerWeek: 1, queuedExercise: null,
      supersetsSuppressed: false,
      sessions: [{
        sessionId: 1, week: 1, day: 1, performed: false, prescriptions: [draftPrescription()],
      }],
    },
    "kg",
  );

  // Act
  const sent = controlsSentBy(payload.sessions[0].prescriptions[0]);

  // Assert
  assert.deepEqual(sent, declared("builder"));
});

test("a grouped Superset member drops its own Rest and nothing else", () => {
  for (const surface of Object.keys(PRESCRIPTION_SURFACES) as PrescriptionSurface[]) {
    // Arrange
    const solo = prescriptionControlSet(surface, { grouped: false }).controls;

    // Act
    const grouped = prescriptionControlSet(surface, { grouped: true }).controls;

    // Assert
    assert.ok(solo.has("rest"), `${surface}: a solo row authors its rest`);
    assert.deepEqual(
      new Set([...grouped, "rest"]),
      new Set(solo),
      `${surface}: grouping removes only Rest`,
    );
    assert.equal(grouped.has("rest"), false);
  }
});

test("only a surface that shows the Session Section drops the warm-up chip", () => {
  // Arrange / Act
  const suppressed = (surface: PrescriptionSurface) =>
    prescriptionControlSet(surface, { grouped: false }).suppressWarmUpSummaryChip;

  // Assert — Insert has no composition strip, so its row is the only place a warm-up shows.
  assert.equal(suppressed("insert"), false);
  assert.equal(suppressed("handAuthored"), true);
  assert.equal(suppressed("builder"), true);
});

test("an ad-hoc kind pick re-defaults the Load kind for the new Quantity", () => {
  // Arrange / Act
  const hold = authoredRowPatch({ field: "kind", value: "duration" });
  const reps = authoredRowPatch({ field: "kind", value: "repetitions" });

  // Assert
  assert.deepEqual(hold, { kind: "duration", loadKind: "bodyweight" });
  assert.deepEqual(reps, { kind: "repetitions", loadKind: "absolute" });
});

test("an ad-hoc row names its target reps and holds the effort pair as typed", () => {
  // Arrange / Act / Assert
  assert.deepEqual(authoredRowPatch({ field: "target", value: "45s" }), { reps: "45s" });
  assert.deepEqual(
    authoredRowPatch({ field: "targetEffort", scale: "rir", value: "2" }),
    { targetEffortScale: "rir", targetEffortValue: "2" },
  );
  assert.deepEqual(authoredRowPatch({ field: "note", value: "brace" }), { note: "brace" });
});

test("a Builder kind pick keeps the unit and leaves the Load alone", () => {
  // Arrange
  const prescription = draftPrescription({ quantityUnit: "mi" });

  // Act
  const event = builderPrescriptionEvent(2, prescription, { field: "kind", value: "distance" });

  // Assert
  assert.deepEqual(event, {
    type: "SET_QUANTITY", position: 2, quantityKind: "distance", quantityUnit: "mi",
  });
});

test("a Builder edit stores a blank or default optional value as unset", () => {
  // Arrange
  const prescription = draftPrescription();
  const event = (edit: Parameters<typeof builderPrescriptionEvent>[2]) =>
    builderPrescriptionEvent(0, prescription, edit);

  // Act / Assert
  assert.deepEqual(event({ field: "restSeconds", value: "" }), {
    type: "EDIT_PRESCRIPTION", position: 0, field: "restSeconds", value: null,
  });
  assert.deepEqual(event({ field: "tempo", value: "" }), {
    type: "EDIT_PRESCRIPTION", position: 0, field: "tempo", value: null,
  });
  assert.deepEqual(event({ field: "setType", value: "working" }), {
    type: "SET_SET_TYPE", position: 0, setType: null,
  });
  assert.deepEqual(event({ field: "note", value: "  " }), {
    type: "SET_NOTE", position: 0, note: null,
  });
  assert.deepEqual(event({ field: "targetEffort", scale: "rpe", value: "" }), {
    type: "SET_TARGET_EFFORT", position: 0, targetEffort: null,
  });
  assert.deepEqual(event({ field: "loadValue", value: "70" }), {
    type: "EDIT_LOAD", position: 0, loadKind: "absolute", loadValue: "70",
  });
});

function renderStack(controls: PrescriptionControlSet): Document {
  const { PrescriptionFieldStack } = loadTsx(
    "components/prescription/PrescriptionFieldStack.tsx",
  );
  const markup = renderToStaticMarkup(React.createElement(PrescriptionFieldStack, {
    exerciseName: "Back Squat",
    weightUnit: "kg",
    controls,
    value: {
      kind: "repetitions", unit: "km", sets: "3", target: "8-12", restSeconds: "",
      tempo: "", setType: "", loadKind: "absolute", loadValue: "",
    },
    onChange: (): void => {},
  }));
  return new JSDOM(`<!doctype html><body>${markup}</body>`).window.document;
}

function labelled(document: Document, label: string): boolean {
  return document.querySelector(`[aria-label="${label}"]`) !== null;
}

test("the stack renders the declared controls and only those", () => {
  // Arrange / Act
  const insert = renderStack(prescriptionControlSet("insert", { grouped: false }));
  const groupedMember = renderStack(prescriptionControlSet("handAuthored", { grouped: true }));

  // Assert — the controls are present or absent by the preset, not by which handlers exist.
  assert.ok(labelled(insert, "Rest seconds for Back Squat"));
  assert.ok(labelled(insert, "Set type for Back Squat"));
  assert.equal(labelled(insert, "Note for Back Squat"), false);
  assert.equal(labelled(insert, "Target effort for Back Squat"), false);
  assert.equal(labelled(groupedMember, "Rest seconds for Back Squat"), false);
  assert.ok(labelled(groupedMember, "Note for Back Squat"));
  assert.ok(labelled(groupedMember, "Target effort for Back Squat"));
});
