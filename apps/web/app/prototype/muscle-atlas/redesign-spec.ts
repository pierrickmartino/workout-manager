// PROTOTYPE — throwaway. Redesigned "Sasha's Body Map"-style muscle artwork.
//
// The shipped atlas (`lib/atlas/muscle-figure-spec.ts`) draws each muscle as a *small floating
// blob* on a mostly-empty silhouette. This prototype answers the question "what would a fuller,
// contiguous, anatomical body map — closer to Olkre/Sasha-s-Body-Map — look like on our data?".
//
// So the shapes here are deliberately **larger and abutting**: they tile the torso and limbs so
// the body reads as muscle, not as a grey mannequin with a few stickers. Each big muscle also
// carries optional `fibers` — short open polylines drawn as faint striations, so a filled muscle
// reads as fibrous tissue rather than a flat swatch (the striation/definition look Sasha's map
// has). Ids reuse the canonical Muscle vocabulary so the same coverage/heat data lights it up.
//
// This is authored on the SAME canonical body coordinate system as the real atlas
// (`lib/atlas/atlas-geometry.ts`, viewBox 0 0 220 640, midline x=110), so it reuses the shipped
// warp/mirror/smooth-path helpers and the shipped silhouette. It is NOT production artwork —
// coordinates are hand-tuned for the neutral figure to communicate a direction, not to be
// anatomically exact.

import {
  smoothClosedPath,
  warpPoint,
  mirrorPoints,
  type Figure,
  type Point,
  type Symmetry,
  type View,
} from "@/lib/atlas/atlas-geometry";

export interface RedesignShape {
  view: View;
  // Closed ring of the muscle belly, authored on the viewer's-left (x < 110) for a bilateral
  // muscle, or straddling the midline for a center one.
  points: Point[];
  // Optional open polylines drawn on top as faint fiber striations. Authored in the same
  // coordinates; mirrored alongside the belly for a bilateral muscle.
  fibers?: Point[][];
}

export interface RedesignMuscle {
  id: string;
  group: string;
  symmetry: Symmetry;
  shapes: RedesignShape[];
}

// One drawable, warped occurrence: the belly path plus its striation path strings.
export interface RenderedRedesignOccurrence {
  d: string;
  fibers: string[];
}

export interface RenderedRedesignMuscle {
  id: string;
  group: string;
  occurrences: RenderedRedesignOccurrence[];
}

