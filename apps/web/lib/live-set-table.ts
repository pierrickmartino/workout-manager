// The Live Session set table (ADR-0114): one card per unit, one row per set, read off the
// unit the screen already groups (`groupUnits`, ADR-0023). Pure — no React, no I/O — so the
// card in `components/live-session-sets.tsx` only lays out what this module decides.
//
// The production card used to spend a whole card per *set*: a caption and a 44px control for
// each of reps, effort, Load kind and Load value, its prescription and previous performance on
// two lines, and its own buttons — a four-set exercise was ~1,300px at 390px. The table keeps
// every one of those facts and moves the ones that do not vary per set up to the unit:
//
// - the **prescription and last time** read once per member, not once per set;
// - the **Load kind** is asked once per member and applies to that member's sets still to do
//   (an exercise is not switched from dumbbells to a cable between its sets), while the Load
//   *value* stays a field on every row — for bodyweight it is the added load;
// - a **Superset** names its members with the gym's own A1 / A2 notation and groups its rows
//   by round, which is the order they are performed in.

import type { LiveSet, LiveUnit, PreviousReference } from "./live-session.ts";
import { NO_LOAD } from "./load.ts";

// One Exercise of a unit: the solo Prescription, or one member of a Superset.
export interface SetTableMember {
  // Identifies the member across its sets — the Prescription's position, not its name, so two
  // members that happen to share an Exercise are still two members.
  modulePosition: number;
  name: string;
  // "A1", "A2"… inside a Superset; null for a solo exercise, whose rows are tagged by set number.
  tag: string | null;
  // "4 × 5 · BW" — the plan, as compactly as a set row reads.
  prescriptionText: string;
  // "last 3 × 12 · 10 kg", or each set in turn when they differed; null with no history.
  lastText: string | null;
  // This member's sets still to do, by absolute index: what a Load kind pick applies to. The
  // first one is also whose kind the picker shows. Empty once the member is done.
  pendingIndexes: number[];
  // Every one of this member's sets, by absolute index — the picker's fallback when none is
  // pending, so a done member still shows the kind it was performed with.
  indexes: number[];
}

export interface SetTableRow {
  set: LiveSet;
  index: number;
  // The row's own tag: the set number for a solo exercise; the member tag in a Superset, whose
  // round is the heading above it.
  tag: string;
  isCurrent: boolean;
  isCompleted: boolean;
  // "Ring dip, set 2" — what every control in the row is named for, so a screen of identical
  // rows never offers an ambiguous bare "Reps".
  subject: string;
}

export interface SetTableRound {
  // 1-based round of a Superset, or null for a solo exercise (one group, no heading).
  round: number | null;
  rows: SetTableRow[];
}

export interface SetTableSkip {
  index: number;
  // "Skip set 2", or "Skip A2 · round 1" inside a Superset.
  text: string;
  // "Skip Ring dip, set 1" — names the exercise, which the visible text leaves to the tag.
  ariaLabel: string;
}

export interface SetTableView {
  supersetLabel: string | null;
  // The solo exercise's name, or "Superset A · 3 rounds".
  title: string;
  members: SetTableMember[];
  rounds: SetTableRound[];
  roundCount: number;
  done: number;
  total: number;
  holdsCurrent: boolean;
  // Skip is the current set's action only: it advances the pointer (ADR-0013), which no other
  // row holds. Any pending row can still be completed out of order.
  skip: SetTableSkip | null;
}

// "bodyweight" reads "BW", "bodyweight + 10 kg" reads "BW +10 kg" — the same Load, in the
// room a table row has.
export function shortLoadText(text: string): string {
  return text.replace(/^bodyweight/i, "BW").replace(" + ", " +");
}

// Last time, as compactly as the prescription reads: "3 × 12 · 10 kg" when every set matched,
// else each set in turn ("5×BW, 5×BW, 4×BW"). Null with no history.
export function lastTimeText(previous: readonly PreviousReference[]): string | null {
  if (previous.length === 0) return null;
  const [first] = previous;
  const same = previous.every((p) => p.reps === first.reps && p.loadText === first.loadText);
  return same
    ? `${previous.length} × ${first.reps} · ${shortLoadText(first.loadText)}`
    : previous.map((p) => `${p.reps}×${shortLoadText(p.loadText)}`).join(", ");
}

// "4 × 5 · BW". A Prescription with no Load reads as its sets and reps alone, rather than
// trailing the em dash that stands for "none" elsewhere.
function prescriptionText(set: LiveSet): string {
  const sets = `${set.moduleSetCount} × ${set.prescribedReps}`;
  return set.prescribedLoadText === NO_LOAD ? sets : `${sets} · ${shortLoadText(set.prescribedLoadText)}`;
}

function membersOf(unit: LiveUnit): SetTableMember[] {
  const positions: number[] = [];
  for (const { set } of unit.sets) {
    if (!positions.includes(set.modulePosition)) positions.push(set.modulePosition);
  }
  return positions.map((modulePosition, i) => {
    const sets = unit.sets.filter(({ set }) => set.modulePosition === modulePosition);
    const first = sets[0].set;
    const previous = sets.flatMap(({ set }) => (set.previous ? [set.previous] : []));
    const last = lastTimeText(previous);
    return {
      modulePosition,
      name: first.exerciseName,
      tag: unit.supersetLabel ? `${unit.supersetLabel}${i + 1}` : null,
      prescriptionText: prescriptionText(first),
      lastText: last === null ? null : `last ${last}`,
      pendingIndexes: sets.filter(({ set }) => set.status !== "completed").map(({ index }) => index),
      indexes: sets.map(({ index }) => index),
    };
  });
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function setTableView(unit: LiveUnit, currentIndex: number): SetTableView {
  const members = membersOf(unit);
  const tagOf = new Map(members.map((member) => [member.modulePosition, member.tag]));

  const rows: SetTableRow[] = unit.sets.map(({ set, index }) => ({
    set,
    index,
    tag: tagOf.get(set.modulePosition) ?? String(set.setNumber),
    isCurrent: index === currentIndex,
    isCompleted: set.status === "completed",
    subject: `${set.exerciseName}, set ${set.setNumber}`,
  }));

  // A Superset's sets already arrive round-major (A1, A2, A1, A2…), so grouping by the round
  // number keeps performed order inside each round.
  const rounds: SetTableRound[] = [];
  if (unit.supersetLabel === null) {
    rounds.push({ round: null, rows });
  } else {
    for (const row of rows) {
      const existing = rounds.find((group) => group.round === row.set.setNumber);
      if (existing) existing.rows.push(row);
      else rounds.push({ round: row.set.setNumber, rows: [row] });
    }
  }
  const roundCount = unit.supersetLabel === null ? 0 : rounds.length;

  const current = rows.find((row) => row.isCurrent && !row.isCompleted);
  const skip: SetTableSkip | null = current
    ? {
        index: current.index,
        text:
          unit.supersetLabel === null
            ? `Skip set ${current.set.setNumber}`
            : `Skip ${current.tag} · round ${current.set.setNumber}`,
        ariaLabel: `Skip ${current.subject}`,
      }
    : null;

  return {
    supersetLabel: unit.supersetLabel,
    title:
      unit.supersetLabel === null
        ? unit.exerciseNames[0]
        : `Superset ${unit.supersetLabel} · ${pluralize(roundCount, "round")}`,
    members,
    rounds,
    roundCount,
    done: rows.filter((row) => row.isCompleted).length,
    total: rows.length,
    holdsCurrent: rows.some((row) => row.isCurrent),
    skip,
  };
}
