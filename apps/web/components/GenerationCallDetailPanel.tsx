import { Alert } from "@/components/pulse/alert";
import { SectionHeader } from "@/components/pulse/section-header";
import { CallFact, GenerationCallHeadline } from "@/components/GenerationCallParts";
import type { GenerationCallDetailView } from "@/lib/admin-generation-call-detail-view";

interface GenerationCallDetailPanelProps {
  detail: GenerationCallDetailView;
}

// One call on the admin AI audit log, in full (issue #731, ADR-0135): its metadata, then the
// error (failures only), the system prompt, the user prompt and the output. The facts wrap
// rather than scroll at 320px and 200% text; each text block wraps long lines and scrolls
// vertically inside a box capped to the viewport, so a long prompt never pushes the page
// sideways and the box stays wholly visible at 200% text.
export function GenerationCallDetailPanel({
  detail,
}: GenerationCallDetailPanelProps): React.JSX.Element {
  const { call } = detail;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 font-mono text-[13px]">
        <GenerationCallHeadline call={call} />
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
          <CallFact label="User" value={call.userLabel} />
          <CallFact label="Model" value={call.servedBy} />
          <CallFact label="Schema" value={detail.schemaLabel} />
          <CallFact label="Tokens in" value={call.inputTokensLabel} />
          <CallFact label="Tokens out / max" value={detail.tokenBudgetLabel} />
          <CallFact label="Latency" value={call.latencyLabel} />
        </dl>
        {detail.hitTokenBudget ? (
          <Alert tone="error">
            The output used its whole token budget, so it was most likely cut off.
          </Alert>
        ) : null}
      </div>

      {detail.errorMessage !== null ? (
        <TextSection title="Error" text={detail.errorMessage} />
      ) : null}
      <TextSection title="System prompt" text={detail.systemPrompt} />
      <TextSection title="User prompt" text={detail.userPrompt} />
      <TextSection title="Output" text={detail.outputText ?? "No output."} />
    </div>
  );
}

interface TextSectionProps {
  title: string;
  text: string;
}

// A scrollable monospace block. It is a focusable region so a keyboard reader can scroll it.
function TextSection({ title, text }: TextSectionProps): React.JSX.Element {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader>{title}</SectionHeader>
      <pre
        tabIndex={0}
        aria-label={title}
        className="max-h-[60dvh] overscroll-contain select-text overflow-y-auto whitespace-pre-wrap break-words rounded-sm border border-border bg-base/40 p-3 font-mono text-[12px] leading-relaxed text-text-primary focus-visible:outline-2 focus-visible:outline-cyan"
      >
        {text}
      </pre>
    </section>
  );
}
