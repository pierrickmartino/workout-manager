import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MAIN_WORK_LIMIT,
  SECTION_ORDER,
  type Sectionable,
  sectionBands,
  sectionize,
} from "./session-section.ts";

// `session-section` is the Session Section read-time projection (GLOSSARY: Session Section;
// ADR-0074) — the frontend twin of `app/domain/session_section.py`, buckets each Exercise
// Prescription in a Session into warm-up / main work / accessory / cooldown from signals on
// the plan (the warm-up Set Type, name keywords, position). The Builder re-derives sections
// from its client-side draft as it is edited. These tests mirror the Python domain cases so
// the two classifiers can't drift. AAA structure, behavior-describing names.

function ex(exerciseName: string, extra: Partial<Sectionable> = {}): Sectionable {
  return { exerciseName, setType: null, ...extra };
}

test("an empty session has no sections", () => {
  assert.deepEqual(sectionize([]), []);
});

test("an explicit warm-up Set Type reads as warm-up", () => {
  // Arrange
  const items = [ex("Back Squat", { setType: "warm_up" }), ex("Back Squat")];

  // Act
  const result = sectionize(items);

  // Assert
  assert.deepEqual(result, ["warm_up", "main"]);
});

test("a leading mobility and cardio run reads as warm-up", () => {
  // Arrange
  const items = [ex("World's Greatest Stretch"), ex("Assault Bike"), ex("Back Squat")];

  // Act
  const result = sectionize(items);

  // Assert
  assert.deepEqual(result, ["warm_up", "warm_up", "main"]);
});

test("a trailing stretch and breathing run reads as cooldown", () => {
  // Arrange
  const items = [ex("Back Squat"), ex("Pigeon Stretch"), ex("Box Breathing")];

  // Act
  const result = sectionize(items);

  // Assert
  assert.deepEqual(result, ["main", "cooldown", "cooldown"]);
});

test("only the first compound movements are main work, the rest accessory", () => {
  // Arrange — four compounds; only MAIN_WORK_LIMIT read as main.
  const items = [
    ex("Back Squat"),
    ex("Bench Press"),
    ex("Romanian Deadlift"),
    ex("Overhead Press"),
  ];

  // Act
  const result = sectionize(items);

  // Assert
  assert.deepEqual(result.slice(0, MAIN_WORK_LIMIT), Array(MAIN_WORK_LIMIT).fill("main"));
  assert.deepEqual(result.slice(MAIN_WORK_LIMIT), ["accessory"]);
});

test("an isolation movement is accessory even when it leads", () => {
  // Arrange
  const items = [ex("Bicep Curl"), ex("Back Squat"), ex("Bench Press")];

  // Act
  const result = sectionize(items);

  // Assert
  assert.deepEqual(result, ["accessory", "main", "main"]);
});

test("the classic three-lift day is all main work", () => {
  // Arrange
  const items = [ex("Back Squat"), ex("Bench Press"), ex("Deadlift")];

  // Act
  const result = sectionize(items);

  // Assert
  assert.deepEqual(result, ["main", "main", "main"]);
});

test("a full composition sections in order across every band", () => {
  // Arrange
  const items = [
    ex("Jumping Jacks"),
    ex("World's Greatest Stretch"),
    ex("Back Squat"),
    ex("Bench Press"),
    ex("Romanian Deadlift"),
    ex("Dumbbell Bench Press"),
    ex("Chest-Supported Row"),
    ex("Face Pull"),
    ex("Plank"),
    ex("Pigeon Stretch"),
  ];

  // Act
  const result = sectionize(items);

  // Assert
  assert.deepEqual(result, [
    "warm_up",
    "warm_up",
    "main",
    "main",
    "main",
    "accessory",
    "accessory",
    "accessory",
    "accessory",
    "cooldown",
  ]);
});

test("a mid-session stretch is not split off as a cooldown", () => {
  // Arrange — only a trailing mobility run is cooldown.
  const items = [ex("Back Squat"), ex("Hamstring Stretch"), ex("Bench Press")];

  // Act
  const result = sectionize(items);

  // Assert
  assert.equal(result[0], "main");
  assert.equal(result[2], "main");
  assert.notEqual(result[1], "cooldown");
});

test("section keys and order are the stable wire tokens", () => {
  assert.deepEqual(SECTION_ORDER, ["warm_up", "main", "accessory", "cooldown"]);
});

