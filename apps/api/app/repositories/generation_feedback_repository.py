"""Repository for Generation Feedback — the user's verdict on a Session.

Writes take a verdict (``positive``/``negative``) and an optional free-text
reason and persist a feedback record owned by the user. ``latest`` returns the
most recent feedback for one Session — the record that decides whether
Regeneration is allowed and supplies its steering reason. Reads are owner-scoped:
a user never sees another user's feedback. SQLModel-backed and in-memory
implementations honor the same contract."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from sqlmodel import Session, desc, select

from app.db.models import GenerationFeedback
from app.domain.feedback import Verdict


@dataclass(frozen=True)
class GenerationFeedbackView:
    """A stored Generation Feedback, ready to serialize."""

    id: int
    clerk_user_id: str
    session_id: int
    verdict: str
    reason: str | None


class GenerationFeedbackRepository(Protocol):
    def record(
        self,
        clerk_user_id: str,
        *,
        session_id: int,
        verdict: Verdict,
        reason: str | None = None,
    ) -> GenerationFeedbackView:
        """Persist a verdict on ``session_id`` for ``clerk_user_id`` and return
        the stored feedback."""
        ...

    def latest(
        self, session_id: int, clerk_user_id: str
    ) -> GenerationFeedbackView | None:
        """Return the user's most recent feedback for ``session_id``, or ``None``
        when they have left none."""
        ...


def _view(feedback: GenerationFeedback) -> GenerationFeedbackView:
    return GenerationFeedbackView(
        id=feedback.id,
        clerk_user_id=feedback.clerk_user_id,
        session_id=feedback.session_id,
        verdict=feedback.verdict,
        reason=feedback.reason,
    )


class SqlGenerationFeedbackRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def record(
        self,
        clerk_user_id: str,
        *,
        session_id: int,
        verdict: Verdict,
        reason: str | None = None,
    ) -> GenerationFeedbackView:
        feedback = GenerationFeedback(
            clerk_user_id=clerk_user_id,
            session_id=session_id,
            verdict=verdict.value,
            reason=reason,
        )
        self._session.add(feedback)
        self._session.commit()
        self._session.refresh(feedback)
        return _view(feedback)

    def latest(
        self, session_id: int, clerk_user_id: str
    ) -> GenerationFeedbackView | None:
        feedback = self._session.exec(
            select(GenerationFeedback)
            .where(GenerationFeedback.session_id == session_id)
            .where(GenerationFeedback.clerk_user_id == clerk_user_id)
            .order_by(desc(GenerationFeedback.id))
        ).first()
        return _view(feedback) if feedback is not None else None


class InMemoryGenerationFeedbackRepository:
    def __init__(self) -> None:
        self._records: list[GenerationFeedback] = []
        self._next_id = 1

    def record(
        self,
        clerk_user_id: str,
        *,
        session_id: int,
        verdict: Verdict,
        reason: str | None = None,
    ) -> GenerationFeedbackView:
        feedback = GenerationFeedback(
            id=self._next_id,
            clerk_user_id=clerk_user_id,
            session_id=session_id,
            verdict=verdict.value,
            reason=reason,
        )
        self._next_id += 1
        self._records.append(feedback)
        return _view(feedback)

    def latest(
        self, session_id: int, clerk_user_id: str
    ) -> GenerationFeedbackView | None:
        for feedback in reversed(self._records):
            if (
                feedback.session_id == session_id
                and feedback.clerk_user_id == clerk_user_id
            ):
                return _view(feedback)
        return None


__all__ = [
    "GenerationFeedbackView",
    "GenerationFeedbackRepository",
    "SqlGenerationFeedbackRepository",
    "InMemoryGenerationFeedbackRepository",
]