// A larger, contiguous muscle set. Legs → Chest → Back → Shoulders → Arms → Core, matching the
// canonical group order so the prototype's list/legend reads in the same order as the app.
export const REDESIGN_MUSCLES: RedesignMuscle[] = [
  // ---------------------------------------------------------------- Legs
  {
    id: "Quadriceps",
    group: "Legs",
    symmetry: "bilateral",
    shapes: [
      {
        view: "front",
        points: [[72, 328], [107, 328], [106, 400], [100, 452], [88, 478], [75, 452], [69, 396], [67, 356]],
        fibers: [
          [[80, 344], [86, 470]],
          [[92, 346], [92, 466]],
          [[100, 350], [97, 452]],
        ],
      },
    ],
  },
  {
    id: "Sartorius",
    group: "Legs",
    symmetry: "bilateral",
    shapes: [{ view: "front", points: [[70, 330], [80, 330], [104, 462], [96, 470], [73, 356]] }],
  },
  {
    id: "Hip Adductors",
    group: "Legs",
    symmetry: "bilateral",
    shapes: [{ view: "front", points: [[95, 330], [108, 330], [108, 452], [100, 470], [93, 452], [92, 388]] }],
  },
  {
    id: "Tibialis Anterior",
    group: "Legs",
    symmetry: "bilateral",
    shapes: [
      {
        view: "front",
        points: [[80, 486], [94, 488], [92, 560], [88, 606], [81, 608], [77, 556]],
        fibers: [[[85, 498], [85, 598]]],
      },
    ],
  },
  {
    id: "Peroneals",
    group: "Legs",
    symmetry: "bilateral",
    shapes: [{ view: "front", points: [[69, 488], [80, 488], [80, 596], [71, 598], [66, 552]] }],
  },
  {
    id: "Gluteus Maximus",
    group: "Legs",
    symmetry: "bilateral",
    shapes: [
      {
        view: "back",
        points: [[69, 326], [108, 326], [108, 372], [92, 392], [72, 384], [64, 356]],
        fibers: [
          [[74, 344], [102, 336]],
          [[76, 360], [100, 352]],
        ],
      },
    ],
  },
  {
    id: "Hamstrings",
    group: "Legs",
    symmetry: "bilateral",
    shapes: [
      {
        view: "back",
        points: [[73, 392], [106, 392], [104, 452], [96, 496], [80, 496], [71, 452]],
        fibers: [
          [[82, 402], [86, 490]],
          [[94, 402], [93, 490]],
        ],
      },
    ],
  },
  {
    id: "Gastrocnemius",
    group: "Legs",
    symmetry: "bilateral",
    shapes: [
      {
        view: "back",
        points: [[73, 504], [99, 506], [97, 552], [88, 586], [80, 586], [72, 548]],
        fibers: [
          [[82, 516], [84, 578]],
          [[92, 516], [90, 572]],
        ],
      },
    ],
  },
  {
    id: "Soleus",
    group: "Legs",
    symmetry: "bilateral",
    shapes: [{ view: "back", points: [[76, 586], [94, 586], [92, 614], [80, 614]] }],
  },
  // ---------------------------------------------------------------- Chest
  {
    id: "Pectoralis Major",
    group: "Chest",
    symmetry: "bilateral",
    shapes: [
      {
        view: "front",
        points: [[68, 150], [108, 150], [108, 188], [94, 206], [78, 204], [68, 182], [63, 164]],
        fibers: [
          [[70, 162], [104, 156]],
          [[68, 176], [100, 178]],
          [[74, 192], [98, 194]],
        ],
      },
    ],
  },
  {
    id: "Serratus Anterior",
    group: "Chest",
    symmetry: "bilateral",
    shapes: [
      {
        view: "front",
        points: [[64, 196], [80, 200], [82, 226], [70, 226], [62, 212]],
        fibers: [
          [[66, 204], [78, 208]],
          [[66, 214], [79, 218]],
        ],
      },
    ],
  },
  // ---------------------------------------------------------------- Back
  {
    id: "Trapezius",
    group: "Back",
    symmetry: "bilateral",
    shapes: [
      {
        view: "back",
        points: [[108, 108], [86, 116], [64, 150], [72, 186], [96, 210], [108, 210]],
        fibers: [
          [[104, 120], [78, 132]],
          [[104, 150], [80, 160]],
          [[104, 184], [86, 196]],
        ],
      },
      // A small upper-trap sliver visible from the front (neck-to-shoulder slope).
      { view: "front", points: [[98, 108], [108, 110], [108, 122], [84, 148], [66, 146], [64, 128], [82, 116]] },
    ],
  },
  {
    id: "Latissimus Dorsi",
    group: "Back",
    symmetry: "bilateral",
    shapes: [
      {
        view: "back",
        points: [[62, 210], [96, 214], [102, 262], [82, 292], [64, 262], [59, 232]],
        fibers: [
          [[64, 224], [96, 250]],
          [[66, 242], [90, 270]],
          [[70, 258], [84, 282]],
        ],
      },
    ],
  },
  {
    id: "Erector Spinae",
    group: "Back",
    symmetry: "bilateral",
    shapes: [
      {
        view: "back",
        points: [[98, 212], [108, 212], [108, 322], [98, 322]],
        fibers: [[[103, 220], [103, 316]]],
      },
    ],
  },
  {
    id: "Infraspinatus",
    group: "Back",
    symmetry: "bilateral",
    shapes: [{ view: "back", points: [[72, 166], [96, 168], [94, 192], [72, 190]] }],
  },
  {
    id: "Teres Major",
    group: "Back",
    symmetry: "bilateral",
    shapes: [{ view: "back", points: [[72, 194], [92, 198], [88, 212], [74, 212]] }],
  },
  // ---------------------------------------------------------------- Shoulders
  {
    id: "Deltoids",
    group: "Shoulders",
    symmetry: "bilateral",
    shapes: [
      {
        view: "front",
        points: [[45, 122], [70, 115], [87, 128], [85, 154], [70, 163], [51, 153], [43, 138]],
        fibers: [
          [[52, 132], [78, 128]],
          [[50, 144], [80, 142]],
        ],
      },
      {
        view: "back",
        points: [[45, 122], [70, 115], [87, 128], [85, 154], [70, 163], [51, 153], [43, 138]],
        fibers: [
          [[52, 132], [78, 128]],
          [[50, 144], [80, 142]],
        ],
      },
    ],
  },
  // ---------------------------------------------------------------- Arms
  {
    id: "Biceps Brachii",
    group: "Arms",
    symmetry: "bilateral",
    shapes: [
      {
        view: "front",
        points: [[41, 158], [63, 160], [62, 210], [50, 216], [41, 190]],
        fibers: [[[52, 166], [54, 210]]],
      },
    ],
  },
  {
    id: "Triceps Brachii",
    group: "Arms",
    symmetry: "bilateral",
    shapes: [
      {
        view: "back",
        points: [[41, 158], [63, 160], [61, 214], [47, 240], [39, 214], [38, 186]],
        fibers: [
          [[48, 168], [50, 232]],
          [[56, 168], [56, 226]],
        ],
      },
    ],
  },
  {
    id: "Forearms",
    group: "Arms",
    symmetry: "bilateral",
    shapes: [
      {
        view: "front",
        points: [[38, 216], [58, 218], [54, 300], [44, 348], [36, 300], [34, 258]],
        fibers: [[[46, 226], [46, 342]]],
      },
      {
        view: "back",
        points: [[38, 240], [58, 242], [54, 320], [44, 344], [36, 316], [34, 278]],
        fibers: [[[46, 250], [46, 338]]],
      },
    ],
  },
  // ---------------------------------------------------------------- Core
  {
    id: "Rectus Abdominis",
    group: "Core",
    symmetry: "bilateral",
    shapes: [
      {
        view: "front",
        points: [[92, 212], [108, 212], [108, 316], [95, 318], [92, 300]],
        fibers: [
          // The six-pack: horizontal tendinous intersections + the linea running to the midline.
          [[93, 236], [108, 236]],
          [[93, 262], [108, 262]],
          [[94, 288], [108, 288]],
          [[100, 216], [100, 314]],
        ],
      },
    ],
  },
  {
    id: "Obliques",
    group: "Core",
    symmetry: "bilateral",
    shapes: [
      {
        view: "front",
        points: [[71, 214], [92, 220], [90, 296], [77, 308], [67, 262]],
        fibers: [
          [[74, 226], [86, 244]],
          [[72, 250], [85, 270]],
        ],
      },
    ],
  },
];

