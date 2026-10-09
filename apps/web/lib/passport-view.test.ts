import { test } from "node:test";
import assert from "node:assert/strict";

import { stampBackLink, toPassport, toStampDetail } from "./passport-view.ts";
import type { Achievement, AchievementRecord } from "./profile-progress-types.ts";

// `toPassport` turns the API's evaluated Achievements (curated catalog order) into the
// Training Passport: the earned Stamps oldest first, one next milestone, and the rest of the
// locked Achievements behind "More to earn". Ordering and the milestone choice are
// presentation, so they live here and the API keeps catalog order.

function earned(id: string, on: string, bySessionId: number | null = 1): Achievement {
  return {
    id,
    name: `Name of ${id}`,
    criteria: `Criteria of ${id}`,
    unlocked: true,
    current: 1,
    target: 1,
    unlocked_on: on,
    unlocked_by_session_id: bySessionId,
  };
}

function locked(id: string, current: number, target: number): Achievement {
  return {
    id,
    name: `Name of ${id}`,
    criteria: `Criteria of ${id}`,
    unlocked: false,
    current,
    target,
    unlocked_on: null,
    unlocked_by_session_id: null,
  };
}

test("orders earned Stamps oldest first, breaking a same-day tie by catalog order", () => {
  // Arrange — catalog order is a, b, c, d; b and d were earned on the same day
  const achievements = [
    earned("a", "2026-03-10"),
    earned("b", "2025-11-02"),
    earned("c", "2024-12-31"),
    earned("d", "2025-11-02"),
  ];

  // Act
  const passport = toPassport(achievements);

  // Assert
  assert.deepEqual(
    passport.stamps.map((stamp) => stamp.id),
    ["c", "b", "d", "a"],
  );
});

test("labels each Stamp with its earned date including the year", () => {
  // Arrange — two Stamps earned in different years on the same month and day
  const achievements = [earned("a", "2025-07-04"), earned("b", "2026-07-04")];

  // Act
  const passport = toPassport(achievements);

  // Assert — the year keeps a multi-year collection unambiguous
  assert.deepEqual(
    passport.stamps.map((stamp) => stamp.earnedOn),
    ["Jul 4, 2025", "Jul 4, 2026"],
  );
});

test("picks the locked Achievement proportionally closest to earned as the next milestone", () => {
  // Arrange — 18/25 (0.72) beats 3/5 (0.6) and 2/12 even though it needs more Sessions
  const achievements = [
    earned("sessions-5", "2026-01-02"),
    locked("streak-12", 2, 12),
    locked("sessions-25", 18, 25),
    locked("muscle-all", 3, 5),
  ];

  // Act
  const passport = toPassport(achievements);

  // Assert
  assert.equal(passport.next?.id, "sessions-25");
});

test("breaks a next-milestone ratio tie by catalog order", () => {
  // Arrange — 2/4 and 3/6 are both half-way; "b" comes first in the catalog
  const achievements = [locked("a", 1, 4), locked("b", 2, 4), locked("c", 3, 6)];

  // Act
  const passport = toPassport(achievements);

  // Assert
  assert.equal(passport.next?.id, "b");
});

test("shows no next milestone once every Achievement is earned", () => {
  // Arrange
  const achievements = [earned("a", "2026-01-02"), earned("b", "2026-02-03")];

  // Act
  const passport = toPassport(achievements);

  // Assert
  assert.equal(passport.next, null);
});

test("puts every other locked Achievement under More to earn, in catalog order", () => {
  // Arrange — four locked; "c" is closest, so it is the next milestone and not repeated
  const achievements = [
    locked("a", 0, 5),
    earned("b", "2026-01-02"),
    locked("c", 4, 5),
    locked("d", 1, 12),
    locked("e", 0, 1),
  ];

  // Act
  const passport = toPassport(achievements);

  // Assert
  assert.deepEqual(
    passport.moreToEarn.map((milestone) => milestone.id),
    ["a", "d", "e"],
  );
  assert.equal(passport.moreToEarn.length, 3);
});

test("states each locked Achievement's criteria and its current/target progress", () => {
  // Arrange
  const achievements = [locked("sessions-25", 18, 25), locked("sessions-100", 18, 100)];

  // Act
  const passport = toPassport(achievements);

  // Assert — the closer one leads; the other sits under More to earn with its criteria
  assert.equal(passport.next?.progress, "18/25");
  assert.equal(passport.next?.fill, 18 / 25);
  const [more] = passport.moreToEarn;
  assert.equal(more.criteria, "Criteria of sessions-100");
  assert.equal(more.progress, "18/100");
});

