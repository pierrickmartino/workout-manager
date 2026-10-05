import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";

import { loadTsx, mountDom, setFieldValue } from "./tsx-harness.ts";
import { groupUnits, initLiveSession, liveSessionReducer } from "./live-session.ts";
import type { LiveSessionState } from "./live-session.ts";
import type { ExercisePrescription, WorkoutSession } from "./sessions-types.ts";

// The Live Session set table, mounted (ADR-0114). `live-set-table.test.ts` holds what the view
// decides; this holds what only the rendered card can show: that a member's one Load kind pick
// reaches that member's sets still to do and nobody else's, that the row a user types into is the
// row whose completion carries the values, and that a completed row's ✓ is its Reopen.

function prescription(
  position: number,
  name: string,
  sets: number,
  reps: string,
  recommended_load: ExercisePrescription["recommended_load"],
  extra: Partial<ExercisePrescription> = {},
): ExercisePrescription {
  return {
    position, sets, reps, rest_seconds: 90, tempo: null, recommended_load,
    exercise_id: 100 + position, exercise_name: name, exercise_description: null,
    targeted_muscles: [], required_equipment: [], provenance: "curated", ...extra,
  };
}

const SESSION: WorkoutSession = {
  id: 7,
  clerk_user_id: "user_1",
  training_type: "strength",
  duration_minutes: 45,
  has_been_regenerated: false,
  prescriptions: [
    prescription(1, "Explosive pull-up", 2, "5", { kind: "bodyweight", text: "bodyweight" }),
    prescription(2, "Incline dumbbell curl", 2, "12", { kind: "absolute", text: "12 kg", kg: 12 }, {
      superset_group: "g1", round_rest_seconds: 90,
    }),
    prescription(3, "Ring dip", 2, "8", { kind: "bodyweight", text: "bodyweight + 10 kg", added_kg: 10 }, {
      superset_group: "g1", round_rest_seconds: 90,
    }),
  ],
};

interface Completion {
  index: number;
  reps: number;
  loadKind: string;
  loadValue: string;
  rpe: number | null;
}

interface Calls {
  completed: Completion[];
  skipped: number[];
  reopened: number[];
}

function started(): LiveSessionState {
  return liveSessionReducer(initLiveSession(SESSION, "kg"), { type: "START" });
}

async function withList(
  state: LiveSessionState,
  options: { isFinishing?: boolean },
  body: (calls: Calls) => Promise<void>,
): Promise<void> {
  const { restore } = mountDom();
  try {
    const { LiveSessionSets } = loadTsx<{ LiveSessionSets: React.ComponentType<Record<string, unknown>> }>(
      "components/live-session-sets.tsx",
    );
    const calls: Calls = { completed: [], skipped: [], reopened: [] };
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(document.getElementById("root")!);
    await React.act(async () =>
      root.render(
        React.createElement(LiveSessionSets, {
          units: groupUnits(state),
          currentIndex: state.currentIndex,
          expandedUnits: new Set<number>(),
          onExpandUnit: () => {},
          onCompleteSet: (index: number, reps: number, loadKind: string, loadValue: string, rpe: number | null) =>
            calls.completed.push({ index, reps, loadKind, loadValue, rpe }),
          onSkipSet: (index: number) => calls.skipped.push(index),
          onReopenSet: (index: number) => calls.reopened.push(index),
          isFinishing: options.isFinishing ?? false,
          weightUnit: "kg",
        }),
      ),
    );
    await body(calls);
    await React.act(async () => root.unmount());
  } finally {
    restore();
  }
}

function byLabel<E extends Element = HTMLElement>(label: string): E {
  const element = document.querySelector<E>(`[aria-label="${label}"]`);
  assert.ok(element, `the card renders a control labelled "${label}"`);
  return element;
}

async function pick(label: string, value: string): Promise<void> {
  const select = byLabel<HTMLSelectElement>(label);
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")!.set!.call(select, value);
    select.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
}

async function click(label: string): Promise<void> {
  await React.act(async () => byLabel<HTMLButtonElement>(label).click());
}

