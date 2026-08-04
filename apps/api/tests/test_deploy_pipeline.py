"""Behavior of the Deploy pipeline module (``app.protocols.deploy``).

Deploy is the atomic commit of a Builder edit to a Protocol's un-performed tail
(CONTEXT §Deploy, ADR-0020/0021). This module deepens the two-tier convention the
rest of the read model uses (``protocols/progress.py``): a **pure** planning tier
(``plan_deploy``) that validates and folds the desired tail over an already-loaded
``ProtocolProgressView`` with no I/O, and a thin **service** tier
(``deploy_protocol_tail``) that reads ownership once, plans, and persists.

The pure tier is exercised here through plainly-constructed views and drafts — no
repositories — because that is the whole point of the seam: the load-bearing logic
(the performed prefix survives, the tail re-enumerates, a rejected draft names its
faults) has a pure test surface.
"""

from __future__ import annotations

from app.domain.exercise import Provenance
from app.protocols.deploy import (
    DeployPlan,
    DeployStatus,
    deploy_protocol_tail,
    plan_deploy,
)
from app.protocols.deploy_validation import (
    DeployDraft,
    DraftPrescription,
    DraftSession,
)
from app.protocols.progress import ProtocolProgressView
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.logged_session_repository import (
    InMemoryLoggedSessionRepository,
)
from app.repositories.profile_repository import InMemoryProfileRepository
from app.repositories.protocol_repository import (
    InMemoryProtocolRepository,
    ProtocolDraft,
    ProtocolSessionDraft,
    ProtocolSessionView,
    ProtocolView,
)
from app.repositories.session_repository import (
    InMemorySessionRepository,
    PrescriptionDraft as PersistPrescription,
)


def _session_view(
    *, session_id: int, position: int, week: int, day: int, title: str | None
) -> ProtocolSessionView:
    """A ProtocolSessionView with no prescriptions — plan_deploy reads only its
    position/week/day/title and id, never the stored prescriptions (those come from
    the draft)."""

    return ProtocolSessionView(
        session_id=session_id,
        position=position,
        week=week,
        day=day,
        title=title,
        prescriptions=[],
    )


def _protocol_view(sessions: list[ProtocolSessionView]) -> ProtocolView:
    return ProtocolView(
        id=1,
        clerk_user_id="user_a",
        training_type="strength",
        objective="gain muscle mass",
        sessions_per_week=1,
        weeks=len({s.week for s in sessions}),
        duration_minutes=45,
        sessions=sessions,
    )


def _progress(
    sessions: list[ProtocolSessionView], *, performed: set[int] = frozenset()
) -> ProtocolProgressView:
    protocol = _protocol_view(sessions)
    return ProtocolProgressView(
        protocol=protocol,
        next_session=next((s for s in sessions if s.session_id not in performed), None),
        completed_count=len(performed),
        performed_session_ids=frozenset(performed),
    )


def _draft_session(*, session_id: int | None, week: int, day: int) -> DraftSession:
    return DraftSession(
        session_id=session_id,
        week=week,
        day=day,
        prescriptions=[DraftPrescription(exercise_id=7, sets=5, reps="5")],
    )


def test_plan_deploy_returns_an_enumerated_plan_for_a_valid_tail():
    # Arrange — one existing, un-performed Session edited in place; no frozen prefix.
    progress = _progress(
        [_session_view(session_id=10, position=0, week=1, day=1, title="Push A")]
    )
    draft = DeployDraft(
        weeks=1,
        sessions_per_week=1,
        sessions=[_draft_session(session_id=10, week=1, day=1)],
    )

    # Act
    result = plan_deploy(
        draft, progress, exercise_exists=lambda _id: True, has_sensitive=False
    )

    # Assert — a plan (not errors), with the tail re-enumerated from position 0 and
    # the edited Session's title carried through from the progress view.
    assert isinstance(result, DeployPlan)
    assert result.weeks == 1
    assert result.sessions_per_week == 1
    assert [s.position for s in result.tail] == [0]
    assert result.tail[0].payload.title == "Push A"
    assert [p.exercise_id for p in result.tail[0].payload.prescriptions] == [7]


