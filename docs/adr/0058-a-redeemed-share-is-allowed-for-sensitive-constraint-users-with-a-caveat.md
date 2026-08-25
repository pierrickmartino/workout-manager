# 0058 — A Redeemed Share is allowed for Sensitive-Constraint users, with a mandatory caveat

Sharing a Session hands one user a plan built for another (ADR-0057). ADR-0003 is
emphatic on the neighbouring case: *a user with any Sensitive Constraint (injury,
rehab, postpartum, medical) is never served a shared/cached Generated artifact — the
system always generates fresh* so postnatal/rehab caution can be applied. A **Redeem**
is, almost literally, *shared generation*, so the strict reading of ADR-0003 would
**block** a Sensitive-Constraint user from redeeming. We deliberately do **not** block
it. A Redeemed Share is **allowed for everyone**, but a received Share carries a
**mandatory caveat** — *built for another user, not tailored to your constraints* — is
**never auto-promoted** into generation or a Current Protocol, and never claims to be
safety-checked for the recipient. This ADR records the carve-out.

**Why the automatic bypass does not govern Share.** ADR-0003's rule is about the
*system silently serving* cached/shared content on a cache hit — an invisible
substitution the user never chose. A **Share** is the opposite: a **deliberate,
attributed, person-to-person** act. The recipient chose to open a specific person's
link and take a copy, and the copy names its **Author**. Treating that like a silent
cache hit — and hard-blocking it — punishes an informed choice between two real
people. And a redeemed plan the recipient merely saves is **inert**: it prescribes
nothing until they choose to run it, so the danger point is *starting* it, not
*holding* it.

**Why a caveat is nonetheless load-bearing, not cosmetic.** The genuine risk runs one
way: a recipient **with** a Sensitive Constraint accepting a plan whose loads or
movements are contraindicated for their injury/rehab/postpartum state. The domain's
whole safety posture is that such users get *fresh, tailored* plans. So a received
Share must never **masquerade as tailored**: the caveat is always shown, the plan is
kept out of any flow that would treat it as a fresh generation (it is not fed to
generation, and it does not become the Current Protocol on its own), and Redeem is the
one path that surfaces this notice. The safety guarantee is preserved not by refusing
the copy but by refusing to *dress it up* as something generated for the recipient.

## Considered options

- **Block receipt for Sensitive-Constraint users (strict ADR-0003)** — rejected:
  conflates a deliberate person-to-person act with a silent cache hit, punishes an
  informed choice, and gains little safety, since a saved-but-unrun plan is inert.
- **Block sending from Sensitive-Constraint users** — rejected: a rehab/postpartum
  plan is generally *gentler*, not the hazard; and forbidding a user to share their own
  workout is a surprising restriction with little safety payoff.
- **Allow silently, no caveat** — rejected: this is the actually dangerous option — a
  generic plan reaching an injured recipient with no signal that it was not built for
  them, exactly what ADR-0003 exists to prevent.

## Consequences

- **ADR-0003 is unchanged for generation.** The automatic cache-bypass still forces a
  fresh generation for Sensitive-Constraint users on the *generation* path. Share is a
  separate, deliberate path with its own rule; the two do not interact.
- **The caveat is a hard requirement of the Redeem UI**, not an optional nicety — a
  received Share is rendered with its "built for another user" notice wherever it is
  first surfaced to the recipient.
- **A received Share never auto-enters the active flow.** It lands in **My Sessions**
  as an ordinary owned standalone Session; it is never silently made the Current
  Protocol and is never treated as a fresh generation.
- **This is the domain's first deliberate deviation from the ADR-0003 safety default**,
  and is confined to the Share path — worth writing down precisely because a future
  reader will otherwise read it as an ADR-0003 violation rather than a considered
  carve-out.
