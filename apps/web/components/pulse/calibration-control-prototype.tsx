"use client";

// PROTOTYPE — throwaway (branch `prototype/calibration-widget`). Question: what should the
// Home Calibration control look like? Three structurally different variants, plus the current
// control for comparison, on the real `/dashboard` route, switched by `?variant=`.
//
// Variants A–C are wired to a **stub**: the offset lives in memory here and nothing is posted,
// so tapping around never re-pitches a real plan. `current` is the shipped component and still
// posts for real. The offset is kept across switches, so every variant can be judged at the
// same state — take it to a rail (−3 / +3) to see how each one explains itself.

import { useState, useTransition } from "react";

import type { ProtocolProgress } from "@/lib/protocols-types";
import { calibrationControlView } from "@/lib/calibration-control";
import { CalibrationControl } from "@/components/pulse/calibration-control";
import { Card } from "@/components/ui/card";
import {
  PrototypeSwitcher,
  type PrototypeVariant,
} from "@/components/prototype/prototype-switcher";
import {
  VariantPrompt,
  VariantStepper,
  VariantTrack,
} from "@/components/pulse/calibration-control-prototype-variants";

const VARIANTS: readonly PrototypeVariant[] = [
  { key: "current", name: "Shipped control" },
  { key: "A", name: "Stepper" },
  { key: "B", name: "Track" },
  { key: "C", name: "Feel check" },
];

const STUB_LATENCY_MS = 350;

interface CalibrationControlPrototypeProps {
  protocol: ProtocolProgress;
  variant: string;
}

export function CalibrationControlPrototype({
  protocol,
  variant,
}: CalibrationControlPrototypeProps): React.JSX.Element {
  const [offset, setOffset] = useState<number>(protocol.calibration);
  const [isPending, startTransition] = useTransition();
  const key = VARIANTS.some((entry) => entry.key === variant) ? variant : "current";

  const view = calibrationControlView({ ...protocol, calibration: offset });

  function pick(target: number | null): void {
    if (target === null) {
      return;
    }
    startTransition(async () => {
      await new Promise((resolve) => setTimeout(resolve, STUB_LATENCY_MS));
      setOffset(target);
    });
  }

  const sign = view.value > 0 ? "+" : view.value < 0 ? "−" : "±";
  const state =
    key === "current"
      ? `real control · server offset ${protocol.calibration}`
      : `stub offset ${sign}${Math.abs(view.value)} · bounds ${protocol.calibration_min}…${protocol.calibration_max}${isPending ? " · posting" : ""}`;

  return (
    <>
      {key === "current" ? (
        <Card className="p-5">
          <CalibrationControl protocol={protocol} />
        </Card>
      ) : null}
      {key === "A" ? <VariantStepper view={view} busy={isPending} onPick={pick} /> : null}
      {key === "B" ? <VariantTrack view={view} busy={isPending} onPick={pick} /> : null}
      {key === "C" ? <VariantPrompt view={view} busy={isPending} onPick={pick} /> : null}
      <PrototypeSwitcher variants={VARIANTS} current={key} state={state} />
    </>
  );
}
