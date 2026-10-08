import type { AnchorHTMLAttributes } from "react";

// Like `next/link`, the stub consumes `transitionTypes` rather than forwarding it to the
// anchor: it is a router instruction, not an HTML attribute (ADR-0121). The
// `data-nav-direction` attribute that travels with it does reach the DOM, as it does in Next.
type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { transitionTypes?: string[] };

export default function Link({ transitionTypes: _transitionTypes, ...props }: LinkProps) {
  return <a {...props} />;
}
