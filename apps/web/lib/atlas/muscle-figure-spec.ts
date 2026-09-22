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
// so the manifest and every view preserve the server's order without resorting.
//
// The artwork reads as a **detailed anatomical chart**: a muscle is composed from one or more
// tapered bellies (`shape-kit.ts`) placed where it anatomically sits — a big muscle is drawn as
// its distinct heads (quadriceps as its three vasti/rectus, triceps as long + lateral, the
// abdominals as a stacked six-pack), so the body reads as carved muscle rather than a mannequin
// with stickers. Every belly is described by shape, in our own coordinates — the geometry is
// **original**: anatomy itself is not copyrightable, and no third-party artwork was traced.

import type { Point, Symmetry, View } from "./atlas-geometry.ts";
import { belly, oval, slab } from "./shape-kit.ts";

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

// Convenience: tag a list of authored rings with the view they belong to.
function front(...rings: Point[][]): MuscleShape[] {
  return rings.map((points) => ({ view: "front" as const, points }));
}
function back(...rings: Point[][]): MuscleShape[] {
  return rings.map((points) => ({ view: "back" as const, points }));
}

export const MUSCLE_SPECS: MuscleSpec[] = [
  // ---- Legs ----
  {
    id: "Quadriceps",
    group: "Legs",
    symmetry: "bilateral",
    // Three heads: vastus lateralis (outer), rectus femoris (central), vastus medialis (the
    // teardrop above the knee).
    shapes: front(
      belly(80, 330, 452, [[0, 9], [0.45, 15], [0.85, 9], [1, 5]]),
      belly(91, 332, 466, [[0, 6], [0.5, 10], [1, 6]]),
      belly(99, 404, 472, [[0, 5], [0.55, 11], [1, 5]]),
    ),
  },
  {
    id: "Hamstrings",
    group: "Legs",
    symmetry: "bilateral",
    // Biceps femoris (lateral) + semitendinosus/-membranosus (medial).
    shapes: back(
      belly(82, 392, 498, [[0, 8], [0.45, 12], [0.85, 8], [1, 5]]),
      belly(95, 394, 496, [[0, 6], [0.5, 9], [1, 5]]),
    ),
  },
  {
    id: "Gluteus Maximus",
    group: "Legs",
    symmetry: "bilateral",
    shapes: back(oval(90, 358, 22, 30)),
  },
  {
    id: "Gluteus Medius",
    group: "Legs",
    symmetry: "bilateral",
    shapes: back(oval(72, 338, 10, 9)),
  },
  {
    id: "Gluteus Minimus",
    group: "Legs",
    symmetry: "bilateral",
    shapes: back(oval(76, 346, 6, 5)),
  },
  {
    id: "Tensor Fasciae Latae",
    group: "Legs",
    symmetry: "bilateral",
    shapes: front(oval(66, 334, 7, 11)),
  },
  {
    id: "Hip Adductors",
    group: "Legs",
    symmetry: "bilateral",
    shapes: front(belly(103, 332, 460, [[0, 7], [0.5, 11], [1, 5]])),
  },
  {
    id: "Hip Abductors",
    group: "Legs",
    symmetry: "bilateral",
    shapes: back(belly(63, 344, 382, [[0, 5], [0.5, 8], [1, 4]])),
  },
  {
    id: "Hip Flexors",
    group: "Legs",
    symmetry: "bilateral",
    shapes: front(belly(92, 320, 356, [[0, 7], [0.5, 8], [1, 5]])),
  },
  {
    id: "Sartorius",
    group: "Legs",
    symmetry: "bilateral",
    // A thin strap crossing the thigh from the outer hip to the inner knee.
    shapes: front(belly(74, 332, 468, [[0, 3.5, 0], [0.5, 4, 14], [1, 3, 30]])),
  },
  {
    id: "Gastrocnemius",
    group: "Legs",
    symmetry: "bilateral",
    // The two calf heads (medial fuller than lateral).
    shapes: back(
      belly(85, 506, 584, [[0, 8], [0.4, 12], [0.8, 7], [1, 3]]),
      belly(74, 508, 574, [[0, 5], [0.4, 8], [1, 3]]),
    ),
  },
  {
    id: "Soleus",
    group: "Legs",
    symmetry: "bilateral",
    shapes: back(belly(83, 582, 616, [[0, 6], [0.5, 8], [1, 5]])),
  },
  {
    id: "Tibialis Anterior",
    group: "Legs",
    symmetry: "bilateral",
    shapes: front(belly(86, 486, 606, [[0, 5], [0.4, 8], [0.8, 6], [1, 3]])),
  },
  {
    id: "Peroneals",
    group: "Legs",
    symmetry: "bilateral",
    shapes: front(belly(73, 490, 598, [[0, 3], [0.4, 6], [1, 3]])),
  },
  // ---- Chest ----
  {
    id: "Pectoralis Major",
    group: "Chest",
    symmetry: "bilateral",
    shapes: front(slab([[108, 148], [108, 192], [95, 208], [78, 206], [66, 188], [63, 163], [76, 149]])),
  },
  {
    id: "Pectoralis Minor",
    group: "Chest",
    symmetry: "bilateral",
    shapes: front(oval(86, 172, 8, 6)),
  },
  {
    id: "Serratus Anterior",
    group: "Chest",
    symmetry: "bilateral",
    shapes: front(belly(70, 196, 226, [[0, 5], [0.5, 8], [1, 4]])),
  },
  // ---- Back ----
  {
    id: "Latissimus Dorsi",
    group: "Back",
    symmetry: "bilateral",
    shapes: back(slab([[62, 208], [96, 214], [100, 256], [86, 292], [66, 262], [59, 230]])),
  },
  {
    id: "Trapezius",
    group: "Back",
    symmetry: "bilateral",
    // The big back diamond, plus the small upper-trap slope visible from the front.
    shapes: [
      { view: "back", points: slab([[108, 108], [86, 116], [64, 150], [70, 190], [96, 210], [108, 210]]) },
      { view: "front", points: slab([[98, 108], [108, 110], [108, 120], [86, 148], [68, 146], [64, 128], [82, 115]]) },
    ],
  },
  {
    id: "Rhomboids",
    group: "Back",
    symmetry: "bilateral",
    shapes: back(belly(102, 166, 208, [[0, 6], [0.5, 8], [1, 6]])),
  },
  {
    id: "Erector Spinae",
    group: "Back",
    symmetry: "bilateral",
    shapes: back(belly(103, 210, 320, [[0, 6], [0.5, 7], [1, 6]])),
  },
  {
    id: "Teres Major",
    group: "Back",
    symmetry: "bilateral",
    shapes: back(oval(77, 202, 8, 6)),
  },
  {
    id: "Teres Minor",
    group: "Back",
    symmetry: "bilateral",
    shapes: back(oval(72, 193, 6, 4)),
  },
  {
    id: "Infraspinatus",
    group: "Back",
    symmetry: "bilateral",
    shapes: back(oval(75, 180, 12, 10)),
  },
  {
    id: "Levator Scapulae",
    group: "Back",
    symmetry: "bilateral",
    shapes: back(belly(101, 116, 142, [[0, 3], [0.5, 4], [1, 3]])),
  },
  // ---- Shoulders ----
  {
    id: "Deltoids",
    group: "Shoulders",
    symmetry: "bilateral",
    // A rounded cap over the shoulder that wraps down onto the upper arm — not a floating ball.
    shapes: [
      { view: "front", points: slab([[45, 140], [53, 121], [69, 115], [85, 124], [87, 143], [80, 160], [65, 164], [51, 156]]) },
      { view: "back", points: slab([[45, 140], [53, 121], [69, 115], [85, 124], [87, 143], [80, 160], [65, 164], [51, 156]]) },
    ],
  },
  {
    id: "Supraspinatus",
    group: "Shoulders",
    symmetry: "bilateral",
    shapes: back(oval(84, 160, 11, 4)),
  },
  {
    id: "Rotator Cuff",
    group: "Shoulders",
    symmetry: "bilateral",
    shapes: back(oval(80, 172, 7, 8)),
  },
  // ---- Arms ----
  {
    id: "Biceps Brachii",
    group: "Arms",
    symmetry: "bilateral",
    shapes: front(belly(52, 156, 214, [[0, 5], [0.5, 11], [1, 6]])),
  },
  {
    id: "Triceps Brachii",
    group: "Arms",
    symmetry: "bilateral",
    // Long head + lateral head.
    shapes: back(
      belly(52, 158, 240, [[0, 6], [0.5, 9], [0.85, 6], [1, 4]]),
      belly(45, 166, 214, [[0, 4], [0.5, 6], [1, 3]]),
    ),
  },
  {
    id: "Brachialis",
    group: "Arms",
    symmetry: "bilateral",
    shapes: front(belly(53, 206, 242, [[0, 6], [0.5, 7], [1, 5]])),
  },
  {
    id: "Brachioradialis",
    group: "Arms",
    symmetry: "bilateral",
    shapes: front(belly(47, 240, 288, [[0, 4, 0], [0.4, 8, -2], [1, 3, -6]])),
  },
  {
    id: "Coracobrachialis",
    group: "Arms",
    symmetry: "bilateral",
    shapes: front(oval(61, 166, 4, 9)),
  },
  {
    id: "Anconeus",
    group: "Arms",
    symmetry: "bilateral",
    shapes: back(oval(50, 242, 5, 5)),
  },
  {
    id: "Forearms",
    group: "Arms",
    symmetry: "bilateral",
    shapes: [
      { view: "front", points: belly(46, 244, 346, [[0, 9], [0.35, 10], [0.7, 7], [1, 3]]) },
      { view: "back", points: belly(46, 244, 342, [[0, 9], [0.35, 10], [0.7, 7], [1, 3]]) },
    ],
  },
  // ---- Core ----
  {
    id: "Rectus Abdominis",
    group: "Core",
    symmetry: "bilateral",
    // The six-pack: three stacked rounded packs on the left column (mirrored to six).
    shapes: front(
      belly(101, 214, 242, [[0, 6], [0.5, 7], [1, 6]]),
      belly(101, 246, 274, [[0, 6], [0.5, 7], [1, 6]]),
      belly(101, 278, 308, [[0, 6], [0.5, 7], [1, 6]]),
    ),
  },
  {
    id: "Obliques",
    group: "Core",
    symmetry: "bilateral",
    shapes: front(belly(76, 214, 304, [[0, 6, 0], [0.4, 11, 2], [0.8, 9, 6], [1, 5, 9]])),
  },
  {
    id: "Transverse Abdominis",
    group: "Core",
    symmetry: "center",
    shapes: front(slab([[88, 300], [132, 300], [130, 320], [90, 320]])),
  },
  {
    id: "Quadratus Lumborum",
    group: "Core",
    symmetry: "bilateral",
    shapes: back(oval(99, 300, 7, 12)),
  },
  {
    id: "Multifidus",
    group: "Core",
    symmetry: "center",
    shapes: back(slab([[105, 210], [115, 210], [115, 320], [105, 320]])),
  },
];

// The canonical muscle ids in `MUSCLE_ORDER` — the frontend's copy of the #539 contract, used to
// build the manifest and to check coverage. Cross-checked against the Python `MUSCLE_ORDER` by
// `apps/api/tests/test_atlas_muscle_contract.py`, so this list can never silently drift from the
// source vocabulary.
export const CANONICAL_MUSCLE_IDS: string[] = MUSCLE_SPECS.map((spec) => spec.id);
