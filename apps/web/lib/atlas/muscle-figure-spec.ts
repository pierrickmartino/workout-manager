// The canonical muscle artwork for the anatomical Muscle Atlas (issue #542).
//
// Each entry is one canonical `Muscle` from the vocabulary in #539
// (`apps/api/app/domain/muscles.py`): its `id` is the muscle's exact enum *value* — the same
// string the API serializes as `muscle` and the web view-model reads as `region.muscle` — so a
// consumer maps a coverage row straight onto a path by `data-muscle-id` with no translation. Its
// `group` is the muscle's parent Muscle Group value. The shapes are authored **once**, on the
// viewer's-left for a `bilateral` muscle (mirrored to the right at generation time) or straddling
// the midline for a `center` one, on the shared canonical body (`atlas-geometry.ts`). The three
// figures are the *same* artwork warped by proportion — the id contract is identical across all
// of them, which is the whole point of a figure-agnostic atlas.
//
// Entries run in the canonical `MUSCLE_ORDER` (Legs → Chest → Back → Shoulders → Arms → Core),
// so the manifest and every view preserve the server's order without resorting. The artwork is
// deliberately clean and stylized, not photorealistic: each muscle is a distinct, individually
// addressable region placed where the muscle anatomically sits. It is original — anatomy itself
// is not copyrightable, and no unlicensed artwork was traced.

import type { Point, Symmetry, View } from "./atlas-geometry.ts";

export interface MuscleShape {
  view: View;
  points: Point[];
}

export interface MuscleSpec {
  id: string;
  group: string;
  symmetry: Symmetry;
  shapes: MuscleShape[];
}

