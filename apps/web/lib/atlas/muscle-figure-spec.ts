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
      belly(80, 330, 458, [[0, 10], [0.45, 17], [0.85, 10], [1, 5]]),
      belly(92, 332, 470, [[0, 7], [0.5, 12], [1, 6]]),
      belly(100, 406, 476, [[0, 5], [0.55, 13], [1, 5]]),
    ),
  },
  {
    id: "Hamstrings",
    group: "Legs",
    symmetry: "bilateral",
    // Biceps femoris (lateral) + semitendinosus/-membranosus (medial).
    shapes: back(
      belly(82, 392, 502, [[0, 9], [0.45, 14], [0.85, 9], [1, 5]]),
      belly(96, 394, 500, [[0, 7], [0.5, 11], [1, 5]]),
    ),
  },
  {
    id: "Gluteus Maximus",
    group: "Legs",
    symmetry: "bilateral",
    shapes: back(oval(90, 360, 25, 32)),
  },
  {
    id: "Gluteus Medius",
    group: "Legs",
    symmetry: "bilateral",
    shapes: back(oval(70, 340, 11, 10)),
  },
  {
    id: "Gluteus Minimus",
    group: "Legs",
    symmetry: "bilateral",
    shapes: back(oval(75, 348, 6, 5)),
  },
  {
    id: "Tensor Fasciae Latae",
    group: "Legs",
    symmetry: "bilateral",
    shapes: front(oval(64, 336, 8, 12)),
  },
  {
    id: "Hip Adductors",
    group: "Legs",
    symmetry: "bilateral",
    shapes: front(belly(104, 332, 464, [[0, 8], [0.5, 12], [1, 5]])),
  },
  {
    id: "Hip Abductors",
    group: "Legs",
    symmetry: "bilateral",
    shapes: back(belly(62, 346, 388, [[0, 6], [0.5, 9], [1, 4]])),
  },
  {
    id: "Hip Flexors",
    group: "Legs",
    symmetry: "bilateral",
    shapes: front(belly(90, 322, 360, [[0, 8], [0.5, 9], [1, 5]])),
  },
  {
    id: "Sartorius",
    group: "Legs",
    symmetry: "bilateral",
    // A thin strap crossing the thigh from the outer hip to the inner knee.
    shapes: front(belly(72, 332, 472, [[0, 4, 0], [0.5, 4.5, 15], [1, 3, 32]])),
  },
  {
    id: "Gastrocnemius",
    group: "Legs",
    symmetry: "bilateral",
    // The two calf heads (medial fuller than lateral).
    shapes: back(
      belly(86, 504, 588, [[0, 9], [0.4, 14], [0.8, 8], [1, 3]]),
      belly(74, 506, 578, [[0, 6], [0.4, 9], [1, 3]]),
    ),
  },
  {
    id: "Soleus",
    group: "Legs",
    symmetry: "bilateral",
    shapes: back(belly(83, 586, 616, [[0, 7], [0.5, 9], [1, 5]])),
  },
  {
    id: "Tibialis Anterior",
    group: "Legs",
    symmetry: "bilateral",
    shapes: front(belly(84, 488, 600, [[0, 6], [0.4, 9], [0.8, 6], [1, 3]])),
  },
  {
    id: "Peroneals",
    group: "Legs",
    symmetry: "bilateral",
    shapes: front(belly(72, 492, 588, [[0, 4], [0.4, 7], [1, 3]])),
  },
  // ---- Chest ----
  {
    id: "Pectoralis Major",
    group: "Chest",
    symmetry: "bilateral",
    shapes: front(slab([[108, 148], [108, 196], [93, 210], [74, 208], [64, 190], [61, 165], [76, 148]])),
  },
  {
    id: "Pectoralis Minor",
    group: "Chest",
    symmetry: "bilateral",
    shapes: front(oval(84, 174, 9, 6)),
  },
  {
    id: "Serratus Anterior",
    group: "Chest",
    symmetry: "bilateral",
    shapes: front(belly(68, 196, 228, [[0, 5], [0.5, 9], [1, 4]])),
  },
  // ---- Back ----
  {
    id: "Latissimus Dorsi",
    group: "Back",
    symmetry: "bilateral",
    shapes: back(slab([[62, 206], [98, 214], [104, 262], [86, 296], [64, 266], [58, 230]])),
  },
  {
    id: "Trapezius",
    group: "Back",
    symmetry: "bilateral",
    // The big back diamond, plus the small upper-trap slope visible from the front.
    shapes: [
      { view: "back", points: slab([[108, 106], [84, 114], [62, 150], [70, 196], [98, 214], [108, 214]]) },
      { view: "front", points: slab([[98, 106], [108, 108], [108, 120], [84, 148], [64, 146], [60, 126], [82, 113]]) },
    ],
  },
  {
    id: "Rhomboids",
    group: "Back",
    symmetry: "bilateral",
    shapes: back(belly(102, 164, 210, [[0, 7], [0.5, 9], [1, 7]])),
  },
  {
    id: "Erector Spinae",
    group: "Back",
    symmetry: "bilateral",
    shapes: back(belly(103, 210, 326, [[0, 7], [0.5, 8], [1, 6]])),
  },
  {
    id: "Teres Major",
    group: "Back",
    symmetry: "bilateral",
    shapes: back(oval(76, 204, 9, 6)),
  },
  {
    id: "Teres Minor",
    group: "Back",
    symmetry: "bilateral",
    shapes: back(oval(70, 194, 6, 4)),
  },
  {
    id: "Infraspinatus",
    group: "Back",
    symmetry: "bilateral",
    shapes: back(oval(73, 182, 13, 10)),
  },
  {
    id: "Levator Scapulae",
    group: "Back",
    symmetry: "bilateral",
    shapes: back(belly(100, 114, 144, [[0, 3], [0.5, 4], [1, 3]])),
  },
  // ---- Shoulders ----
  {
    id: "Deltoids",
    group: "Shoulders",
    symmetry: "bilateral",
    // A broad rounded cap filling the shoulder and wrapping onto the upper arm.
    shapes: [
      { view: "front", points: slab([[35, 143], [45, 120], [64, 113], [84, 123], [88, 147], [80, 168], [61, 172], [44, 162]]) },
      { view: "back", points: slab([[35, 143], [45, 120], [64, 113], [84, 123], [88, 147], [80, 168], [61, 172], [44, 162]]) },
    ],
  },
  {
    id: "Supraspinatus",
    group: "Shoulders",
    symmetry: "bilateral",
    shapes: back(oval(82, 160, 12, 4)),
  },
  {
    id: "Rotator Cuff",
    group: "Shoulders",
    symmetry: "bilateral",
    shapes: back(oval(78, 173, 7, 8)),
  },
  // ---- Arms ----
  {
    id: "Biceps Brachii",
    group: "Arms",
    symmetry: "bilateral",
    shapes: front(belly(48, 157, 216, [[0, 6], [0.5, 13], [1, 7]])),
  },
  {
    id: "Triceps Brachii",
    group: "Arms",
    symmetry: "bilateral",
    // Long head + lateral head.
    shapes: back(
      belly(48, 157, 242, [[0, 7], [0.5, 12], [0.85, 7], [1, 4]]),
      belly(40, 166, 216, [[0, 5], [0.5, 7], [1, 3]]),
    ),
  },
  {
    id: "Brachialis",
    group: "Arms",
    symmetry: "bilateral",
    shapes: front(belly(50, 208, 244, [[0, 7], [0.5, 8], [1, 5]])),
  },
  {
    id: "Brachioradialis",
    group: "Arms",
    symmetry: "bilateral",
    shapes: front(belly(44, 242, 292, [[0, 5, 0], [0.4, 9, -2], [1, 4, -6]])),
  },
  {
    id: "Coracobrachialis",
    group: "Arms",
    symmetry: "bilateral",
    shapes: front(oval(58, 168, 4, 9)),
  },
  {
    id: "Anconeus",
    group: "Arms",
    symmetry: "bilateral",
    shapes: back(oval(47, 244, 5, 5)),
  },
  {
    id: "Forearms",
    group: "Arms",
    symmetry: "bilateral",
    shapes: [
      { view: "front", points: belly(43, 246, 350, [[0, 11], [0.35, 12], [0.7, 8], [1, 3]]) },
      { view: "back", points: belly(43, 246, 346, [[0, 11], [0.35, 12], [0.7, 8], [1, 3]]) },
    ],
  },
  // ---- Core ----
  {
    id: "Rectus Abdominis",
    group: "Core",
    symmetry: "bilateral",
    // The six-pack: three stacked rounded packs on the left column (mirrored to six).
    shapes: front(
      belly(100, 214, 243, [[0, 7], [0.5, 8], [1, 7]]),
      belly(100, 247, 276, [[0, 7], [0.5, 8], [1, 7]]),
      belly(100, 280, 309, [[0, 7], [0.5, 8], [1, 7]]),
    ),
  },
  {
    id: "Obliques",
    group: "Core",
    symmetry: "bilateral",
    shapes: front(belly(74, 214, 306, [[0, 7, 0], [0.4, 12, 2], [0.8, 10, 6], [1, 6, 9]])),
  },
  {
    id: "Transverse Abdominis",
    group: "Core",
    symmetry: "center",
    shapes: front(slab([[86, 300], [134, 300], [132, 322], [88, 322]])),
  },
  {
    id: "Quadratus Lumborum",
    group: "Core",
    symmetry: "bilateral",
    shapes: back(oval(99, 302, 7, 12)),
  },
  {
    id: "Multifidus",
    group: "Core",
    symmetry: "center",
    shapes: back(slab([[105, 210], [115, 210], [115, 326], [105, 326]])),
  },
];

// The canonical muscle ids in `MUSCLE_ORDER` — the frontend's copy of the #539 contract, used to
// build the manifest and to check coverage. Cross-checked against the Python `MUSCLE_ORDER` by
// `apps/api/tests/test_atlas_muscle_contract.py`, so this list can never silently drift from the
// source vocabulary.
export const CANONICAL_MUSCLE_IDS: string[] = MUSCLE_SPECS.map((spec) => spec.id);