test("words streak progress as the best run of consecutive weeks", () => {
  // Arrange — the streak metric is the longest run of consecutive weeks (ADR-0019), so the
  // copy must never read as a current streak that rest could break
  const achievements = [locked("streak-4", 2, 4), locked("streak-12", 2, 12)];

  // Act
  const passport = toPassport(achievements);

  // Assert
  assert.equal(passport.next?.progress, "Best run 2/4 consecutive weeks");
  assert.equal(passport.moreToEarn[0].progress, "Best run 2/12 consecutive weeks");
});

test("guards against a zero target instead of dividing by zero", () => {
  // Arrange — a defensive case: a target of 0 must not yield NaN or win the milestone
  const achievements = [locked("a", 0, 0), locked("b", 1, 5)];

  // Act
  const passport = toPassport(achievements);

  // Assert
  assert.equal(passport.next?.id, "b");
  assert.equal(passport.moreToEarn[0].fill, 0);
});

// The catalog as a brand-new user receives it: the First Session leads, and nothing is earned
// (#651). Real ids and targets, so the empty state is read off the shape the API sends.
const NEW_USER_CATALOG: readonly Achievement[] = [
  locked("sessions-1", 0, 1),
  locked("sessions-5", 0, 5),
  locked("streak-4", 0, 4),
  locked("muscle-all", 0, 6),
  locked("first-pr", 0, 1),
];

test("reads as an empty Passport when nothing is earned", () => {
  // Arrange — a brand-new user's catalog: every Achievement locked at 0 (above)

  // Act
  const passport = toPassport(NEW_USER_CATALOG);

  // Assert — an empty collection, not a page of locks
  assert.equal(passport.empty, true);
  assert.deepEqual(passport.stamps, []);
});

test("offers the First Session at 0/1 as the next milestone of an empty Passport", () => {
  // Arrange — a brand-new user's catalog: every Achievement locked at 0 (above)

  // Act — every ratio is 0, so the catalog-order tie-break picks the First Session
  const passport = toPassport(NEW_USER_CATALOG);

  // Assert
  assert.equal(passport.next?.id, "sessions-1");
  assert.equal(passport.next?.progress, "0/1");
  assert.equal(passport.next?.fill, 0);
});

test("earns the First Session Stamp, dated on the first Logged Session", () => {
  // Arrange — one Logged Session on Jun 2, 2026
  const achievements = [
    { ...earned("sessions-1", "2026-06-02"), name: "First Session" },
    locked("sessions-5", 1, 5),
    locked("streak-4", 1, 4),
  ];

  // Act
  const passport = toPassport(achievements);

  // Assert — no longer empty, and the first Stamp carries its date with the year
  assert.equal(passport.empty, false);
  assert.deepEqual(passport.stamps, [
    {
      id: "sessions-1",
      name: "First Session",
      earnedOn: "Jun 2, 2026",
      href: "/profile/achievements/sessions-1",
    },
  ]);
});

// --- the Stamp page (#652) ---

test("links every Stamp, the next milestone and each More to earn entry to its own page", () => {
  // Arrange
  const achievements = [
    earned("sessions-1", "2026-01-02"),
    locked("sessions-5", 3, 5),
    locked("streak-12", 1, 12),
  ];

  // Act
  const passport = toPassport(achievements);

  // Assert — each page is keyed by the Achievement id under the Achievements route
  assert.equal(passport.stamps[0].href, "/profile/achievements/sessions-1");
  assert.equal(passport.next?.href, "/profile/achievements/sessions-5");
  assert.equal(passport.moreToEarn[0].href, "/profile/achievements/streak-12");
});

test("reads no Stamp page for an id the catalog does not hold", () => {
  // Arrange
  const achievements = [earned("sessions-1", "2026-01-02")];

  // Act
  const detail = toStampDetail(achievements, "sessions-9000", "kg");

  // Assert — the page renders not-found
  assert.equal(detail, null);
});

test("dates an earned Stamp's page with the year and links its crossing Logged Session", () => {
  // Arrange — Logged Session 42 crossed the target
  const achievements = [{ ...earned("sessions-5", "2025-11-14", 42), target: 5 }];

  // Act
  const detail = toStampDetail(achievements, "sessions-5", "kg");

  // Assert — the source link opens that record's detail page in History
  assert.equal(detail?.status, "earned");
  assert.equal(detail?.name, "Name of sessions-5");
  assert.equal(detail?.status === "earned" && detail.earnedOn, "Nov 14, 2025");
  assert.equal(detail?.status === "earned" && detail.sourceHref, "/history/42");
});

