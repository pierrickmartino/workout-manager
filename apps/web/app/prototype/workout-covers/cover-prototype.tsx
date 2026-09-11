"use client";

// PROTOTYPE — throwaway. Wires the three cover variants to ?variant= and mounts the floating
// switcher. Read-only, mock data only: the question is "what should a workout cover look like?",
// not whether anything persists.

import { useSearchParams } from "next/navigation";

import { PageHeader } from "@/components/pulse/page-header";
import {
  PrototypeSwitcher,
  type VariantMeta,
} from "@/app/prototype/workout-covers/prototype-switcher";
import { VariantA } from "@/app/prototype/workout-covers/variants/variant-a";
import { VariantB } from "@/app/prototype/workout-covers/variants/variant-b";
import { VariantC } from "@/app/prototype/workout-covers/variants/variant-c";

const VARIANTS: VariantMeta[] = [
  { key: "A", name: "Signature Blocks" },
  { key: "B", name: "Geometric Sigil" },
  { key: "C", name: "Strata" },
];

export function CoverPrototype(): React.JSX.Element {
  const params = useSearchParams();
  const requested = (params.get("variant") ?? "A").toUpperCase();
  const current = VARIANTS.some((variant) => variant.key === requested) ? requested : "A";

  return (
    <section className="flex flex-col gap-7">
      <PageHeader
        overline="PROTOTYPE // WORKOUT COVERS"
        title="Recognizable covers"
      />
      <p className="font-mono text-[12px] leading-relaxed text-text-muted">
        Throwaway prototype — three cover treatments across the four surfaces (Dashboard · My
        sessions · Training hub · Session detail). Marks are generated deterministically from the
        workout id + exercise list, so the two <span className="text-text-secondary">Calisthenics</span>{" "}
        entries in “My sessions” read differently. Tap any cover to reveal its signature. Cycle
        treatments with the bar below (or ← / →).
      </p>

      {current === "A" && <VariantA />}
      {current === "B" && <VariantB />}
      {current === "C" && <VariantC />}

      <PrototypeSwitcher variants={VARIANTS} current={current} />
    </section>
  );
}
