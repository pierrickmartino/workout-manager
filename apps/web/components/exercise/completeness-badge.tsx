import { Badge } from "@/components/ui/badge";
import { completenessBadge } from "@/lib/exercise-completeness";

// The Catalog Completeness marker (ADR-0041): a Stub | Listable | Enriched pill shown
// beside the Provenance marker wherever the catalog is read — the Exercise Library and
// the Exercise Detail header. Presentation comes entirely from the pure
// `completenessBadge` view-model; this component only renders it. When the view-model
// yields nothing to show (an absent or unrecognized state), the badge is omitted
// rather than faked — completeness is a distinct axis from trust and never invented.
export function CompletenessBadge({
  completeness,
}: {
  completeness: string | undefined;
}): React.JSX.Element | null {
  const badge = completenessBadge(completeness);
  if (!badge) return null;
  return (
    <Badge variant={badge.variant} title={badge.title}>
      {badge.label}
    </Badge>
  );
}
