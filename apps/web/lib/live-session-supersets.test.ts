import { test } from "node:test";
import assert from "node:assert/strict";

import {
  initLiveSession,
  liveSessionReducer,
  currentUnit,
  currentSuperset,
  groupUnits,
  nextExercise,
  restCue,
  completionOutcome,
  progressPercent,
  type LiveSessionState,
} from "./live-session.ts";
import {
  saveLiveSession,
  loadLiveSession,
  type SlotStorage,
} from "./live-session-storage.ts";
import type { WorkoutSession } from "./sessions-types.ts";

// Supersets in the Live Session (issue #155 — F5·S2, ADR-0023, amends ADR-0012).
// A Superset is a round-major grouping overlay: members are interleaved one set of
// each per round (`A1, B1, A2, B2…`), rest fires only at the round boundary (never
// between members), and the whole group counts as ONE unit in the header. The
// one-set-at-a-time pointer, completion, resume, idle, and Completion Outcome are
// all unchanged — only expansion order and rest timing change.

// A Session whose first two Prescriptions form Superset "1" (three rounds), followed
// by a solo Prescription. Members carry the group-owned round-rest (denormalized on
// each member); their own `rest_seconds` goes dormant while grouped.
const GROUPED: WorkoutSession = {
  id: 7,
  clerk_user_id: "user_1",
  training_type: "strength",
  duration_minutes: 45,
  has_been_regenerated: false,
  prescriptions: [
    {
      position: 1,
      sets: 3,
      reps: "8",
      rest_seconds: 90,
      tempo: null,
      recommended_load: { kind: "absolute", text: "60 kg", kg: 60 },
      superset_group: "1",
      round_rest_seconds: 120,
      exercise_id: 100,
      exercise_name: "Bench Press",
      exercise_description: null,
      targeted_muscles: ["chest"],
      required_equipment: ["barbell"],
      provenance: "curated",
    },
    {
      position: 2,
      sets: 3,
      reps: "10",
      rest_seconds: 60,
      tempo: null,
      recommended_load: { kind: "absolute", text: "50 kg", kg: 50 },
      superset_group: "1",
      round_rest_seconds: 120,
      exercise_id: 200,
      exercise_name: "Barbell Row",
      exercise_description: null,
      targeted_muscles: ["back"],
      required_equipment: ["barbell"],
      provenance: "curated",
    },
    {
      position: 3,
      sets: 2,
      reps: "12",
      rest_seconds: 45,
      tempo: null,
      recommended_load: null,
      superset_group: null,
      round_rest_seconds: null,
      exercise_id: 300,
      exercise_name: "Plank",
      exercise_description: null,
      targeted_muscles: ["core"],
      required_equipment: [],
      provenance: "curated",
    },
  ],
};

// Complete the set at `index` with placeholder values (order-independent helper).
function complete(state: LiveSessionState, index: number): LiveSessionState {
  return liveSessionReducer(state, {
    type: "COMPLETE_SET",
    index,
    reps: 8,
    loadKind: "absolute",
    loadValue: "60",
    rpe: 7,
  });
}

test("initLiveSession interleaves a Superset round-major, one set of each member per round", () => {
  // Arrange / Act
  const state = initLiveSession(GROUPED);

  // Assert — the Superset expands A1,B1,A2,B2,A3,B3 (round-major), then the solo
  // Plank's two sets follow. Never module-major (all of A, then all of B).
  assert.deepEqual(
    state.sets.map((s) => s.exerciseName),
    [
      "Bench Press",
      "Barbell Row",
      "Bench Press",
      "Barbell Row",
      "Bench Press",
      "Barbell Row",
      "Plank",
      "Plank",
    ],
  );
  // Each member's own set ordinals still count 1..N within the member (the round).
  assert.deepEqual(
    state.sets.map((s) => s.setNumber),
    [1, 1, 2, 2, 3, 3, 1, 2],
  );
});

test("rest fires only after the last member of each round, never between members", () => {
  // Arrange / Act
  const state = initLiveSession(GROUPED);

  // Assert — within a round the first member (Bench) rests_after=false (straight to
  // the co-member); the last member (Row) rests_after=true at the round boundary.
  // The solo Plank rests after each of its sets.
  assert.deepEqual(
    state.sets.map((s) => s.restsAfter),
    [false, true, false, true, false, true, true, true],
  );
});

