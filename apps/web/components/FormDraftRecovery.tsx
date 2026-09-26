import type { FormDraftRecovery as Recovery } from "@/lib/use-form-draft";
import { Alert } from "@/components/pulse/alert";
import { Button } from "@/components/ui/button";

export function FormDraftRecovery({ recovery }: { recovery: Recovery | null }) {
  if (!recovery) return null;
  return (
    <Alert tone="info">
      <div className="flex flex-col gap-3">
        <p>Unsaved fields from this account are available on this device.</p>
        <div className="flex gap-2">
          <Button type="button" onClick={recovery.restore}>Restore draft</Button>
          <Button type="button" variant="secondary" onClick={recovery.discard}>
            Discard draft
          </Button>
        </div>
      </div>
    </Alert>
  );
}
