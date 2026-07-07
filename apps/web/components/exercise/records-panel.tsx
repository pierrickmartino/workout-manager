import { Card } from "@/components/ui/card";

// The RECORDS lens (ADR-0017): the PR-setting sets for this Exercise, drawn from the
// shipped Estimated-1RM / PR engine. That read lands in a later F6 slice; this slice
// ships an honest empty placeholder so the tab renders without error or fabrication.
export function RecordsPanel(): React.JSX.Element {
  return (
    <Card className="flex flex-col items-start gap-2 p-6">
      <p className="font-sans text-sm text-text-secondary">
        Your Personal Records for this exercise will appear here.
      </p>
      <p className="label-mono text-[11px] text-text-muted">ARRIVING SOON</p>
    </Card>
  );
}
