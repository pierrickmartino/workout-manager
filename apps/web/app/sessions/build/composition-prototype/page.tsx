"use client";

// PROTOTYPE ROUTE — throwaway, not linked from anywhere. Three layouts of the
// "visible workout composition" strip (creative-directions idea 5, screen 05),
// switchable via `?variant=A|B|C` and the ←/→ keys. Reachable at
//   /sessions/build/composition-prototype
// Sits beside the real builder (/sessions/build) for density comparison, but shares
// none of its reducer/server wiring — all state here is ephemeral stub data. Once a
// layout wins, fold it into the real builder and delete this whole `composition-*`
// set (see .claude/skills/prototype/UI.md step 6).

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

import {
  SAMPLE_SESSION,
  type PrototypePrescription,
} from "@/components/prototype/composition-data";
import {
  CompositionVariantA,
  VARIANT_A_NAME,
} from "@/components/prototype/composition-variant-a";
import {
  CompositionVariantB,
  VARIANT_B_NAME,
} from "@/components/prototype/composition-variant-b";
import {
  CompositionVariantC,
  VARIANT_C_NAME,
} from "@/components/prototype/composition-variant-c";
import {
  PrototypeSwitcher,
  type PrototypeVariant,
} from "@/components/prototype/prototype-switcher";
import { PageHeader } from "@/components/pulse/page-header";
import { BackLink } from "@/components/pulse/back-link";
import { Alert } from "@/components/pulse/alert";

const VARIANTS: PrototypeVariant[] = [
  { key: "A", name: VARIANT_A_NAME },
  { key: "B", name: VARIANT_B_NAME },
  { key: "C", name: VARIANT_C_NAME },
];

type EditableField = "sets" | "target" | "load" | "restSeconds" | "note";

export default function CompositionPrototypePage() {
  // useSearchParams needs a Suspense boundary during static rendering.
  return (
    <Suspense fallback={null}>
      <CompositionPrototype />
    </Suspense>
  );
}

function CompositionPrototype() {
  const searchParams = useSearchParams();
  const current = (searchParams.get("variant") ?? "A").toUpperCase();

  // Ephemeral stub state: the session and which exercise is focused. Defaults focus to
  // the first main-work exercise — the one a builder most likely starts editing.
  const [session, setSession] = useState<PrototypePrescription[]>(SAMPLE_SESSION);
  const [selectedId, setSelectedId] = useState<number | null>(
    () => SAMPLE_SESSION.find((p) => p.role === "main")?.id ?? SAMPLE_SESSION[0].id,
  );

  function onEditField(id: number, field: EditableField, value: string) {
    setSession((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        if (field === "sets") {
          const parsed = Number.parseInt(value, 10);
          return { ...p, sets: Number.isNaN(parsed) ? 0 : parsed };
        }
        if (field === "restSeconds") {
          if (value.trim() === "") return { ...p, restSeconds: null };
          const parsed = Number.parseInt(value, 10);
          return { ...p, restSeconds: Number.isNaN(parsed) ? null : parsed };
        }
        if (field === "note") {
          return { ...p, note: value.trim() === "" ? null : value };
        }
        return { ...p, [field]: value };
      }),
    );
  }

  const variantProps = {
    session,
    selectedId,
    onSelect: setSelectedId,
    onEditField,
  };

  return (
    <section className="flex flex-col gap-6 pb-24">
      <PageHeader overline="PROTOTYPE // COMPOSITION" title="Workout composition" />

      <Alert tone="info">
        Throwaway prototype of the builder&apos;s composition strip (idea 5). Flip
        variants with the bar below or ←/→. Roles (warm-up / main / accessories /
        cooldown) are stubbed sample data — the real feature decides how roles are
        assigned.
      </Alert>

      {current === "B" ? (
        <CompositionVariantB {...variantProps} />
      ) : current === "C" ? (
        <CompositionVariantC {...variantProps} />
      ) : (
        <CompositionVariantA {...variantProps} />
      )}

      <BackLink href="/sessions/build">Back to the real builder</BackLink>

      <PrototypeSwitcher variants={VARIANTS} current={current} />
    </section>
  );
}