test("a round-boundary rest uses the Superset's round-rest; solo sets use their own rest", () => {
  // Arrange / Act
  const state = initLiveSession(GROUPED);

  // Assert — the round-boundary set (Row) carries the group's 120 s round-rest; the
  // co-member has none (no rest between members); the solo Plank carries its own 45 s.
  assert.deepEqual(
    state.sets.map((s) => s.restSeconds),
    [null, 120, null, 120, null, 120, 45, 45],
  );
});

test("currentUnit counts a Superset as one unit alongside the solo Prescription", () => {
  // Arrange — the Superset (Bench+Row) plus the solo Plank is two units, not three
  let state = liveSessionReducer(initLiveSession(GROUPED), { type: "START" });
  assert.deepEqual(currentUnit(state), { index: 1, total: 2 });

  // Act — work all the way through the Superset's six interleaved sets
  for (const index of [0, 1, 2, 3, 4, 5]) state = complete(state, index);

  // Assert — the pointer is now on unit 2 (the solo Plank), still out of two units
  assert.deepEqual(currentUnit(state), { index: 2, total: 2 });
});

test("currentSuperset reports the round badge for a grouped set, null for a solo set", () => {
  // Arrange — pointer on the first Superset set (Bench, round 1 of 3)
  let state = liveSessionReducer(initLiveSession(GROUPED), { type: "START" });
  assert.deepEqual(currentSuperset(state), {
    label: "A",
    round: 1,
    totalRounds: 3,
  });

  // Act — advance one round (Bench+Row of round 1) so the pointer sits on round 2
  state = complete(state, 0);
  state = complete(state, 1);
  assert.deepEqual(currentSuperset(state), {
    label: "A",
    round: 2,
    totalRounds: 3,
  });

  // Act — finish the whole Superset; the pointer moves onto the solo Plank
  for (const index of [2, 3, 4, 5]) state = complete(state, index);

  // Assert — a solo Prescription has no round badge
  assert.equal(currentSuperset(state), null);
});

test("nextExercise previews the co-member while on a Superset member", () => {
  // Arrange — on Bench (round 1), the very next set is the co-member Barbell Row
  const state = liveSessionReducer(initLiveSession(GROUPED), { type: "START" });

  // Act / Assert — the preview naturally surfaces the co-member (no special-casing)
  assert.equal(nextExercise(state), "Barbell Row");
});

test("restCue names the on-deck member at a round boundary, not the exercise after it", () => {
  // Arrange — complete Bench(A round 1) then Barbell Row(B round 1): the round-1
  // boundary, where the round-rest fires. The pointer has advanced to Bench round 2 —
  // what the user will perform when the rest ends.
  let state = liveSessionReducer(initLiveSession(GROUPED), { type: "START" });
  state = complete(state, 0);
  state = complete(state, 1);

  // Act / Assert — the rest cue honestly names the on-deck member (Bench, round 2/3)
  // with its Superset label, NOT the co-member the forward look-ahead surfaces.
  assert.deepEqual(restCue(state), {
    exerciseName: "Bench Press",
    setNumber: 2,
    setCount: 3,
    supersetLabel: "A",
  });
  // The two "next"s diverge here: the look-ahead names the exercise *after* the
  // on-deck one, which is exactly why the rest card must read the on-deck set.
  assert.equal(nextExercise(state), "Barbell Row");
});

test("restCue drops the round badge once the pointer reaches the solo Prescription", () => {
  // Arrange — work through the whole Superset and the first solo Plank set; the
  // pointer now sits on Plank set 2 of 2.
  let state = liveSessionReducer(initLiveSession(GROUPED), { type: "START" });
  for (const index of [0, 1, 2, 3, 4, 5, 6]) state = complete(state, index);

  // Act / Assert — a solo on-deck set shows a set indicator and no Superset label
  assert.deepEqual(restCue(state), {
    exerciseName: "Plank",
    setNumber: 2,
    setCount: 2,
    supersetLabel: null,
  });
});

