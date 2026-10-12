import { Alert } from "@/components/pulse/alert";

interface AdoptedSetAsideNoteProps {
  // The note from `curatedSetAsideNotice`, naming the Protocol just adopted set aside.
  notice: string;
}

// The Protocols index note for a Curated Protocol a Sensitive-Constraint user just adopted set
// aside (issue #687, ADR-0058): it points at the row's Switch, the one way to make it Current. The
// label is an authored name, so it wraps anywhere rather than overflowing (ADR-0085).
export function AdoptedSetAsideNote({ notice }: AdoptedSetAsideNoteProps): React.JSX.Element {
  return (
    <Alert tone="info">
      <span className="wrap-anywhere">{notice}</span>
    </Alert>
  );
}
