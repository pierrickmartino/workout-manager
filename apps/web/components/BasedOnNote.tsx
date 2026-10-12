import { basedOnLabel, type CuratedLineage } from "@/lib/curated-lineage";

interface BasedOnNoteProps {
  // The plan's curated lineage off the Protocol or Session read; null/absent for none.
  lineage: CuratedLineage | null | undefined;
}

// The "Based on <name>" line under a Protocol's or Session's title, crediting the Curated
// Protocol it was adopted from (ADR-0130, issue #688). Renders nothing for a plan with no
// curated lineage. Quiet secondary text, like the Author byline. The name is authored content
// and can be long and unbroken, so it wraps anywhere rather than overflowing (ADR-0085).
export function BasedOnNote({ lineage }: BasedOnNoteProps): React.JSX.Element | null {
  const label = basedOnLabel(lineage);
  if (label === null) return null;
  return (
    <p className="-mt-4 font-sans text-[13px] text-text-secondary wrap-anywhere">{label}</p>
  );
}
