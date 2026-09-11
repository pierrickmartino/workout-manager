"""Session Provenance — how a Session's plan came to exist (CONTEXT.md, ADR-0040).

A Session is either ``ai_generated`` (produced by the generation pipeline) or
``user_authored`` (built by hand with no AI — a Hand-Authored Session). The axis is
carried on *every* Session so plan-quality affordances that assume the AI wrote the
plan — Generation Feedback and Regeneration (ADR-0006) — are never offered on a
``user_authored`` plan.

Parallel to an Exercise's Provenance (``app.domain.exercise.Provenance``) and named
the same way, but a distinct axis on a distinct concept: the *plan*, not the movement.
"""

from __future__ import annotations

from enum import Enum


class SessionProvenance(str, Enum):
    """How a Session's plan originated (ADR-0040).

    ``AI_GENERATED`` came out of the generation pipeline (standalone generation or a
    Protocol Session adopted from a Generated Protocol). ``USER_AUTHORED`` was built by
    hand with no AI call. The default for every Session created today is
    ``AI_GENERATED``; ``USER_AUTHORED`` is introduced by the Hand-Authored Session
    feature slices that build on this column.
    """

    AI_GENERATED = "ai_generated"
    USER_AUTHORED = "user_authored"