def test_plan_deploy_returns_errors_for_an_invalid_draft():
    # Arrange — a Session with no Prescriptions is rejected (Module B).
    progress = _progress(
        [_session_view(session_id=10, position=0, week=1, day=1, title="Push A")]
    )
    draft = DeployDraft(
        weeks=1,
        sessions_per_week=1,
        sessions=[DraftSession(session_id=10, week=1, day=1, prescriptions=[])],
    )

    # Act
    result = plan_deploy(
        draft, progress, exercise_exists=lambda _id: True, has_sensitive=False
    )

    # Assert — the typed errors, never a plan.
    assert not isinstance(result, DeployPlan)
    assert [error.code for error in result] == ["empty_session"]


def test_plan_deploy_rejects_editing_a_performed_session():
    # Arrange — Session 10 is performed (read off the progress view); the draft tries
    # to keep editing it.
    progress = _progress(
        [
            _session_view(session_id=10, position=0, week=1, day=1, title="Done"),
            _session_view(session_id=11, position=1, week=2, day=1, title="Next"),
        ],
        performed={10},
    )
    draft = DeployDraft(
        weeks=2,
        sessions_per_week=1,
        sessions=[
            _draft_session(session_id=10, week=1, day=1),
            _draft_session(session_id=11, week=2, day=1),
        ],
    )

    # Act
    result = plan_deploy(
        draft, progress, exercise_exists=lambda _id: True, has_sensitive=False
    )

    # Assert
    assert not isinstance(result, DeployPlan)
    assert any(error.code == "performed_session_modified" for error in result)


def test_plan_deploy_preserves_the_frozen_prefix_and_reenumerates_the_tail():
    # Arrange — Session 10 performed; the tail edits Session 11 and adds a brand-new
    # empty-id Session in a new week.
    progress = _progress(
        [
            _session_view(session_id=10, position=0, week=1, day=1, title="Done"),
            _session_view(session_id=11, position=1, week=2, day=1, title="Next"),
        ],
        performed={10},
    )
    draft = DeployDraft(
        weeks=3,
        sessions_per_week=1,
        sessions=[
            _draft_session(session_id=11, week=2, day=1),
            _draft_session(session_id=None, week=3, day=1),
        ],
    )

    # Act
    plan = plan_deploy(
        draft, progress, exercise_exists=lambda _id: True, has_sensitive=False
    )

    # Assert — prefix (10) is excluded from the tail; tail positions continue after it;
    # the edited Session keeps its title, the new slot gets None.
    assert isinstance(plan, DeployPlan)
    assert plan.performed_session_ids == frozenset({10})
    assert [s.session_id for s in plan.tail] == [11, None]
    assert [s.position for s in plan.tail] == [1, 2]
    assert [s.payload.title for s in plan.tail] == ["Next", None]


# --- Service tier: deploy_protocol_tail over real in-memory repositories ---------


def _repos():
    exercises = InMemoryExerciseRepository()
    sessions = InMemorySessionRepository(exercises)
    return (
        InMemoryProtocolRepository(exercises),
        InMemoryLoggedSessionRepository(sessions, exercises),
        exercises,
        InMemoryProfileRepository(),
    )


def _seed_protocol(protocols, exercises, *, owner: str) -> ProtocolView:
    squat = exercises.find_or_create(
        "Back Squat", provenance=Provenance.AI_GENERATED, targeted_muscles=["quads"]
    )
    draft = ProtocolDraft(
        training_type="strength",
        objective="gain muscle mass",
        sessions_per_week=1,
        weeks=1,
        duration_minutes=45,
        sessions=[
            ProtocolSessionDraft(
                week=1,
                day=1,
                title="Push A",
                prescriptions=[
                    PersistPrescription(exercise_id=squat.id, sets=5, reps="5")
                ],
            )
        ],
    )
    return protocols.create(owner, draft)