test("sectionBands groups contiguous sections and preserves positions", () => {
  // Arrange
  const items = [
    ex("World's Greatest Stretch"),
    ex("Back Squat"),
    ex("Bicep Curl"),
    ex("Pigeon Stretch"),
  ];

  // Act
  const bands = sectionBands(items);

  // Assert — one band per contiguous section, carrying original positions.
  assert.deepEqual(
    bands.map((band) => band.section),
    ["warm_up", "main", "accessory", "cooldown"],
  );
  assert.deepEqual(
    bands.map((band) => band.positions),
    [[0], [1], [2], [3]],
  );
});

test("a Superset takes one section for all its members", () => {
  // Arrange — a Superset is one block (ADR-0023): the unclaimed core hold rides with its
  // compound partners instead of splitting off to accessory.
  const items = [
    ex("Pull-up", { supersetGroup: "A" }),
    ex("Push-up", { supersetGroup: "A" }),
    ex("Hollow Body Hold", { supersetGroup: "A" }),
  ];

  // Act
  const result = sectionize(items);

  // Assert
  assert.deepEqual(result, ["main", "main", "main"]);
});

test("a Superset counts as one main-work slot", () => {
  // Arrange
  const items = [
    ex("Back Squat"),
    ex("Pull-up", { supersetGroup: "A" }),
    ex("Push-up", { supersetGroup: "A" }),
    ex("Hollow Body Hold", { supersetGroup: "A" }),
    ex("Romanian Deadlift"),
    ex("Bench Press"),
  ];

  // Act
  const result = sectionize(items);

  // Assert — squat, the Superset, and RDL fill the cap; bench is past it.
  assert.deepEqual(result, ["main", "main", "main", "main", "main", "accessory"]);
});

test("a Superset with no compound member is accessory", () => {
  // Arrange
  const items = [
    ex("Back Squat"),
    ex("Bicep Curl", { supersetGroup: "A" }),
    ex("Triceps Pushdown", { supersetGroup: "A" }),
  ];

  // Act
  const result = sectionize(items);

  // Assert
  assert.deepEqual(result, ["main", "accessory", "accessory"]);
});

test("a Superset past the main-work cap is accessory as a whole", () => {
  // Arrange
  const items = [
    ex("Back Squat"),
    ex("Bench Press"),
    ex("Romanian Deadlift"),
    ex("Pull-up", { supersetGroup: "A" }),
    ex("Hollow Body Hold", { supersetGroup: "A" }),
  ];

  // Act
  const result = sectionize(items);

  // Assert
  assert.deepEqual(result.slice(3), ["accessory", "accessory"]);
});

test("a Superset straddling the warm-up takes its working section", () => {
  // Arrange — a leading prep drill paired with a working lift: the work wins.
  const items = [
    ex("Arm Circles", { supersetGroup: "A" }),
    ex("Push-up", { supersetGroup: "A" }),
    ex("Bench Press"),
  ];

  // Act
  const result = sectionize(items);

  // Assert
  assert.deepEqual(result, ["main", "main", "main"]);
});

test("an all-prep Superset stays warm-up", () => {
  // Arrange
  const items = [
    ex("Arm Circles", { supersetGroup: "A" }),
    ex("Leg Swings", { supersetGroup: "A" }),
    ex("Back Squat"),
  ];

  // Act
  const result = sectionize(items);

  // Assert
  assert.deepEqual(result, ["warm_up", "warm_up", "main"]);
});

test("core movements with a compound stem read as accessory", () => {
  // Arrange — "Pallof Press" contains "press" but is anti-rotation core work.
  const items = [ex("Pallof Press"), ex("Hollow Body Hold"), ex("Plank")];

  // Act
  const result = sectionize(items);

  // Assert
  assert.deepEqual(result, ["accessory", "accessory", "accessory"]);
});

test("sectionBands keeps a Superset whole inside one band", () => {
  // Arrange
  const items = [
    ex("Pull-up", { supersetGroup: "A" }),
    ex("Push-up", { supersetGroup: "A" }),
    ex("Hollow Body Hold", { supersetGroup: "A" }),
    ex("Bicep Curl"),
  ];

  // Act
  const bands = sectionBands(items);

  // Assert
  assert.deepEqual(
    bands.map((band) => [band.section, band.positions]),
    [
      ["main", [0, 1, 2]],
      ["accessory", [3]],
    ],
  );
});
