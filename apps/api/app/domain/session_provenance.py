"""Session Provenance — how a Session's plan came to exist (GLOSSARY.md, ADR-0040, ADR-0130).

A Session is ``ai_generated`` (produced by the generation pipeline), ``user_authored``
(built by hand with no AI — a Hand-Authored Session), or ``curated`` (adopted from a
human-authored, coach-reviewed Curated Protocol, ADR-0130). The axis is carried on *every*
Session so plan-quality affordances that assume the AI wrote the plan — Generation Feedback
and Regeneration (ADR-0006) — are offered **only** on an ``ai_generated`` plan. Gates check
``is_ai_generated`` rather than excluding the non-AI values one by one, so a new value fails
closed.

Parallel to an Exercise's Provenance (``app.domain.exercise.Provenance``) and named
the same way, but a distinct axis on a distinct concept: the *plan*, not the movement.
"""

from __future__ import annotations

from enum import Enum


class SessionProvenance(str, Enum):
    """How a Session's plan originated (ADR-0040, ADR-0130).

    ``AI_GENERATED`` came out of the generation pipeline (standalone generation or a
    Protocol Session adopted from a Generated Protocol). ``USER_AUTHORED`` was built by
    hand with no AI call. ``CURATED`` was adopted from a Curated Protocol: written by a
    person and reviewed by a coach, so neither AI output nor the adopting user's own work.
    """

    AI_GENERATED = "ai_generated"
    USER_AUTHORED = "user_authored"
    CURATED = "curated"


def is_ai_generated(provenance: str | None) -> bool:
    """Whether a Session's plan is AI output, the only plan that takes the AI-only
    affordances (Generation Feedback, Regeneration). Fails closed: ``user_authored``,
    ``curated``, an absent value, or an unrecognized value all answer ``False``."""
    return provenance == SessionProvenance.AI_GENERATED.value