// The plain-words explanation of what earned a Stamp, one family at a time. Targets are the
// catalog's own, so the copy is read off the shape the API sends.
const EXPLANATIONS: readonly [Achievement, string][] = [
  [
    { ...earned("sessions-1", "2026-01-02"), target: 1 },
    "This was your first logged session.",
  ],
  [
    { ...earned("sessions-25", "2026-01-02"), target: 25 },
    "This was your 25th logged session.",
  ],
  [
    { ...earned("streak-4", "2026-01-02"), target: 4 },
    "Your 4th consecutive week of training was completed with this session.",
  ],
  [
    { ...earned("streak-12", "2026-01-02"), target: 12 },
    "Your 12th consecutive week of training was completed with this session.",
  ],
  [
    { ...earned("muscle-all", "2026-01-02"), target: 6 },
    "With this session you had trained all six muscle groups.",
  ],
  [
    earned("first-pr", "2026-01-02"),
    "This session set your first personal record.",
  ],
];

for (const [achievement, explanation] of EXPLANATIONS) {
  test(`explains what earned the ${achievement.id} Stamp in plain words`, () => {
    // Act
    const detail = toStampDetail([achievement], achievement.id, "kg");

    // Assert
    assert.equal(detail?.status === "earned" && detail.explanation, explanation);
  });
}

test("reads an ordinal past the teens with its own suffix", () => {
  // Arrange — 21st, 22nd, 23rd but 11th, 12th, 13th
  const cases: readonly [number, string][] = [
    [2, "2nd"], [3, "3rd"], [11, "11th"], [12, "12th"], [13, "13th"],
    [21, "21st"], [22, "22nd"], [23, "23rd"], [100, "100th"], [101, "101st"],
  ];

  for (const [target, ordinal] of cases) {
    // Act
    const detail = toStampDetail(
      [{ ...earned(`sessions-${target}`, "2026-01-02"), target }],
      `sessions-${target}`,
      "kg",
    );

    // Assert
    assert.equal(
      detail?.status === "earned" && detail.explanation,
      `This was your ${ordinal} logged session.`,
    );
  }
});

test("explains an Achievement of an unknown family by its criteria", () => {
  // Arrange — a catalog entry this view-model has no family copy for
  const achievement = earned("mystery", "2026-01-02");

  // Act
  const detail = toStampDetail([achievement], "mystery", "kg");

  // Assert — still a plain sentence, never a blank
  assert.equal(
    detail?.status === "earned" && detail.explanation,
    "This session met the criteria: Criteria of mystery.",
  );
});

test("offers no source link for an earned Stamp the API sent without its session", () => {
  // Arrange — a malformed row: earned, but no crossing session
  const achievements = [earned("sessions-1", "2026-01-02", null)];

  // Act
  const detail = toStampDetail(achievements, "sessions-1", "kg");

  // Assert — no link rather than a link to a missing record
  assert.equal(detail?.status === "earned" && detail.sourceHref, null);
});

test("opens a locked Achievement's page with its criteria and progress, and no source", () => {
  // Arrange
  const achievements = [locked("streak-4", 2, 4)];

  // Act
  const detail = toStampDetail(achievements, "streak-4", "kg");

  // Assert — the milestone's criteria and best-run progress; a locked page links nowhere
  assert.deepEqual(detail, {
    status: "locked",
    id: "streak-4",
    name: "Name of streak-4",
    criteria: "Criteria of streak-4",
    progress: "Best run 2/4 consecutive weeks",
    fill: 0.5,
  });
});

// --- the lift behind the First Record Stamp (#653) ---

const SQUAT_RECORD: AchievementRecord = {
  exercise_id: 1,
  exercise: "Back Squat",
  estimated_1rm: 116.6667,
  gain: 0,
  date: "2026-01-02",
  reps: 5,
  is_bodyweight: false,
  added_kg: null,
  load: { kind: "absolute", text: "100 kg", kg: 100 },
  body_weight_kg: null,
};

const WEIGHTED_PULL_UP_RECORD: AchievementRecord = {
  exercise_id: 3,
  exercise: "Pull-Up",
  estimated_1rm: 116.6667,
  gain: 0,
  date: "2026-01-02",
  reps: 5,
  is_bodyweight: true,
  added_kg: 20,
  load: { kind: "bodyweight", text: "bodyweight + 20 kg", added_kg: 20 },
  body_weight_kg: 80,
};

function firstRecord(record: AchievementRecord | null): Achievement {
  return { ...earned("first-pr", "2026-01-02"), record };
}

