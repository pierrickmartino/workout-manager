"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

import type { FitnessLevelStanding } from "@/lib/profile-progress-types";
import { toFitnessLevelVisualRows } from "@/lib/fitness-level-visual.prototype";
import { replaceFilterQuery } from "@/lib/filter-url";
import { FitnessLevelStandings } from "@/components/pulse/fitness-level-standings";
import { toFitnessLevelRows } from "@/lib/fitness-level-standing";
import { FitnessLevelRail } from "@/components/prototype/fitness-level-rail.prototype";
import { FitnessLevelDials } from "@/components/prototype/fitness-level-dials.prototype";
import { FitnessLevelLadder } from "@/components/prototype/fitness-level-ladder.prototype";
import {
  PrototypeSwitcher,
  type PrototypeVariant,
} from "@/components/prototype/prototype-switcher";

// PROTOTYPE — THROWAWAY. Four renderings of the Profile view’s Fitness Level section on the
// real `/profile` route, switchable with `?variant=`:
//
//   ?variant=0 — Shipped: the "6/10" number pair (the baseline being argued with)
//   ?variant=A — Two-zone rail: one ten-notch rail per type, declared zone + earned zone
//   ?variant=B — Dial grid: five gauges, declared arc + earned arc
//   ?variant=C — Comparative ladder: one figure, a shared axis, a column per type
//
// Mounted in the page it belongs to on purpose: a section judged on its own looks fine in any
// shape. Next to the Operator Level badge, the Lifetime bento and the Heatmap, the question
// "does this read as an instrument the rest of the screen agrees with" is answerable.

const VARIANTS: readonly PrototypeVariant[] = [
  { key: "0", name: "Shipped (6/10)" },
  { key: "A", name: "Two-zone rail" },
  { key: "B", name: "Dial grid" },
  { key: "C", name: "Comparative ladder" },
];

const PARAM = "variant";

export function FitnessLevelPrototype({
  standings,
}: {
  standings: FitnessLevelStanding[];
}): React.JSX.Element {
  // Seeded once from the URL, then owned locally and mirrored back with `replaceState`
  // (ADR-0100): a router push would re-run the Server Component and re-fetch the whole
  // Profile on every flip, which makes two variants impossible to compare.
  const initialParams = useSearchParams();
  const [variant, setVariant] = React.useState(() => {
    const requested = initialParams.get(PARAM);
    return VARIANTS.some((entry) => entry.key === requested) && requested !== null
      ? requested
      : "A";
  });

  React.useEffect(() => {
    replaceFilterQuery(new URLSearchParams({ [PARAM]: variant }));
  }, [variant]);

  const rows = React.useMemo(
    () => toFitnessLevelVisualRows(standings),
    [standings],
  );

  return (
    <>
      {variant === "0" ? (
        <FitnessLevelStandings rows={toFitnessLevelRows(standings)} />
      ) : null}
      {variant === "A" ? <FitnessLevelRail rows={rows} /> : null}
      {variant === "B" ? <FitnessLevelDials rows={rows} /> : null}
      {variant === "C" ? <FitnessLevelLadder rows={rows} /> : null}
      <PrototypeSwitcher
        variants={VARIANTS}
        current={variant}
        onChange={setVariant}
      />
    </>
  );
}