test("one card per unit, one row per set, a Superset's rows under its rounds", async () => {
  await withList(started(), {}, async () => {
    // Assert
    assert.equal(document.querySelectorAll("[data-set-table]").length, 2);
    assert.deepEqual(
      Array.from(document.querySelectorAll("li[id]")).map((row) => row.id),
      ["live-set-1-1", "live-set-1-2", "live-set-2-1", "live-set-3-1", "live-set-2-2", "live-set-3-2"],
    );
    const superset = document.querySelectorAll("[data-set-table]")[1];
    assert.match(superset.textContent ?? "", /Superset A · 2 rounds/);
    assert.match(superset.textContent ?? "", /ROUND 1\/2.*ROUND 2\/2/s);
  });
});

test("a typed row completes with its own values", async () => {
  await withList(started(), {}, async (calls) => {
    // Act
    await React.act(async () => setFieldValue(byLabel<HTMLInputElement>("Reps for Explosive pull-up, set 1"), "6"));
    await React.act(async () => setFieldValue(byLabel<HTMLInputElement>("Load for Explosive pull-up, set 1"), "5"));
    await pick("RPE for Explosive pull-up, set 1", "8");
    await click("Complete Explosive pull-up, set 1");

    // Assert
    assert.deepEqual(calls.completed, [
      { index: 0, reps: 6, loadKind: "bodyweight", loadValue: "5", rpe: 8 },
    ]);
  });
});

test("a member's Load kind reaches its own sets still to do, and no other member's", async () => {
  // Arrange — the curl's round-1 set (index 2) already done with its prescribed kind.
  let state = started();
  state = liveSessionReducer(state, {
    type: "COMPLETE_SET", index: 2, reps: 12, loadKind: "absolute", loadValue: "12", rpe: null,
  });

  await withList(state, {}, async (calls) => {
    // Act — the dip goes from bodyweight to a plain weight; then complete one of each member.
    await pick("Load kind for Ring dip", "absolute");
    await click("Complete Ring dip, set 2");
    await click("Complete Incline dumbbell curl, set 2");

    // Assert — the dip's pending set took the pick; the curl kept its own kind.
    assert.deepEqual(
      calls.completed.map(({ index, loadKind }) => [index, loadKind]),
      [
        [5, "absolute"],
        [4, "absolute"],
      ],
    );
  });
});

test("a pick never reaches a completed set, which keeps what it was completed with", async () => {
  // Arrange — the first pull-up done as bodyweight.
  const state = liveSessionReducer(started(), {
    type: "COMPLETE_SET", index: 0, reps: 5, loadKind: "bodyweight", loadValue: "", rpe: null,
  });

  await withList(state, {}, async (calls) => {
    // Act — change the kind, then reopen the completed set.
    await pick("Load kind for Explosive pull-up", "absolute");
    await click("Reopen Explosive pull-up, set 1");

    // Assert — the reopen is raised; the completed row was untouched by the pick.
    assert.deepEqual(calls.reopened, [0]);
    assert.equal(byLabel<HTMLInputElement>("Load for Explosive pull-up, set 1").placeholder, "0");
    assert.equal(byLabel<HTMLInputElement>("Load for Explosive pull-up, set 2").parentElement?.textContent, "kg");
  });
});

test("a completed row is read-only, and its reopen waits out a finish in flight", async () => {
  // Arrange
  const state = liveSessionReducer(started(), {
    type: "COMPLETE_SET", index: 0, reps: 5, loadKind: "bodyweight", loadValue: "", rpe: null,
  });

  await withList(state, { isFinishing: true }, async () => {
    // Assert
    assert.equal(byLabel<HTMLInputElement>("Reps for Explosive pull-up, set 1").disabled, true);
    assert.equal(byLabel<HTMLButtonElement>("Reopen Explosive pull-up, set 1").disabled, true);
    assert.equal(byLabel<HTMLInputElement>("Reps for Explosive pull-up, set 2").disabled, false);
  });
});

test("skip is offered for the current set only", async () => {
  await withList(started(), {}, async (calls) => {
    // Act
    await click("Skip Explosive pull-up, set 1");

    // Assert
    assert.deepEqual(calls.skipped, [0]);
    assert.equal(document.querySelectorAll('[aria-label^="Skip "]').length, 1);
  });
});