function liftOf(achievement: Achievement, unit: "kg" | "lb") {
  const detail = toStampDetail([achievement], achievement.id, unit);
  assert.equal(detail?.status, "earned");
  return detail?.status === "earned" ? detail.lift : undefined;
}

test("shows an absolute First Record as its Load × reps with the Estimated 1RM", () => {
  // Act
  const lift = liftOf(firstRecord(SQUAT_RECORD), "kg");

  // Assert — 100 kg × 5 estimates 116.67 kg, headlined whole like every Personal Record
  assert.deepEqual(lift, {
    exercise: "Back Squat",
    set: "100 kg × 5",
    estimatedOneRepMax: "117 kg",
    bodyWeight: null,
  });
});

test("projects an absolute First Record into the reader’s Weight Unit", () => {
  // Act
  const lift = liftOf(firstRecord(SQUAT_RECORD), "lb");

  // Assert — 100 kg is 220.46 lb; 116.67 kg is 257 lb whole
  assert.equal(lift?.set, "220.46 lb × 5");
  assert.equal(lift?.estimatedOneRepMax, "257 lb");
});

test("shows a bodyweight First Record as bodyweight + added load × reps, never a bare kg figure", () => {
  // Act
  const lift = liftOf(firstRecord(WEIGHTED_PULL_UP_RECORD), "kg");

  // Assert — no Estimated 1RM headline (ADR-0026); the Performed Body Weight stands apart
  assert.deepEqual(lift, {
    exercise: "Pull-Up",
    set: "bodyweight + 20 kg × 5",
    estimatedOneRepMax: null,
    bodyWeight: "80 kg",
  });
});

test("projects a bodyweight First Record’s added load and body weight into the reader’s unit", () => {
  // Act
  const lift = liftOf(firstRecord(WEIGHTED_PULL_UP_RECORD), "lb");

  // Assert — 20 kg is 44.09 lb, 80 kg is 176.37 lb
  assert.equal(lift?.set, "bodyweight + 44.09 lb × 5");
  assert.equal(lift?.bodyWeight, "176.37 lb");
});

test("shows a pure bodyweight First Record as bodyweight × reps, whatever its Load was typed as", () => {
  // Arrange — no added load, the Load typed as "BW", at 75 kg Performed Body Weight
  const record: AchievementRecord = {
    ...WEIGHTED_PULL_UP_RECORD,
    reps: 12,
    added_kg: null,
    load: { kind: "bodyweight", text: "BW" },
    body_weight_kg: 75,
  };

  // Act
  const lift = liftOf(firstRecord(record), "kg");

  // Assert — the same wording as every other Personal Record surface
  assert.deepEqual(lift, {
    exercise: "Pull-Up",
    set: "bodyweight × 12",
    estimatedOneRepMax: null,
    bodyWeight: "75 kg",
  });
});

test("shows no lift on a Stamp that carries no record", () => {
  // Arrange — First Record without its record, and an Achievement of another family
  const cases = [firstRecord(null), earned("first-pr", "2026-01-02"), earned("sessions-1", "2026-01-02")];

  for (const achievement of cases) {
    // Act
    const lift = liftOf(achievement, "kg");

    // Assert — nothing rather than an empty or invented lift
    assert.equal(lift, null);
  }
});

// --- where a Stamp page's back link returns to ---

test("links the Profile summary's Stamps with the Profile as their origin", () => {
  // Arrange
  const achievements = [
    earned("sessions-1", "2026-01-02"),
    locked("sessions-5", 3, 5),
    locked("streak-12", 1, 12),
  ];

  // Act
  const passport = toPassport(achievements, "profile");

  // Assert — the Stamp page then knows to send the user back to the Profile
  assert.equal(passport.stamps[0].href, "/profile/achievements/sessions-1?from=profile");
  assert.equal(passport.next?.href, "/profile/achievements/sessions-5?from=profile");
  assert.equal(passport.moreToEarn[0].href, "/profile/achievements/streak-12?from=profile");
});

test("returns a Stamp page opened from the Profile to the Profile", () => {
  // Act
  const back = stampBackLink("profile");

  // Assert
  assert.deepEqual(back, { href: "/profile", label: "BACK TO PROFILE" });
});

test("returns a Stamp page to the Passport when it was opened there or from nowhere known", () => {
  // Arrange — opened from the Passport (no origin), and a crafted or stale origin
  const origins = [undefined, "", "passport", "https://evil.example", "/dashboard"];

  for (const from of origins) {
    // Act
    const back = stampBackLink(from);

    // Assert — the Passport is the Stamp page's parent, so it is the honest fallback
    assert.deepEqual(back, { href: "/profile/achievements", label: "BACK TO PASSPORT" });
  }
});
