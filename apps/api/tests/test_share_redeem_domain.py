"""The Redeem copy rule as a pure domain fact (ADR-0057, CONTEXT: Redeem).

Redeem is the cross-user cousin of Duplicate (ADR-0043): it deep-copies a shared
standalone Session into a new one owned by the *redeemer*. This exercises the pure
Session-level rule for that copy — no repository, no ORM — so the two deltas from
Duplicate are pinned down in one place: the new Owner is the redeemer, and the Author
is *preserved* as the original creator (immutable origin), never re-attributed. Session
Name, Session Provenance and the ``trace_id`` lineage carry forward unchanged.
"""

from __future__ import annotations

from app.domain.share_redeem import (
    RedeemedSessionCopy,
    SharedSessionSource,
    redeem_copy,
)


def _source(**overrides) -> SharedSessionSource:
    base = dict(
        training_type="strength",
        duration_minutes=45,
        provenance="ai_generated",
        name="Leg Day",
        author_clerk_user_id="original_author",
        trace_id="trace-orig",
    )
    base.update(overrides)
    return SharedSessionSource(**base)


def test_new_owner_is_the_redeemer():
    # Act — the redeemer is a different user than the source's owner/author
    copy = redeem_copy(_source(), "redeemer_user")

    # Assert — ownership transfers to whoever redeemed the link (CONTEXT: Owner transfers on Redeem)
    assert copy.clerk_user_id == "redeemer_user"


def test_author_is_preserved_not_reattributed():
    # Act
    copy = redeem_copy(_source(author_clerk_user_id="original_author"), "redeemer_user")

    # Assert — Author is immutable origin: the copy still credits the original creator, never
    # the redeemer, even though the redeemer now owns it (ADR-0057 consequence: Author diverges
    # from Owner for the first time).
    assert copy.author_clerk_user_id == "original_author"
    assert copy.author_clerk_user_id != copy.clerk_user_id


def test_session_name_is_carried_verbatim():
    copy = redeem_copy(_source(name="Leg Day"), "redeemer_user")
    assert copy.name == "Leg Day"


def test_an_unnamed_source_stays_unnamed():
    # A born-unnamed Session carries no name forward — the read falls back to the derived label.
    copy = redeem_copy(_source(name=None), "redeemer_user")
    assert copy.name is None


def test_provenance_and_trace_id_carry_forward_unchanged():
    # An ai_generated source keeps its Provenance and lineage (ADR-0043 semantics), so
    # Generation Feedback and Regeneration remain available on the recipient's copy.
    copy = redeem_copy(
        _source(provenance="ai_generated", trace_id="trace-orig"), "redeemer_user"
    )
    assert copy.provenance == "ai_generated"
    assert copy.trace_id == "trace-orig"


def test_user_authored_provenance_is_preserved():
    copy = redeem_copy(
        _source(provenance="user_authored", trace_id=None), "redeemer_user"
    )
    assert copy.provenance == "user_authored"
    assert copy.trace_id is None


def test_training_parameters_carry_forward():
    copy = redeem_copy(_source(training_type="yoga", duration_minutes=30), "redeemer")
    assert copy.training_type == "yoga"
    assert copy.duration_minutes == 30


def test_result_is_an_immutable_value():
    copy = redeem_copy(_source(), "redeemer_user")
    assert isinstance(copy, RedeemedSessionCopy)
