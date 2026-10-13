import { Alert } from "@/components/pulse/alert";
import type { CuratedNotice as CuratedNoticeContent } from "@/lib/curated-protocol-view";

// A titled notice on a Curated Protocol's adopt page: the Sensitive Constraint caveat (issue
// #687), or the lifts a wave Curated Protocol needs a logged set of first (issue #694).
export function CuratedNotice({ notice }: { notice: CuratedNoticeContent }): React.JSX.Element {
  return (
    <Alert tone="info">
      <span className="flex flex-col gap-1">
        <strong className="font-semibold text-text-primary">{notice.title}</strong>
        <span>{notice.body}</span>
      </span>
    </Alert>
  );
}
