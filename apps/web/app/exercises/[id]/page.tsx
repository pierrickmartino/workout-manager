import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ChevronRight } from "lucide-react";

import { fetchExercise } from "@/lib/sessions";
import type {
  ExerciseDetail,
  RelatedExerciseSummary,
} from "@/lib/sessions-types";
import { PageHeader } from "@/components/pulse/page-header";
import { SectionHeader } from "@/components/pulse/section-header";
import { DataList } from "@/components/pulse/data-list";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

// The enriched detail of a single catalog Exercise: description, execution
// instructions, targeted muscles, difficulty, required equipment, precautions,
// and the typed Variations / Alternatives a user can substitute toward. The
// catalog is global, but the API still requires authentication.
export default async function ExercisePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const exerciseId = Number(id);
  if (!Number.isInteger(exerciseId)) notFound();

  const envelope = await fetchExercise(exerciseId);
  if (!envelope.success || !envelope.data) {
    notFound();
  }

  const exercise = envelope.data;

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
    <section className="flex flex-col gap-7">
      <PageHeader
        overline="PULSE // EXERCISE"
        title={exercise.name}
        action={
          exercise.provenance === "ai_generated" ? (
            <Badge variant="magenta" title="AI-generated, not yet reviewed">
              AI-GEN
            </Badge>
          ) : (
            <Badge variant="cyan">CURATED</Badge>
          )
        }
      />

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

      {exercise.instructions ? (
        <div className="flex flex-col gap-4">
          <SectionHeader>HOW TO PERFORM</SectionHeader>
          <Card className="p-5">
            <p className="whitespace-pre-line font-sans text-[14px] leading-relaxed text-text-secondary">
              {exercise.instructions}
            </p>
          </Card>
        </div>
      ) : null}

      <StringList title="PRECAUTIONS" items={exercise.precautions} />
      <RelatedList title="VARIATIONS" items={exercise.variations} />
      <RelatedList title="ALTERNATIVES" items={exercise.alternatives} />

      <Link
        href={`/exercises/${exercise.id}/progress`}
        className={buttonVariants({
          variant: "secondary",
          className: "w-full",
        })}
      >
        View your progress
        <ArrowRight className="h-4 w-4" />
      </Link>
    </section>
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

export type { ExerciseDetail };
