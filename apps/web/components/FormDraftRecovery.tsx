import type { FormDraftRecovery as Recovery } from "@/lib/use-form-draft";
import { Alert } from "@/components/pulse/alert";
import { Button } from "@/components/ui/button";

export function FormDraftRecovery({ recovery, storageFailed = false }: {
  recovery: Recovery | null;
  storageFailed?: boolean;
}) {
  if (storageFailed) return (
    <Alert tone="error" announce>
      Your draft could not be saved on this device. Keep this page open until you save;
      reloading or closing it may lose your unsaved fields.
    </Alert>
  );
  if (!recovery) return null;
  return (
    <Alert tone="info" announce>
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