test("previous-performance stays aligned per member by set ordinal despite interleaving", () => {
  // Arrange — each Superset member has its own logged history; round-major order
  // must still key each set to its member's ordinal, not the flat position.
  const session: WorkoutSession = {
    ...GROUPED,
    prescriptions: [
      {
        ...GROUPED.prescriptions[0],
        previous_performance: [
          { reps: 6, load: { kind: "absolute", text: "55 kg", kg: 55 } },
          { reps: 6, load: { kind: "absolute", text: "57.5 kg", kg: 57.5 } },
          { reps: 5, load: { kind: "absolute", text: "60 kg", kg: 60 } },
        ],
      },
      {
        ...GROUPED.prescriptions[1],
        previous_performance: [
          { reps: 10, load: { kind: "absolute", text: "45 kg", kg: 45 } },
          { reps: 9, load: { kind: "absolute", text: "47.5 kg", kg: 47.5 } },
        ],
      },
      GROUPED.prescriptions[2],
    ],
  };

  // Act
  const state = initLiveSession(session);

  // Assert — Bench round 1 (idx 0) → Bench's 1st logged set; Row round 1 (idx 1) →
  // Row's 1st; Bench round 3 (idx 4) → Bench's 3rd; Row round 3 (idx 5) → Row has
  // only two logged sets, so none at ordinal 3.
  assert.deepEqual(state.sets[0].previous, { reps: 6, loadText: "55 kg" });
  assert.deepEqual(state.sets[1].previous, { reps: 10, loadText: "45 kg" });
  assert.deepEqual(state.sets[4].previous, { reps: 5, loadText: "60 kg" });
  assert.equal(state.sets[5].previous, null);
});

test("Completion Outcome is unchanged for a grouped Session — Completed when every set is attempted", () => {
  // Arrange — attempt all eight expanded sets (six Superset + two solo)
  let state = liveSessionReducer(initLiveSession(GROUPED), { type: "START" });
  assert.equal(progressPercent(state), 0);
  for (let index = 0; index < 8; index += 1) state = complete(state, index);

  // Assert — grouping changes order/rest, not what counts as attempted (ADR-0023)
  assert.equal(progressPercent(state), 100);
  assert.equal(completionOutcome(state), "completed");
});

test("Completion Outcome is Incomplete when a grouped set is left un-attempted", () => {
  // Arrange — skip the first Superset set (ADVANCE), attempt the rest
  let state = liveSessionReducer(initLiveSession(GROUPED), { type: "START" });
  state = liveSessionReducer(state, { type: "ADVANCE" }); // skip Bench round 1
  for (let index = 1; index < 8; index += 1) state = complete(state, index);

  // Assert — one prescribed set un-attempted → Incomplete, exactly as for a flat Session
  assert.equal(completionOutcome(state), "incomplete");
});

test("the live hydration read shape (Superset overlay + previous_performance) groups into one Superset unit", () => {
  // Arrange — the payload the server's live hydration read now emits: each grouped
  // Prescription carries BOTH the Superset overlay (`superset_group`/`round_rest_seconds`)
  // and its own `previous_performance`. The bug was the server dropping the overlay from
  // this read, so the engine saw only solo movements the moment the user Started.
  const hydrated: WorkoutSession = {
    ...GROUPED,
    prescriptions: GROUPED.prescriptions.map((p) => ({
      ...p,
      previous_performance: [],
    })),
  };

  // Act
  const units = groupUnits(initLiveSession(hydrated));

  // Assert — Bench+Row collapse into ONE Superset unit (label A), then the solo Plank:
  // two units, never three. Dropping the overlay would have split the pair into solos.
  assert.deepEqual(
    units.map((u) => ({ label: u.supersetLabel, names: u.exerciseNames })),
    [
      { label: "A", names: ["Bench Press", "Barbell Row"] },
      { label: null, names: ["Plank"] },
    ],
  );
});

test("a mid-performance grouped Session round-trips through the localStorage slot unchanged", () => {
  // Arrange — a grouped Session with two interleaved sets completed
  const map = new Map<string, string>();
  const storage: SlotStorage = {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
  let state = liveSessionReducer(initLiveSession(GROUPED), {
    type: "START",
    now: 1_000_000,
  });
  state = liveSessionReducer(state, {
    type: "COMPLETE_SET",
    index: 0,
    reps: 8,
    loadKind: "absolute",
    loadValue: "62.5",
    rpe: 7,
    now: 1_030_000,
  });

  // Act — persist and restore (the resume path — ADR-0012)
  saveLiveSession(storage, state);

  // Assert — the exact grouped state comes back (set table incl. Superset overlay,
  // pointer, timestamps), so resume behaves identically to a flat Session
  assert.deepEqual(loadLiveSession(storage), state);
});
