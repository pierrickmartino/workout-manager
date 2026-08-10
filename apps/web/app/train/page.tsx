import Link from "next/link";
import { LibraryBig } from "lucide-react";

import { GenerateTrainingLaunchpad } from "@/components/pulse/generate-training-launchpad";
import { PageHeader } from "@/components/pulse/page-header";
import { BackLink } from "@/components/pulse/back-link";
import { buttonVariants } from "@/components/ui/button";

// The TRAIN tab's landing page: the two ways to start new training — a full
// multi-week Protocol or a standalone workout. Previously the TRAIN tab jumped
// straight into the standalone-workout form, so protocol generation had no home in
// the global nav once a Current Protocol existed (ADR-0037). This launchpad restores
// the protocol entry point everywhere, not just the Home empty state.
export default function TrainPage() {
  return (
    <section className="flex flex-col gap-6">
      <PageHeader overline="PULSE // TRAIN" title="Start new training" />
      <p className="font-mono text-[13px] leading-relaxed text-text-muted">
        Generate a full multi-week protocol or a single standalone workout — or log a
        past workout you did yourself, no AI.
      </p>
      <GenerateTrainingLaunchpad
        eyebrow="TRAIN // START SOMETHING NEW"
        showLogPastWorkout
      />

      {/* Discovery, distinct from generation: browse the whole shared Catalog to find
          movements, without starting a plan (ADR-0042). */}
      <div className="flex flex-col gap-2">
        <span className="label-mono text-[11px] text-text-muted">
          TRAIN // EXPLORE
        </span>
        <Link
          href="/exercises"
          className={buttonVariants({ variant: "secondary", className: "w-full" })}
        >
          <LibraryBig className="h-4 w-4" />
          Browse the exercise catalog
        </Link>
      </div>

      <BackLink href="/dashboard">Back to dashboard</BackLink>
    </section>
  );
}
