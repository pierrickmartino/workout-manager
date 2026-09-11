import { WifiOff } from "lucide-react";

interface OfflineNoticeProps {
  // What the user can't do right now and why — e.g. "Generating a session needs a
  // connection." Kept caller-supplied so each network-only action explains itself.
  children: React.ReactNode;
}

// A slim inline note for a network-only action that is unavailable offline (issue #414):
// AI generation and Catalog search are annotated (and their controls disabled) *before*
// submit, so the user never fires a request that can only fail after the fact. Purely
// presentational — the caller reads connectivity (lib/use-connectivity) and renders this
// only while offline.
export function OfflineNotice({ children }: OfflineNoticeProps): React.JSX.Element {
  return (
    <p className="flex items-center gap-2 rounded-sm border border-border bg-surface px-3 py-2 font-mono text-[12px] text-text-muted">
      <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
