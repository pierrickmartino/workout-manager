// PROTOTYPE — throwaway. Client shell: reads `?variant=`, renders the chosen atlas variant, and
// mounts the floating switcher. Selection state (which muscle is open) is in memory and resets
// per variant so each design is judged from a clean slate.

"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { PrototypeSwitcher, type PrototypeVariant } from "@/components/prototype/prototype-switcher";
import { VariantA, VariantB, VariantC, REDESIGN_MUSCLE_COUNT } from "./variants";

const VARIANTS: PrototypeVariant[] = [
  { key: "A", name: "Current (baseline)" },
  { key: "B", name: "Anatomical twin" },
  { key: "C", name: "Single + rail" },
];

export function AtlasPrototypeClient() {
  const router = useRouter();
  const params = useSearchParams();
  const current = (params.get("variant") ?? "A").toUpperCase();
  const [selected, setSelected] = useState<string | null>(null);

  function onSelect(muscle: string) {
    setSelected((prev) => (prev === muscle ? null : muscle));
  }

  function onChange(key: string) {
    setSelected(null);
    router.replace(`/prototype/muscle-atlas?variant=${key}`);
  }

  const variantProps = { selected, onSelect };

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 pb-28 pt-8">
      <div className="flex flex-col gap-1">
        <p className="label-mono text-[10px] tracking-widest text-text-muted">
          PROTOTYPE // MUSCLE ATLAS REDESIGN
        </p>
        <h1 className="font-display text-2xl font-semibold text-text-primary">
          Muscle Atlas — Sasha-style redesign
        </h1>
        <p className="font-sans text-sm text-text-muted">
          Flip variants with the bar below or ← / →. Baseline draws{" "}
          <span className="text-text-secondary">a handful of tiny blobs</span>; the redesign tiles{" "}
          <span className="text-text-secondary">{REDESIGN_MUSCLE_COUNT} contiguous muscles</span>{" "}
          with striations over the same coverage data.
        </p>
      </div>

      {current === "B" ? (
        <VariantB {...variantProps} />
      ) : current === "C" ? (
        <VariantC {...variantProps} />
      ) : (
        <VariantA {...variantProps} />
      )}

      <PrototypeSwitcher variants={VARIANTS} current={current} onChange={onChange} />
    </main>
  );
}
