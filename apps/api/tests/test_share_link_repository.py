"""The Share Link repository over both the in-memory fake and the real SQLModel repo
(ADR-0057, CONTEXT: Share Link).

A Share Link is revocable and reusable: ``create`` mints an unguessable token (returning
the existing active link rather than a duplicate), ``revoke`` stamps it so future Redeems
fail, and ``resolve_active`` returns the link only while it is still redeemable — an
unknown or revoked token both resolving to ``None`` so neither leaks which it was.
"""

from __future__ import annotations

import pytest
from sqlmodel import Session, SQLModel, select
from tests.conftest import make_fk_engine

from app.db.models import WorkoutSession
from app.repositories.share_link_repository import (
    InMemoryShareLinkRepository,
    SqlShareLinkRepository,
)


@pytest.fixture(params=["in_memory", "sql"])
def links(request):
    if request.param == "in_memory":
        yield InMemoryShareLinkRepository(), None
        return
    engine = make_fk_engine()
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        # A real Session row so the link's foreign key holds on the SQL path.
        workout = WorkoutSession(
            clerk_user_id="owner", training_type="strength", duration_minutes=45
        )
        session.add(workout)
        session.commit()
        yield SqlShareLinkRepository(session), session


def _session_id(links_repo, sql_session) -> int:
    # The in-memory repo never dereferences the id; the SQL path uses the seeded row's id.
    if sql_session is None:
        return 1
    return sql_session.exec(select(WorkoutSession)).first().id


def test_create_mints_an_unguessable_token(links):
    repo, sql = links
    view = repo.create(_session_id(repo, sql), "owner")
    # A long, url-safe, hard-to-guess token — the capability that gates Redeem.
    assert view.is_revoked is False
    assert len(view.token) >= 32
    assert view.session_id == _session_id(repo, sql)
    assert view.clerk_user_id == "owner"


def test_create_is_idempotent_while_active(links):
    # Producing a link twice returns the same active token — no parallel live links.
    repo, sql = links
    session_id = _session_id(repo, sql)
    first = repo.create(session_id, "owner")
    second = repo.create(session_id, "owner")
    assert first.token == second.token


def test_resolve_active_returns_the_link_for_a_live_token(links):
    repo, sql = links
    session_id = _session_id(repo, sql)
    created = repo.create(session_id, "owner")

    resolved = repo.resolve_active(created.token)
    assert resolved is not None
    assert resolved.session_id == session_id
    assert resolved.is_revoked is False


def test_resolve_active_is_none_for_an_unknown_token(links):
    repo, _ = links
    assert repo.resolve_active("no-such-token") is None


def test_revoke_stops_future_resolution(links):
    repo, sql = links
    session_id = _session_id(repo, sql)
    created = repo.create(session_id, "owner")

    repo.revoke(session_id, "owner")

    # The token no longer resolves — a future Redeem/preview sees an invalid link.
    assert repo.resolve_active(created.token) is None


def test_revoke_is_idempotent_and_owner_scoped(links):
    # Revoking with no active link is a no-op; revoking another user's session touches nothing.
    repo, sql = links
    session_id = _session_id(repo, sql)
    created = repo.create(session_id, "owner")

    repo.revoke(session_id, "someone_else")  # not the sharer — no effect
    assert repo.resolve_active(created.token) is not None

    repo.revoke(session_id, "owner")
    repo.revoke(session_id, "owner")  # idempotent second revoke
    assert repo.resolve_active(created.token) is None


def test_create_after_revoke_mints_a_fresh_token(links):
    # Once revoked, producing again mints a new active link (a new off-switch state).
    repo, sql = links
    session_id = _session_id(repo, sql)
    first = repo.create(session_id, "owner")
    repo.revoke(session_id, "owner")

    second = repo.create(session_id, "owner")
    assert second.token != first.token
    assert repo.resolve_active(second.token) is not None
    assert repo.resolve_active(first.token) is None
