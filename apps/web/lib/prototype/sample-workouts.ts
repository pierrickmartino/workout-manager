// PROTOTYPE — throwaway sample data for the workout-cover prototype. In-memory only (the
// prototype checks a *look*, not data plumbing). Deliberately includes TWO "Calisthenics"
// entries with different ids and different exercise lists — the exact collision the brief calls
// out — so every variant can be judged on whether its mark actually tells them apart.

import type { CoverWorkout } from "./workout-identity";

export interface SampleWorkout extends CoverWorkout {
  // Extra fields the surfaces render around the cover, so the prototype butts against real
  // density rather than a bare graphic.
  durationMinutes: number;
  lastPerformedOn: string | null;
  author: string;
}

export const SAMPLE_WORKOUTS: SampleWorkout[] = [
  {
    id: 4012,
    name: "Calisthenics",
    trainingType: "strength",
    exercises: [
      "Pull-up",
      "Dip",
      "Pike push-up",
      "Bulgarian split squat",
      "Hanging leg raise",
    ],
    durationMinutes: 45,
    lastPerformedOn: "Sep 4, 2026",
    author: "You",
  },
  {
    id: 4027,
    name: "Calisthenics",
    trainingType: "strength",
    exercises: [
      "Muscle-up",
      "Handstand push-up",
      "Front lever row",
      "Pistol squat",
    ],
    durationMinutes: 38,
    lastPerformedOn: "Aug 29, 2026",
    author: "You",
  },
  {
    id: 3180,
    name: "Zone 2 base builder",
    trainingType: "cardio",
    exercises: ["Row erg", "Assault bike", "Incline treadmill walk"],
    durationMinutes: 50,
    lastPerformedOn: "Sep 8, 2026",
    author: "Coach Rhea",
  },
  {
    id: 5501,
    name: "Engine intervals",
    trainingType: "hiit",
    exercises: [
      "Burpee",
      "Kettlebell swing",
      "Box jump",
      "Wall ball",
      "Devil press",
      "Ski erg sprint",
    ],
    durationMinutes: 28,
    lastPerformedOn: null,
    author: "You",
  },
  {
    id: 2290,
    name: "Morning flow",
    trainingType: "yoga",
    exercises: ["Sun salutation A", "Warrior II", "Pigeon", "Boat"],
    durationMinutes: 25,
    lastPerformedOn: "Sep 10, 2026",
    author: "Coach Rhea",
  },
  {
    id: 6640,
    name: "Hip & T-spine reset",
    trainingType: "mobility",
    exercises: ["90/90 switch", "Cat-cow", "World's greatest stretch"],
    durationMinutes: 18,
    lastPerformedOn: "Sep 9, 2026",
    author: "You",
  },
];

// The two entries the mark has to disambiguate — surfaced so a variant can spotlight them.
export const CALISTHENICS_PAIR: SampleWorkout[] = SAMPLE_WORKOUTS.filter(
  (workout) => workout.name === "Calisthenics",
);