def _echo_draft(view: ProtocolView) -> DeployDraft:
    """A no-op deploy: the Protocol's own Sessions echoed back as the desired tail."""

    return DeployDraft(
        weeks=view.weeks,
        sessions_per_week=view.sessions_per_week,
        sessions=[
            DraftSession(
                session_id=session.session_id,
                week=session.week,
                day=session.day,
                prescriptions=[
                    DraftPrescription(
                        exercise_id=p.exercise_id, sets=p.sets, reps=p.reps
                    )
                    for p in session.prescriptions
                ],
            )
            for session in view.sessions
        ],
    )


def test_deploy_protocol_tail_reports_not_found_for_a_missing_protocol():
    # Arrange
    protocols, logged, exercises, profiles = _repos()

    # Act — no Protocol 999 exists.
    result = deploy_protocol_tail(
        "user_a",
        999,
        _echo_draft(_seed_protocol(protocols, exercises, owner="user_a")),
        name=None,
        protocols=protocols,
        logged=logged,
        exercises=exercises,
        profiles=profiles,
    )

    # Assert
    assert result.status is DeployStatus.NOT_FOUND
    assert result.view is None


def test_deploy_protocol_tail_reports_not_found_for_another_users_protocol():
    # Arrange — owned by user_a, deployed as user_b.
    protocols, logged, exercises, profiles = _repos()
    view = _seed_protocol(protocols, exercises, owner="user_a")

    # Act
    result = deploy_protocol_tail(
        "user_b",
        view.id,
        _echo_draft(view),
        name=None,
        protocols=protocols,
        logged=logged,
        exercises=exercises,
        profiles=profiles,
    )

    # Assert
    assert result.status is DeployStatus.NOT_FOUND


def test_deploy_protocol_tail_rejects_an_invalid_draft_and_persists_nothing():
    # Arrange — an empty Session is invalid (Module B).
    protocols, logged, exercises, profiles = _repos()
    view = _seed_protocol(protocols, exercises, owner="user_a")
    bad = DeployDraft(
        weeks=1,
        sessions_per_week=1,
        sessions=[
            DraftSession(
                session_id=view.sessions[0].session_id, week=1, day=1, prescriptions=[]
            )
        ],
    )

    # Act
    result = deploy_protocol_tail(
        "user_a",
        view.id,
        bad,
        name=None,
        protocols=protocols,
        logged=logged,
        exercises=exercises,
        profiles=profiles,
    )

    # Assert — rejected with the located error, and the stored Session is untouched.
    assert result.status is DeployStatus.REJECTED
    assert [error.code for error in result.errors] == ["empty_session"]
    reread = protocols.get(view.id, "user_a")
    assert len(reread.sessions[0].prescriptions) == 1


def test_deploy_protocol_tail_deploys_a_valid_edit_and_returns_the_progressed_view():
    # Arrange — bump the single Prescription's sets from 5 to 8.
    protocols, logged, exercises, profiles = _repos()
    view = _seed_protocol(protocols, exercises, owner="user_a")
    exercise_id = view.sessions[0].prescriptions[0].exercise_id
    edit = DeployDraft(
        weeks=1,
        sessions_per_week=1,
        sessions=[
            DraftSession(
                session_id=view.sessions[0].session_id,
                week=1,
                day=1,
                prescriptions=[
                    DraftPrescription(exercise_id=exercise_id, sets=8, reps="5")
                ],
            )
        ],
    )

    # Act
    result = deploy_protocol_tail(
        "user_a",
        view.id,
        edit,
        name="My Block",
        protocols=protocols,
        logged=logged,
        exercises=exercises,
        profiles=profiles,
    )

    # Assert — deployed, the returned view reflects the edit and the name, and it is
    # actually persisted.
    assert result.status is DeployStatus.DEPLOYED
    assert result.view is not None
    assert result.view.protocol.sessions[0].prescriptions[0].sets == 8
    assert result.view.protocol.name == "My Block"
    reread = protocols.get(view.id, "user_a")
    assert reread.sessions[0].prescriptions[0].sets == 8
