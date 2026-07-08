import Link from "next/link";
import { ChevronRight } from "lucide-react";

import type {
  ExerciseDetail,
  RelatedExerciseSummary,
} from "@/lib/sessions-types";
import type { TopSetPoint } from "@/lib/exercise-stats-view";
import { toExecutionSteps, toMuscleEmphasis } from "@/lib/exercise-detail-view";
import { toTopSetTrend } from "@/lib/top-set-trend-view";
import { SectionHeader } from "@/components/pulse/section-header";
import { DataList } from "@/components/pulse/data-list";
import { TopSetTrendChart } from "@/components/exercise/top-set-trend-chart";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface SpecsPanelProps {
  exercise: ExerciseDetail;
  // The Top-Set series from the record side (ADR-0017), transformed into the trend
  // chart here. Empty (a bodyweight / never-logged Exercise) hides the chart entirely.
  topSetSeries: TopSetPoint[];
}

// The SPECS lens (ADR-0017): the catalog facts the detail page has always shown —
// description, difficulty / muscles / equipment, execution instructions, precautions,
// and the typed Variations / Alternatives a user can substitute toward — plus the
// Top-Set Trend, the one record-side figure this lens carries: a Personal-Record
// trajectory on the same Estimated-1RM yardstick as the stat header.
export function SpecsPanel({
  exercise,
  topSetSeries,
}: SpecsPanelProps): React.JSX.Element {
  const metaRows = [
    ...(exercise.difficulty !== null
      ? [{ label: "Difficulty", value: `${exercise.difficulty} / 10` }]
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

      <TopSetTrend series={topSetSeries} />

      <MuscleMap exercise={exercise} />

      <ExecutionSteps instructions={exercise.instructions} />

      <StringList title="PRECAUTIONS" items={exercise.precautions} />
      <RelatedList title="VARIATIONS" items={exercise.variations} />
      <RelatedList title="ALTERNATIVES" items={exercise.alternatives} />
    </div>
  );
}

// The Top-Set Trend (ADR-0017): a bar chart of the best Estimated 1RM per qualifying
// session with a `+N KG` delta pill. Honest degradation lives in `toTopSetTrend`: no
// qualifying session renders no chart at all, and a single qualifying session renders
// one bar and no pill — never a fabricated zero bar or a "+0 KG" trend.
function TopSetTrend({ series }: { series: TopSetPoint[] }) {
  const trend = toTopSetTrend(series);
  if (trend.rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <SectionHeader className="flex-1">TOP-SET TREND</SectionHeader>
        {trend.delta ? <Badge variant="cyan">{trend.delta}</Badge> : null}
      </div>
      <Card className="p-5">
        <TopSetTrendChart rows={trend.rows} />
      </Card>
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

// The SPECS muscle map (ADR-0016). A populated Primary/Secondary split renders
// PRIMARY and SECONDARY sub-sections; an Exercise that asserts no split falls back
// to a flat targeted-muscle row. No Exercise ever shows a primacy it doesn't have —
// the honest/flat decision lives entirely in `toMuscleEmphasis`.
function MuscleMap({ exercise }: { exercise: ExerciseDetail }) {
  const emphasis = toMuscleEmphasis(exercise);
  if (emphasis.kind === "empty") return null;

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader>MUSCLES</SectionHeader>
      <Card className="flex flex-col gap-5 p-5">
        {emphasis.kind === "flat" ? (
          <MuscleChips muscles={emphasis.muscles} variant="muted" />
        ) : (
          <>
            <MuscleGroup
              label="PRIMARY"
              muscles={emphasis.primary}
              variant="magenta"
            />
            {emphasis.secondary.length > 0 ? (
              <MuscleGroup
                label="SECONDARY"
                muscles={emphasis.secondary}
                variant="muted"
              />
            ) : null}
          </>
        )}
      </Card>
    </div>
  );
}

function MuscleGroup({
  label,
  muscles,
  variant,
}: {
  label: string;
  muscles: string[];
  variant: "magenta" | "muted";
}) {
  if (muscles.length === 0) return null;
  return (
    <div className="flex flex-col gap-2.5">
      <span className="label-mono text-[10px] tracking-wider text-text-muted">
        {label}
      </span>
      <MuscleChips muscles={muscles} variant={variant} />
    </div>
  );
}

function MuscleChips({
  muscles,
  variant,
}: {
  muscles: string[];
  variant: "magenta" | "muted";
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {muscles.map((muscle) => (
        <Badge key={muscle} variant={variant}>
          {muscle}
        </Badge>
      ))}
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
