import type { CSSProperties, KeyboardEvent } from "react";

import type { AtlasRegion } from "@/lib/muscle-atlas-view";
import { GROUP_VAR, GROUP_VAR_FALLBACK } from "@/components/pulse/muscle-colors";

// One drawable shape of a body region. A region (a Muscle Group) is one or more of these,
// so a group that appears on both sides of the body (e.g. arms) can be several shapes.
type Shape =
  | { t: "ellipse"; cx: number; cy: number; rx: number; ry: number }
  | { t: "rect"; x: number; y: number; width: number; height: number; rx: number }
  | { t: "path"; d: string };

interface RegionSpec {
  group: string;
  shapes: Shape[];
}

// The stylized front/back silhouette, mapped to the six real Muscle Groups (task #9).
// Coordinates live on a 140×300 viewBox, symmetric about x=70. The figure is deliberately
// stylized, not anatomically exact — the load-bearing part is the region→group mapping and
// that every group always draws (faint when untrained) so the body always reads as a body.
const FRONT: RegionSpec[] = [
  {
    group: "Shoulders",
    shapes: [
      { t: "ellipse", cx: 44, cy: 72, rx: 15, ry: 11 },
      { t: "ellipse", cx: 96, cy: 72, rx: 15, ry: 11 },
    ],
  },
  {
    group: "Chest",
    shapes: [
      { t: "path", d: "M50 74 h18 v14 q0 8 -9 9 q-11 -1 -12 -12 z" },
      { t: "path", d: "M90 74 h-18 v14 q0 8 9 9 q11 -1 12 -12 z" },
    ],
  },
  {
    group: "Arms",
    shapes: [
      { t: "path", d: "M27 68 q-6 2 -6 12 l3 34 q1 8 8 8 q7 0 7 -9 l-3 -37 q-1 -9 -9 -8 z" },
      { t: "rect", x: 24, y: 120, width: 13, height: 40, rx: 6 },
      { t: "path", d: "M113 68 q6 2 6 12 l-3 34 q-1 8 -8 8 q-7 0 -7 -9 l3 -37 q1 -9 9 -8 z" },
      { t: "rect", x: 103, y: 120, width: 13, height: 40, rx: 6 },
    ],
  },
  { group: "Core", shapes: [{ t: "rect", x: 54, y: 98, width: 32, height: 48, rx: 9 }] },
  {
    group: "Legs",
    shapes: [
      { t: "path", d: "M50 150 h17 l-2 62 q-1 9 -8 9 q-7 0 -8 -9 z" },
      { t: "rect", x: 49, y: 224, width: 15, height: 58, rx: 7 },
      { t: "path", d: "M90 150 h-17 l2 62 q1 9 8 9 q7 0 8 -9 z" },
      { t: "rect", x: 76, y: 224, width: 15, height: 58, rx: 7 },
    ],
  },
];

const BACK: RegionSpec[] = [
  {
    group: "Shoulders",
    shapes: [
      { t: "ellipse", cx: 44, cy: 72, rx: 15, ry: 11 },
      { t: "ellipse", cx: 96, cy: 72, rx: 15, ry: 11 },
    ],
  },
  { group: "Back", shapes: [{ t: "path", d: "M48 72 h44 v30 q-2 18 -22 20 q-20 -2 -22 -20 z" }] },
  {
    group: "Arms",
    shapes: [
      { t: "path", d: "M27 68 q-6 2 -6 12 l3 34 q1 8 8 8 q7 0 7 -9 l-3 -37 q-1 -9 -9 -8 z" },
      { t: "rect", x: 24, y: 120, width: 13, height: 40, rx: 6 },
      { t: "path", d: "M113 68 q6 2 6 12 l-3 34 q-1 8 -8 8 q-7 0 -7 -9 l3 -37 q1 -9 9 -8 z" },
      { t: "rect", x: 103, y: 120, width: 13, height: 40, rx: 6 },
    ],
  },
  { group: "Core", shapes: [{ t: "rect", x: 56, y: 124, width: 28, height: 20, rx: 7 }] },
  {
    group: "Legs",
    shapes: [
      { t: "rect", x: 50, y: 148, width: 40, height: 26, rx: 12 },
      { t: "path", d: "M50 176 h17 l-2 46 q-1 9 -8 9 q-7 0 -8 -9 z" },
      { t: "rect", x: 49, y: 234, width: 15, height: 50, rx: 7 },
      { t: "path", d: "M90 176 h-17 l2 46 q1 9 8 9 q7 0 8 -9 z" },
      { t: "rect", x: 76, y: 234, width: 15, height: 50, rx: 7 },
    ],
  },
];

