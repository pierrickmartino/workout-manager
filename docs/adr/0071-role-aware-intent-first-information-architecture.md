# Role-aware, intent-first information architecture

The app serves three intended audiences — AI-protocol followers, hand-made-session
authors, and admins — but the first two are **intents the same person switches between**,
not distinct accounts, while admin is a genuine orthogonal role (the Clerk `role=admin`
claim, ADR-0046). We therefore keep **one unified UI** and re-optimize its default paths so
each core intent is near-instant, rather than branching the app into two persona "modes";
and we give admin its **own `/admin` home** (reached by a conditional Profile nav row, not a
fifth tab) instead of hiding power features inside Appearance. Core intents (start next
Session, build a hand-made Session, log a past workout, re-run a recent Session) must be
reachable within a fixed click budget (start-next ≤ 1 tap, the rest ≤ 2), and rare or
destructive actions move exactly one tap behind progressive disclosure. The full plan,
per-page feature inventory, and click budget live in
[`docs/redesign-ia.md`](../redesign-ia.md).

## Considered options

- **Branching persona modes** (a distinct "AI-guided" app and "self-managed" app the user
  toggles between) — rejected: intents #1 and #2 co-occur in one person, the domain has no
  persona concept, and a mode switch *adds* a decision and a click rather than removing one.
- **A fifth, admin-only bottom tab** — rejected: a persistent tab for a role most users
  never have is a mobile-nav smell; a conditional nav row costs nothing for non-admins.

## Consequences

- Introduces **no new domain term** and **no data-model change**: "Build a workout" (author
  a plan to run later) is a new entry point over the existing Hand-Authored Session
  capability, which already allows a Session with zero Logged Sessions.
- The click budget becomes an acceptance test for the redesign's implementation.
- Global navigation is reshaped (Home gains a quick-action row and sheds duplicated
  content; a new `/admin` route appears), which is why this decision is recorded rather than
  left implicit.

## Amendment (ADR-0088): admin gets a sidebar entry at `lg:` and above

The rejection of an admin tab above reasons from **four slots in a bottom bar**: "a
persistent tab for a role most users never have is a mobile-nav smell". The desktop shell
([ADR-0088](0088-the-shell-has-two-widths.md)) introduces a sidebar, which has no slot
pressure, and admin is one of the three intents that shell exists to serve.

So at `lg:` and above an admin sees an **Admin entry in the sidebar**. Below `lg:` nothing
changes: the tab bar keeps its four tabs and admin stays one hop behind Profile, as decided
here. The entry is gated on the same server-side `role=admin` claim (ADR-0046) and is an
affordance only — the backend gates every underlying action independently.

Everything else in this ADR stands: one unified UI, intents rather than persona modes,
intent-first defaults, and the click budget. Only the *placement* of admin is amended, and
only at a width this decision did not consider.
