import Link from "next/link";
import { ChevronRight } from "lucide-react";

import type {
  ExerciseDetail,
  RelatedExerciseSummary,
} from "@/lib/sessions-types";
import { toExecutionSteps } from "@/lib/exercise-detail-view";
import { SectionHeader } from "@/components/pulse/section-header";
import { DataList } from "@/components/pulse/data-list";
import { Card } from "@/components/ui/card";

interface SpecsPanelProps {
  exercise: ExerciseDetail;
}

// The SPECS lens (ADR-0017): the catalog facts the detail page has always shown —
// description, difficulty / muscles / equipment, execution instructions,
// precautions, and the typed Variations / Alternatives a user can substitute
// toward. Purely the honest catalog read; no record-side figures live here.
export function SpecsPanel({ exercise }: SpecsPanelProps): React.JSX.Element {
  const metaRows = [
    ...(exercise.difficulty !== null
      ? [{ label: "Difficulty", value: `${exercise.difficulty} / 10` }]
      : []),
    ...(exercise.targeted_muscles.length > 0
      ? [{ label: "Muscles", value: exercise.targeted_muscles.join(", ") }]
      : []),
    ...(exercise.required_equipment.length > 0
      ? [{ label: "Equipment", value: exercise.required_equipment.join(", ") }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-7">
      {exercise.description ? (
        <p className="font-sans text-[15px] leading-relaxed text-text-secondary">
          {exercise.description}
        </p>
      ) : null}

      {metaRows.length > 0 ? (
        <Card className="p-5">
          <DataList rows={metaRows} />
        </Card>
      ) : null}

      <ExecutionSteps instructions={exercise.instructions} />

      <StringList title="PRECAUTIONS" items={exercise.precautions} />
      <RelatedList title="VARIATIONS" items={exercise.variations} />
      <RelatedList title="ALTERNATIVES" items={exercise.alternatives} />
    </div>
  );
}

// Execution Steps (ADR-0015): two or more authored steps render as a numbered
// `01…0N` list; a single step renders as an un-numbered guidance block (never a
// lone "01", which reads as a bug). The rendered count always equals what the
// author wrote — the honest/fabricated decision lives in `toExecutionSteps`.
function ExecutionSteps({ instructions }: { instructions: string[] }) {
  const steps = toExecutionSteps(instructions);
  if (steps.kind === "empty") return null;

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader>HOW TO PERFORM</SectionHeader>
      {steps.kind === "single" ? (
        <Card className="p-5">
          <p className="font-sans text-[14px] leading-relaxed text-text-secondary">
            {steps.step}
          </p>
        </Card>
      ) : (
        <Card className="flex flex-col gap-4 p-5">
          {steps.steps.map((step) => (
            <div key={step.ordinal} className="flex items-start gap-3">
              <span className="label-mono mt-0.5 shrink-0 text-[12px] text-magenta">
                {step.ordinal}
              </span>
              <span className="font-sans text-[14px] leading-relaxed text-text-secondary">
                {step.text}
              </span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function StringList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-4">
      <SectionHeader>{title}</SectionHeader>
      <Card className="flex flex-col gap-2 p-5">
        {items.map((item) => (
          <div key={item} className="flex items-start gap-2.5">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-magenta" />
            <span className="font-sans text-[14px] leading-relaxed text-text-secondary">
              {item}
            </span>
          </div>
        ))}
      </Card>
    </div>
  );
}

function RelatedList({
  title,
  items,
}: {
  title: string;
  items: RelatedExerciseSummary[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-4">
      <SectionHeader meta={`${items.length}`}>{title}</SectionHeader>
      <Card className="divide-y divide-border overflow-hidden py-0">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/exercises/${item.id}`}
            className="group flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-elevated/50"
          >
            <span className="font-sans text-[14px] text-text-primary">
              {item.name}
            </span>
            <ChevronRight className="h-[18px] w-[18px] text-text-muted transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </Card>
    </div>
  );
}