const HEAD_STYLE: CSSProperties = {
  fill: "var(--color-elevated)",
  stroke: "var(--color-border-lite)",
  strokeWidth: 1,
};

// The region's fill/stroke from its training volume: a trained region warms up with
// intensity; an untrained one is a faint neutral dashed outline (no fill) — descriptive,
// never an alarm (ADR-0025). The selected region brightens and takes a light stroke.
function regionStyle(region: AtlasRegion | undefined, isSelected: boolean, color: string): CSSProperties {
  const trained = region?.covered ?? false;
  if (!trained) {
    return {
      fill: color,
      fillOpacity: 0,
      stroke: isSelected ? "var(--color-text-primary)" : "var(--color-border-lite)",
      strokeWidth: isSelected ? 2 : 1,
      strokeDasharray: "3 3",
    };
  }
  const intensity = region?.intensity ?? 0;
  return {
    fill: color,
    fillOpacity: isSelected ? 0.95 : 0.22 + 0.6 * intensity,
    stroke: isSelected ? "var(--color-text-primary)" : color,
    strokeWidth: isSelected ? 2 : 1,
  };
}

function renderShape(shape: Shape, key: number, style: CSSProperties) {
  switch (shape.t) {
    case "ellipse":
      return <ellipse key={key} cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} style={style} />;
    case "rect":
      return (
        <rect key={key} x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.rx} style={style} />
      );
    case "path":
      return <path key={key} d={shape.d} style={style} />;
  }
}

interface AtlasBodyProps {
  view: "front" | "back";
  regionsByGroup: Map<string, AtlasRegion>;
  selectedGroup: string | null;
  onSelectGroup: (group: string) => void;
}

// One accessible body view. Each region is a `role="button"` group with a composed
// `aria-label` (from the view-model, so it names state + volume, never color) and is both
// clickable and keyboard-activatable, so the atlas is fully operable without a pointer.
export function AtlasBody({ view, regionsByGroup, selectedGroup, onSelectGroup }: AtlasBodyProps) {
  const specs = view === "front" ? FRONT : BACK;

  function onKeyDown(event: KeyboardEvent<SVGGElement>, group: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectGroup(group);
    }
  }

  return (
    <svg viewBox="0 0 140 300" className="h-auto w-full max-w-[168px] overflow-visible" role="group">
      <circle cx={70} cy={26} r={15} style={HEAD_STYLE} />
      <path d="M62 39 h16 v7 q-8 4 -16 0 z" style={HEAD_STYLE} />
      {specs.map((spec) => {
        const region = regionsByGroup.get(spec.group);
        const isSelected = selectedGroup === spec.group;
        const color = GROUP_VAR[spec.group] ?? GROUP_VAR_FALLBACK;
        const style = regionStyle(region, isSelected, color);
        return (
          <g
            key={spec.group}
            role="button"
            tabIndex={0}
            aria-label={region?.ariaLabel ?? spec.group}
            aria-pressed={isSelected}
            className="cursor-pointer"
            onClick={() => onSelectGroup(spec.group)}
            onKeyDown={(event) => onKeyDown(event, spec.group)}
          >
            {spec.shapes.map((shape, index) => renderShape(shape, index, style))}
          </g>
        );
      })}
    </svg>
  );
}
