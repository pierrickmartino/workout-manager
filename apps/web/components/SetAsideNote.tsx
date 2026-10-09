import Link from "next/link";

import { Alert } from "@/components/pulse/alert";
import type { SetAsideNote as SetAsideNoteModel } from "@/lib/protocol-supersede";

// The short, non-blocking note a freshly adopted Protocol shows when generating it set the
// previous Current Protocol aside (ADR-0125). It replaced the generate-time confirmation:
// superseding can be undone by a Switch, so the user is told where the old Protocol went
// rather than asked whether to let it go. `announce` makes it a polite `status` region, so
// assistive tech hears it without focus moving. The label is an authored name and can be
// 120 unbroken characters: `wrap-anywhere`, not `break-words`, because only it lets the
// Alert's flex item shrink below that word's width (ADR-0085).
export function SetAsideNote({ note }: { note: SetAsideNoteModel }): React.JSX.Element {
  return (
    <Alert announce tone="info">
      <span className="wrap-anywhere">
        “{note.label}” is set aside. You can switch back to it from{" "}
        <Link href={note.href} className="text-cyan underline-offset-2 hover:underline">
          Protocols
        </Link>
        .
      </span>
    </Alert>
  );
}
