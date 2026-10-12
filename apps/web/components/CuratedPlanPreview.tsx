import { SectionHeader } from "@/components/pulse/section-header";
import type { CuratedPlanView } from "@/lib/curated-plan-preview";

interface CuratedPlanPreviewProps {
  plan: CuratedPlanView;
}

// The fully enumerated plan a Curated Protocol adopt would write (issue #685): every Week/Day
// Session with each Prescription's dose, the Load to be written and its Progression Scheme.
export function CuratedPlanPreview({ plan }: CuratedPlanPreviewProps): React.JSX.Element {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <SectionHeader>PLAN PREVIEW</SectionHeader>
        {/* Not the divider's `meta`: that never wraps, and at 200% text it overflows 320px. */}
        <p className="font-mono text-[12px] text-text-secondary">{plan.summary}</p>
      </div>
      {plan.weeks.map((week) => (
        <div key={week.week} className="flex flex-col gap-4">
          <SectionHeader level={3}>{week.heading}</SectionHeader>
          {week.sessions.map((session) => (
            <div key={session.key} className="flex flex-col gap-1.5">
              <h4 className="min-w-0 break-words font-sans text-sm font-semibold text-text-primary">
                {session.heading}
              </h4>
              <ul className="flex flex-col gap-1.5">
                {session.lines.map((line) => (
                  <li
                    key={line.key}
                    className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5"
                  >
                    <span className="min-w-0 break-words font-sans text-sm text-text-primary">
                      {line.exercise}
                    </span>
                    <span className="min-w-0 break-words font-mono text-[12px] text-text-secondary">
                      {line.dose} · {line.load} · {line.scheme}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
