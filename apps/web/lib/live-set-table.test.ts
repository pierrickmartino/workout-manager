import { test } from "node:test";
import assert from "node:assert/strict";

import { groupUnits, initLiveSession, liveSessionReducer } from "./live-session.ts";
import type { LiveSessionState } from "./live-session.ts";
import { loadValueHint } from "./load.ts";
import { lastTimeText, setTableView, shortLoadText } from "./live-set-table.ts";
import type { ExercisePrescription, WorkoutSession } from "./sessions-types.ts";

// The Live Session set table (ADR-0114) is a projection over the units the screen already
// groups: one card per unit, the prescription and last time once per member, a Load kind once
// per member, and a Superset's rows grouped by round under A1 / A2 member tags.

function prescription(
  position: number,
  name: string,
  sets: number,
  reps: string,
  recommended_load: ExercisePrescription["recommended_load"],
  extra: Partial<ExercisePrescription> = {},
): ExercisePrescription {
  return {
    position,
    sets,
    reps,
    rest_seconds: 90,
    tempo: null,
    recommended_load,
    exercise_id: 100 + position,
    exercise_name: name,
    exercise_description: null,
    targeted_muscles: [],
    required_equipment: [],
    provenance: "curated",
    ...extra,
  };
}

const BW = { kind: "bodyweight" as const, text: "bodyweight" };

const SESSION: WorkoutSession = {
  id: 7,
  clerk_user_id: "user_1",
  training_type: "strength",
  duration_minutes: 45,
  has_been_regenerated: false,
  prescriptions: [
    prescription(1, "Explosive pull-up", 4, "5", BW, {
      previous_performance: [
        { reps: 5, load: BW },
        { reps: 5, load: BW },
        { reps: 4, load: BW },
      ],
    }),
    prescription(2, "Incline dumbbell curl", 3, "12", { kind: "absolute", text: "12 kg", kg: 12 }, {
      superset_group: "g1",
      round_rest_seconds: 90,
      previous_performance: [1, 2, 3].map(() => ({
        reps: 12,
        load: { kind: "absolute" as const, text: "10 kg", kg: 10 },
      })),
    }),
    prescription(3, "Ring dip", 3, "8", { kind: "bodyweight", text: "bodyweight + 10 kg", added_kg: 10 }, {
      superset_group: "g1",
      round_rest_seconds: 90,
    }),
  ],
};

function started(): LiveSessionState {
  return liveSessionReducer(initLiveSession(SESSION, "kg"), { type: "START" });
}

function completeAt(state: LiveSessionState, index: number): LiveSessionState {
  const set = state.sets[index];
  return liveSessionReducer(state, {
    type: "COMPLETE_SET",
    index,
    reps: set.reps,
    loadKind: set.loadKind,
    loadValue: set.loadValue,
    rpe: null,
  });
}

test("a solo exercise is titled by its name, with its rows tagged by set number", () => {
  // Arrange
  const state = started();

  // Act
  const view = setTableView(groupUnits(state)[0], state.currentIndex);

  // Assert
  assert.equal(view.title, "Explosive pull-up");
  assert.equal(view.supersetLabel, null);
  assert.equal(view.rounds.length, 1);
  assert.equal(view.rounds[0].round, null);
  assert.deepEqual(view.rounds[0].rows.map((row) => row.tag), ["1", "2", "3", "4"]);
  assert.deepEqual(view.members.map((member) => member.tag), [null]);
});

test("a member reads its prescription and last time once, in the table's short Load", () => {
  // Arrange
  const state = started();

  // Act
  const [member] = setTableView(groupUnits(state)[0], state.currentIndex).members;

  // Assert
  assert.equal(member.prescriptionText, "4 × 5 · BW");
  assert.equal(member.lastText, "last 5×BW, 5×BW, 4×BW");
});

test("a Superset names its members A1 / A2 and groups its rows by round in performed order", () => {
  // Arrange
  const state = started();

  // Act
  const view = setTableView(groupUnits(state)[1], state.currentIndex);

  // Assert
  assert.equal(view.title, "Superset A · 3 rounds");
  assert.equal(view.roundCount, 3);
  assert.deepEqual(
    view.members.map((member) => [member.tag, member.name]),
    [
      ["A1", "Incline dumbbell curl"],
      ["A2", "Ring dip"],
    ],
  );
  assert.deepEqual(
    view.rounds.map((round) => [round.round, round.rows.map((row) => row.tag)]),
    [
      [1, ["A1", "A2"]],
      [2, ["A1", "A2"]],
      [3, ["A1", "A2"]],
    ],
  );
});

test("each Superset member keeps its own prescription and history", () => {
  // Arrange
  const state = started();

  // Act
  const [curl, dip] = setTableView(groupUnits(state)[1], state.currentIndex).members;

  // Assert
  assert.equal(curl.prescriptionText, "3 × 12 · 12 kg");
  assert.equal(curl.lastText, "last 3 × 12 · 10 kg");
  assert.equal(dip.prescriptionText, "3 × 8 · BW +10 kg");
  assert.equal(dip.lastText, null);
});

