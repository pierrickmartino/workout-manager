import { useMemo, useState, type KeyboardEvent } from "react";

import type { MuscleRegion } from "@/lib/muscle-region-atlas-view";
import type { Figure } from "@/lib/atlas/atlas-geometry";
import type { ReferenceHalf } from "@/lib/atlas/reference/reference-data";
import {
  AnatomyOnly,
  AtlasSvg,
  MuscleShape,
  atlasArtwork,
  overlayStyle,
} from "./static-atlas-figure";

// The interactive reference Muscle Atlas figure: the read-only artwork (`static-atlas-figure`)
// with every named muscle made a control. The reference's coarse regions map to our canonical
// Muscle vocabulary (reference-muscle-map), so a tap opens the same drawer and the same
// aria-label as the rest of the atlas. Hover and focus brighten a muscle; the selected one is
// outlined.

interface ReferenceAtlasFigureProps {
  figure: Figure;
  half: ReferenceHalf;
  regionsByMuscle: Map<string, MuscleRegion>;
  selectedMuscle: string | null;
  onSelectMuscle: (muscle: string) => void;
}

export function ReferenceAtlasFigure({
  figure,
  half,
  regionsByMuscle,
  selectedMuscle,
  onSelectMuscle,
}: ReferenceAtlasFigureProps) {
  const { viewBox, groups } = useMemo(() => atlasArtwork(figure, half), [figure, half]);
  const [active, setActive] = useState<string | null>(null);

  function clearActive(muscle: string) {
    setActive((current) => (current === muscle ? null : current));
  }

  function onKeyDown(event: KeyboardEvent<SVGGElement>, muscle: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectMuscle(muscle);
    }
  }

  return (
    <AtlasSvg viewBox={viewBox}>
      {groups.map((group) => {
        if (!group.canonical) return <AnatomyOnly key={group.key} group={group} />;
        const canonical = group.canonical;
        const region = regionsByMuscle.get(canonical);
        const isSelected = selectedMuscle === canonical;
        const overlay = overlayStyle(region, isSelected, active === canonical);
        return (
          <g
            key={group.key}
            role="button"
            tabIndex={0}
            aria-label={region?.ariaLabel ?? canonical}
            aria-pressed={isSelected}
            // `atlas-region` is what the drawn focus ring below keys on. The
            // `outline-none` beside it is only defensible *because* that ring exists
            // (ADR-0104).
            className="atlas-region cursor-pointer outline-none"
            onClick={() => onSelectMuscle(canonical)}
            onKeyDown={(event) => onKeyDown(event, canonical)}
            onFocus={() => setActive(canonical)}
            onBlur={() => clearActive(canonical)}
            onPointerEnter={(event) => {
              if (event.pointerType !== "touch") setActive(canonical);
            }}
            onPointerLeave={() => clearActive(canonical)}
          >
            {group.paths.map((p, i) => (
              <MuscleShape key={i} d={p.d} overlay={overlay}>
                {/* The focus indicator (ADR-0104): a stroke-only copy of this path, styled
                    from `globals.css` and invisible until the region takes focus from the
                    keyboard. It is a third path rather than a stroke on the overlay, because
                    that one's stroke is an inline style — which no stylesheet rule can
                    override — and is already in use for the selected and hovered states. */}
                {/* No `fillRule`: the ring has no fill for a rule to apply to. */}
                <path d={p.d} className="atlas-region-ring" aria-hidden />
              </MuscleShape>
            ))}
          </g>
        );
      })}
    </AtlasSvg>
  );
}