// Warp an open polyline (a fiber striation) onto a figure and emit an SVG path string. Straight
// segments are fine — fibers read as thin definition lines, not organic blobs.
function openPath(points: readonly Point[], figure: Figure): string {
  const warped = points.map((point) => warpPoint(point, figure));
  const [head, ...rest] = warped;
  const move = `M ${round(head[0])} ${round(head[1])}`;
  const lines = rest.map(([x, y]) => `L ${round(x)} ${round(y)}`).join(" ");
  return `${move} ${lines}`;
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

function renderShape(
  shape: RedesignShape,
  figure: Figure,
  mirror: boolean,
): RenderedRedesignOccurrence {
  const belly = mirror ? mirrorPoints(shape.points) : shape.points;
  const d = smoothClosedPath(belly.map((point) => warpPoint(point, figure)));
  const fibers = (shape.fibers ?? []).map((line) =>
    openPath(mirror ? mirrorPoints(line) : line, figure),
  );
  return { d, fibers };
}

// Build the render model for one figure/view: every redesigned muscle whose shape is on this
// view, each warped onto the figure. A bilateral muscle emits a left and a mirrored-right
// occurrence from a single authored source; a center muscle emits one.
export function renderRedesign(figure: Figure, view: View): RenderedRedesignMuscle[] {
  const out: RenderedRedesignMuscle[] = [];
  for (const muscle of REDESIGN_MUSCLES) {
    const occurrences: RenderedRedesignOccurrence[] = [];
    for (const shape of muscle.shapes) {
      if (shape.view !== view) continue;
      if (muscle.symmetry === "center") {
        occurrences.push(renderShape(shape, figure, false));
      } else {
        occurrences.push(renderShape(shape, figure, false));
        occurrences.push(renderShape(shape, figure, true));
      }
    }
    if (occurrences.length === 0) continue;
    out.push({ id: muscle.id, group: muscle.group, occurrences });
  }
  return out;
}

// The ids this redesigned artwork actually draws — used by the mock data so the heat map only
// lights muscles the figure can show.
export const REDESIGN_MUSCLE_IDS: string[] = REDESIGN_MUSCLES.map((muscle) => muscle.id);