test("a member's Load kind applies to its sets still to do, never to a completed one", () => {
  // Arrange — the curl's first set (index 4) done; the dip untouched.
  const state = completeAt(started(), 4);

  // Act
  const [curl, dip] = setTableView(groupUnits(state)[1], state.currentIndex).members;

  // Assert
  assert.deepEqual(curl.pendingIndexes, [6, 8]);
  assert.deepEqual(curl.indexes, [4, 6, 8]);
  assert.deepEqual(dip.pendingIndexes, [5, 7, 9]);
});

test("rows name their exercise and set, so identical controls stay distinguishable", () => {
  // Arrange
  const state = started();

  // Act
  const rows = setTableView(groupUnits(state)[1], state.currentIndex).rounds[1].rows;

  // Assert
  assert.deepEqual(
    rows.map((row) => row.subject),
    ["Incline dumbbell curl, set 2", "Ring dip, set 2"],
  );
});

test("the done count and the current row follow the performance", () => {
  // Arrange
  const state = completeAt(started(), 0);

  // Act
  const view = setTableView(groupUnits(state)[0], state.currentIndex);

  // Assert
  assert.equal(view.done, 1);
  assert.equal(view.total, 4);
  assert.equal(view.holdsCurrent, true);
  assert.deepEqual(
    view.rounds[0].rows.map((row) => [row.isCompleted, row.isCurrent]),
    [
      [true, false],
      [false, true],
      [false, false],
      [false, false],
    ],
  );
});

test("skip belongs to the current set only, and names its round inside a Superset", () => {
  // Arrange — the pull-ups done, then the round-1 curl: the dip of round 1 is current.
  let state = started();
  for (const index of [0, 1, 2, 3, 4]) state = completeAt(state, index);
  const [pullUps, superset] = groupUnits(state);

  // Act
  const soloSkip = setTableView(pullUps, state.currentIndex).skip;
  const supersetSkip = setTableView(superset, state.currentIndex).skip;

  // Assert
  assert.equal(soloSkip, null);
  assert.deepEqual(supersetSkip, {
    index: 5,
    text: "Skip A2 · round 1",
    ariaLabel: "Skip Ring dip, set 1",
  });
});

test("a solo exercise's skip names the set number", () => {
  // Arrange
  const state = completeAt(started(), 0);

  // Act
  const skip = setTableView(groupUnits(state)[0], state.currentIndex).skip;

  // Assert
  assert.deepEqual(skip, { index: 1, text: "Skip set 2", ariaLabel: "Skip Explosive pull-up, set 2" });
});

test("last time collapses to one figure when every set matched, and lists them when not", () => {
  // Arrange
  const same = [1, 2, 3].map(() => ({ reps: 8, loadText: "67.5 kg" }));
  const differing = [
    { reps: 5, loadText: "bodyweight" },
    { reps: 4, loadText: "bodyweight + 5 kg" },
  ];

  // Act / Assert
  assert.equal(lastTimeText(same), "3 × 8 · 67.5 kg");
  assert.equal(lastTimeText(differing), "5×BW, 4×BW +5 kg");
  assert.equal(lastTimeText([]), null);
});

test("a bodyweight Load value is the added load, so its field reads +unit from zero", () => {
  // Act / Assert
  assert.deepEqual(loadValueHint("bodyweight", "kg"), { suffix: "+kg", placeholder: "0" });
  assert.deepEqual(loadValueHint("bodyweight", "lb"), { suffix: "+lb", placeholder: "0" });
  assert.deepEqual(loadValueHint("absolute", "lb"), { suffix: "lb", placeholder: "—" });
  assert.deepEqual(loadValueHint("percent_1rm", "kg"), { suffix: "%", placeholder: "—" });
  assert.deepEqual(loadValueHint("range", "kg"), { suffix: "kg", placeholder: "60-70" });
  assert.deepEqual(loadValueHint("qualitative", "kg"), { suffix: "", placeholder: "light" });
});

test("bodyweight shortens to BW, with or without an added load", () => {
  // Act / Assert
  assert.equal(shortLoadText("bodyweight"), "BW");
  assert.equal(shortLoadText("bodyweight + 10 kg"), "BW +10 kg");
  assert.equal(shortLoadText("70 kg"), "70 kg");
});

test("a member with no prescribed Load reads as its sets and reps alone", () => {
  // Arrange
  const session: WorkoutSession = {
    ...SESSION,
    prescriptions: [prescription(1, "Plank walk", 2, "10", null)],
  };
  const state = liveSessionReducer(initLiveSession(session, "kg"), { type: "START" });

  // Act
  const [member] = setTableView(groupUnits(state)[0], state.currentIndex).members;

  // Assert
  assert.equal(member.prescriptionText, "2 × 10");
});
