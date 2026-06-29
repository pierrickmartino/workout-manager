// The loading/progress indicator shown while a Program generation runs off the
// request path. It is an accessible live region with an indeterminate progress
// bar; the reassurance copy reflects that the worker completes the job server-side
// even if the mobile connection drops (Slice 7, ADR-0005).

const noteStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: "0.875rem",
};

export function GenerationProgress() {
  return (
    <div role="status" aria-live="polite">
      <p>
        Generating your program… a multi-week plan can take a moment to build.
      </p>
      <progress aria-label="Generating program" style={{ width: "100%" }} />
      <p style={noteStyle}>
        You can keep this page open — generation continues on our side even if
        your connection drops, and your program will be waiting when it&apos;s
        done.
      </p>
    </div>
  );
}
