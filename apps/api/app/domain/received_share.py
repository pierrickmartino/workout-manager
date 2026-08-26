"""The Received-Share safety caveat — a pure domain rule (ADR-0058).

Sharing hands one user a plan built for another (ADR-0057). ADR-0003 forces a *fresh*
generation for any user with a **Sensitive Constraint** (injury, rehab, postpartum, flagged
medical) and never serves them shared/cached content — and a Redeem is, almost literally,
*shared generation*. ADR-0058 is the deliberate carve-out: the Redeem is **never blocked**,
but a redeemer **with** a Sensitive Constraint receives the copy under a **mandatory caveat**
— it is *built for another user, not tailored to your constraints*, and is never auto-promoted
into generation or a Current Protocol.

This module owns only the *decision*: whether the caveat applies, as a pure function of the
redeemer's Sensitive-Constraint state. It reuses the one ADR-0003 detection (``is_sensitive``)
the generation cache-bypass uses, rather than re-deriving it, so the two paths can never drift
on what "sensitive" means. It has no I/O and never mutates the plan — it only flags the copy.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.domain.fitness_profile import HasSensitiveConstraints, is_sensitive

# The canonical, mandatory caveat surfaced on a received Share for a Sensitive-Constraint
# redeemer (ADR-0058). One source of truth for the wording so the message can never drift
# between the Redeem response and any future surface.
RECEIVED_SHARE_CAVEAT = (
    "This session was built for another user and isn't tailored to your "
    "constraints. Review it carefully — it won't be used to generate or start "
    "a plan on its own."
)


@dataclass(frozen=True)
class RedeemCaveat:
    """The caveat decision for one Redeem (ADR-0058).

    ``applies`` is the flag the Redeem response carries; ``message`` is the canonical caveat
    text when it applies, and ``None`` otherwise. Immutable — the rule returns a fresh value
    and never mutates its input."""

    applies: bool
    message: str | None = None


# The single "no caveat" value, reused so an unconstrained redeem never allocates a new one.
_NO_CAVEAT = RedeemCaveat(applies=False, message=None)


def redeem_caveat(redeemer: HasSensitiveConstraints) -> RedeemCaveat:
    """Whether a Redeem must carry the Received-Share caveat, from the redeemer's state.

    Reuses the ADR-0003 ``is_sensitive`` gate: a redeemer with any Sensitive Constraint gets
    the mandatory caveat (built for another user, not tailored to their constraints); everyone
    else redeems with no caveat. Pure and total — it classifies, it never blocks or raises, so
    the Redeem itself always proceeds (ADR-0058)."""

    if is_sensitive(redeemer):
        return RedeemCaveat(applies=True, message=RECEIVED_SHARE_CAVEAT)
    return _NO_CAVEAT


__all__ = ["RECEIVED_SHARE_CAVEAT", "RedeemCaveat", "redeem_caveat"]
