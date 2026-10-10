// What the History page hands its client component, before and after windowing (ADR-0128):
// the props serialized into the RSC payload, for a seeded 300-session history (two years at
// three sessions a week, 15 sets each). Run: `node audit/history-payload.mjs`.
//
// This measures the serialized props, which are what grew with the record. It is not a live
// RSC capture: that needs a signed-in browser against a seeded backend. The flight encoding
// adds a little framing on top, and the same amount on both sides.

import { gzipSync } from "node:zlib";

import { HISTORY_WINDOW, toHistoryCard } from "../lib/history-window.ts";

const SESSIONS = 300;
const SETS_PER_SESSION = 15;
const EXERCISES = ["Back Squat", "Bench Press", "Deadlift", "Overhead Press", "Barbell Row", "Pull-Up", "Romanian Deadlift", "Lunge"];

function loggedSet(session, position) {
  const exerciseIndex = (session + Math.floor((position - 1) / 3)) % EXERCISES.length;
  return {
    position,
    quantity: { kind: "repetitions", count: 8, text: "8" },
    load: { kind: "absolute", text: "82.5 kg", kg: 82.5 },
    perceived_difficulty: 8,
    effort: { scale: "rpe", value: 8 },
    set_type: position === 1 ? "warmup" : null,
    note: null,
    exercise_id: exerciseIndex + 1,
    exercise_name: EXERCISES[exerciseIndex],
    body_weight_kg: 78.4,
  };
}

function day(offset) {
  return new Date(Date.UTC(2026, 9, 10) - offset * 2.4 * 86_400_000).toISOString().slice(0, 10);
}

const history = Array.from({ length: SESSIONS }, (_, i) => ({
  id: SESSIONS - i,
  clerk_user_id: "user_2abcdefghijklmnopqrstuvwxyz",
  session_id: 1000 + (i % 24),
  training_type: "strength",
  performed_on: day(i),
  completion_outcome: "completed",
  duration_seconds: 3600,
  logged_sets: Array.from({ length: SETS_PER_SESSION }, (_, s) => loggedSet(i, s + 1)),
  deletable: i === 0,
  uncompletable: i === 0,
}));

const index = history.map((record) => ({
  id: record.id,
  performed_on: record.performed_on,
  training_type: record.training_type,
  exercise_names: [...new Set(record.logged_sets.map((set) => set.exercise_name))],
  deletable: record.deletable,
  uncompletable: record.uncompletable,
}));

function size(props) {
  const json = JSON.stringify(props);
  return { bytes: Buffer.byteLength(json), gzip: gzipSync(json, { level: 9 }).length };
}

const before = size({ records: history, unit: "kg" });
const after = size({
  index,
  firstWindow: history.slice(0, HISTORY_WINDOW).map(toHistoryCard),
  unit: "kg",
});

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(`History props, ${SESSIONS} sessions × ${SETS_PER_SESSION} sets`);
console.log(`  before (every full record):        ${kb(before.bytes)} raw, ${kb(before.gzip)} gz`);
console.log(`  after  (index + first ${HISTORY_WINDOW} cards): ${kb(after.bytes)} raw, ${kb(after.gzip)} gz`);
console.log(`  cards rendered on first load:      ${SESSIONS} → ${HISTORY_WINDOW}`);