export const MUSCLE_SPECS: MuscleSpec[] = [
  // ---- Legs ----
  {
    id: "Quadriceps",
    group: "Legs",
    symmetry: "bilateral",
    shapes: [{ view: "front", points: [[74, 360], [104, 362], [102, 470], [90, 492], [74, 470], [68, 410]] }],
  },
  {
    id: "Hamstrings",
    group: "Legs",
    symmetry: "bilateral",
    shapes: [{ view: "back", points: [[74, 392], [104, 394], [102, 490], [90, 506], [74, 486], [70, 440]] }],
  },
  {
    id: "Gluteus Maximus",
    group: "Legs",
    symmetry: "bilateral",
    shapes: [{ view: "back", points: [[74, 334], [106, 336], [104, 382], [82, 390], [68, 362]] }],
  },
  {
    id: "Gluteus Medius",
    group: "Legs",
    symmetry: "bilateral",
    shapes: [{ view: "back", points: [[64, 330], [82, 332], [82, 356], [66, 354]] }],
  },
  {
    id: "Gluteus Minimus",
    group: "Legs",
    symmetry: "bilateral",
    shapes: [{ view: "back", points: [[70, 338], [82, 340], [80, 354], [70, 352]] }],
  },
  {
    id: "Tensor Fasciae Latae",
    group: "Legs",
    symmetry: "bilateral",
    shapes: [{ view: "front", points: [[64, 330], [78, 334], [78, 360], [64, 358]] }],
  },
  {
    id: "Hip Adductors",
    group: "Legs",
    symmetry: "bilateral",
    shapes: [{ view: "front", points: [[96, 362], [108, 364], [108, 468], [98, 470], [94, 412]] }],
  },
  {
    id: "Hip Abductors",
    group: "Legs",
    symmetry: "bilateral",
    shapes: [{ view: "back", points: [[58, 340], [70, 342], [70, 374], [58, 370]] }],
  },
  {
    id: "Hip Flexors",
    group: "Legs",
    symmetry: "bilateral",
    shapes: [{ view: "front", points: [[82, 322], [104, 326], [100, 356], [84, 352]] }],
  },
  {
    id: "Sartorius",
    group: "Legs",
    symmetry: "bilateral",
    shapes: [{ view: "front", points: [[72, 364], [82, 364], [104, 466], [96, 470], [74, 384]] }],
  },
  {
    id: "Gastrocnemius",
    group: "Legs",
    symmetry: "bilateral",
    shapes: [{ view: "back", points: [[74, 528], [98, 530], [96, 574], [80, 584], [72, 554]] }],
  },
  {
    id: "Soleus",
    group: "Legs",
    symmetry: "bilateral",
    shapes: [{ view: "back", points: [[78, 584], [94, 584], [92, 612], [80, 612]] }],
  },
  {
    id: "Tibialis Anterior",
    group: "Legs",
    symmetry: "bilateral",
    shapes: [{ view: "front", points: [[80, 526], [92, 528], [90, 604], [80, 606], [76, 560]] }],
  },
  {
    id: "Peroneals",
    group: "Legs",
    symmetry: "bilateral",
    shapes: [{ view: "front", points: [[70, 530], [80, 530], [80, 600], [70, 596], [66, 560]] }],
  },
  // ---- Chest ----
  {
    id: "Pectoralis Major",
    group: "Chest",
    symmetry: "bilateral",
    shapes: [{ view: "front", points: [[73, 152], [106, 154], [106, 182], [92, 196], [76, 190], [70, 166]] }],
  },
  {
    id: "Pectoralis Minor",
    group: "Chest",
    symmetry: "bilateral",
    shapes: [{ view: "front", points: [[80, 158], [98, 160], [96, 176], [80, 174]] }],
  },
  {
    id: "Serratus Anterior",
    group: "Chest",
    symmetry: "bilateral",
    shapes: [{ view: "front", points: [[66, 192], [80, 196], [82, 216], [68, 216], [62, 204]] }],
  },
  // ---- Back ----
  {
    id: "Latissimus Dorsi",
    group: "Back",
    symmetry: "bilateral",
    shapes: [{ view: "back", points: [[64, 206], [92, 210], [96, 264], [76, 272], [60, 238]] }],
  },
  {
    id: "Trapezius",
    group: "Back",
    symmetry: "bilateral",
    shapes: [{ view: "back", points: [[108, 116], [92, 120], [76, 150], [92, 200], [108, 208]] }],
  },
  {
    id: "Rhomboids",
    group: "Back",
    symmetry: "bilateral",
    shapes: [{ view: "back", points: [[96, 170], [108, 170], [108, 206], [96, 204]] }],
  },
  {
    id: "Erector Spinae",
    group: "Back",
    symmetry: "bilateral",
    shapes: [{ view: "back", points: [[97, 208], [108, 208], [108, 318], [97, 320]] }],
  },
  {
    id: "Teres Major",
    group: "Back",
    symmetry: "bilateral",
    shapes: [{ view: "back", points: [[72, 204], [90, 206], [88, 220], [74, 220]] }],
  },
  {
    id: "Teres Minor",
    group: "Back",
    symmetry: "bilateral",
    shapes: [{ view: "back", points: [[70, 190], [84, 192], [82, 204], [70, 202]] }],
  },
  {
    id: "Infraspinatus",
    group: "Back",
    symmetry: "bilateral",
    shapes: [{ view: "back", points: [[72, 168], [95, 170], [93, 192], [72, 190]] }],
  },
  {
    id: "Levator Scapulae",
    group: "Back",
    symmetry: "bilateral",
    shapes: [{ view: "back", points: [[96, 116], [108, 118], [106, 140], [94, 138]] }],
  },
  // ---- Shoulders ----
  {
    id: "Deltoids",
    group: "Shoulders",
    symmetry: "bilateral",
    shapes: [
      { view: "front", points: [[50, 128], [68, 120], [84, 128], [82, 146], [68, 152], [54, 146]] },
      { view: "back", points: [[50, 128], [68, 120], [84, 128], [82, 146], [68, 152], [54, 146]] },
    ],
  },
  {
    id: "Supraspinatus",
    group: "Shoulders",
    symmetry: "bilateral",
    shapes: [{ view: "back", points: [[74, 150], [94, 152], [94, 164], [74, 162]] }],
  },
  {
    id: "Rotator Cuff",
    group: "Shoulders",
    symmetry: "bilateral",
    shapes: [{ view: "back", points: [[74, 156], [88, 158], [86, 182], [74, 180]] }],
  },
  // ---- Arms ----
  {
    id: "Biceps Brachii",
    group: "Arms",
    symmetry: "bilateral",
    shapes: [{ view: "front", points: [[46, 158], [62, 160], [62, 212], [50, 214], [44, 186]] }],
  },
  {
    id: "Triceps Brachii",
    group: "Arms",
    symmetry: "bilateral",
    shapes: [{ view: "back", points: [[44, 158], [60, 160], [60, 238], [46, 238], [40, 190]] }],
  },
  {
    id: "Brachialis",
    group: "Arms",
    symmetry: "bilateral",
    shapes: [{ view: "front", points: [[46, 214], [60, 214], [58, 240], [46, 238]] }],
  },
  {
    id: "Brachioradialis",
    group: "Arms",
    symmetry: "bilateral",
    shapes: [{ view: "front", points: [[40, 242], [54, 246], [52, 278], [38, 272]] }],
  },
  {
    id: "Coracobrachialis",
    group: "Arms",
    symmetry: "bilateral",
    shapes: [{ view: "front", points: [[60, 152], [70, 154], [68, 172], [60, 170]] }],
  },
  {
    id: "Anconeus",
    group: "Arms",
    symmetry: "bilateral",
    shapes: [{ view: "back", points: [[46, 238], [58, 240], [56, 256], [46, 254]] }],
  },
  {
    id: "Forearms",
    group: "Arms",
    symmetry: "bilateral",
    shapes: [
      { view: "front", points: [[38, 278], [54, 280], [52, 344], [40, 346], [34, 306]] },
      { view: "back", points: [[38, 258], [54, 262], [52, 340], [40, 340], [34, 300]] },
    ],
  },
  // ---- Core ----
  {
    id: "Rectus Abdominis",
    group: "Core",
    symmetry: "bilateral",
    shapes: [{ view: "front", points: [[93, 216], [108, 216], [108, 310], [93, 312]] }],
  },
  {
    id: "Obliques",
    group: "Core",
    symmetry: "bilateral",
    shapes: [{ view: "front", points: [[74, 224], [92, 224], [90, 300], [74, 296], [70, 260]] }],
  },
  {
    id: "Transverse Abdominis",
    group: "Core",
    symmetry: "center",
    shapes: [{ view: "front", points: [[86, 300], [134, 300], [132, 322], [88, 322]] }],
  },
  {
    id: "Quadratus Lumborum",
    group: "Core",
    symmetry: "bilateral",
    shapes: [{ view: "back", points: [[90, 300], [104, 300], [104, 330], [90, 330]] }],
  },
  {
    id: "Multifidus",
    group: "Core",
    symmetry: "center",
    shapes: [{ view: "back", points: [[104, 208], [116, 208], [116, 330], [104, 330]] }],
  },
];

// The canonical muscle ids in `MUSCLE_ORDER` — the frontend's copy of the #539 contract, used to
// build the manifest and to check coverage. Cross-checked against the Python `MUSCLE_ORDER` by
// `apps/api/tests/test_atlas_muscle_contract.py`, so this list can never silently drift from the
// source vocabulary.
export const CANONICAL_MUSCLE_IDS: string[] = MUSCLE_SPECS.map((spec) => spec.id);
