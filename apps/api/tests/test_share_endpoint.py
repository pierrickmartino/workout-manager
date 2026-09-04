"""The Share / preview / Redeem endpoints end to end (ADR-0057, issue #398): real JWKS
verification, the repositories, and the response envelope wired through FastAPI.

* ``POST/DELETE /api/sessions/{id}/share`` — the sharer publishes and revokes a Share Link
  (owner-scoped, standalone-only).
* ``GET /api/shares/{token}`` — a recipient previews the linked Session (name/type/author/
  validity), leaking nothing beyond those.
* ``POST /api/shares/{token}/redeem`` — a recipient deep-copies it into a new standalone
  Session they own: copy fidelity, Author preserved, Name carried, Favorite not carried,
  fresh copy, redeem-time snapshot, and clean failure on a revoked/invalid link.

Repositories and the generator are injected via dependency overrides so the tests run
offline. One shared Session/ShareLink store spans requests, so two users interact through
the same links, as a real Share does."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.generation.generator import GenerationRequest
from app.generation.schema import GeneratedExercisePrescription, GeneratedSession
from app.main import create_app
from app.repositories.deps import (
    get_exercise_repository,
    get_logged_session_repository,
    get_profile_repository,
    get_session_generator,
    get_session_repository,
    get_share_link_repository,
)
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.favorite_repository import InMemoryFavoriteRepository
from app.repositories.logged_session_repository import (
    InMemoryLoggedSessionRepository,
)
from app.repositories.profile_repository import InMemoryProfileRepository
from app.repositories.session_repository import InMemorySessionRepository
from app.repositories.share_link_repository import InMemoryShareLinkRepository
from tests.conftest import ISSUER, make_signing_context


class FakeGenerator:
    def generate(self, request: GenerationRequest) -> GeneratedSession:
        return GeneratedSession(
            prescriptions=[
                GeneratedExercisePrescription(
                    exercise_name="Back Squat", sets=5, reps="5", rest_seconds=120
                ),
                GeneratedExercisePrescription(
                    exercise_name="Overhead Press", sets=3, reps="8-12"
                ),
            ]
        )


def build_client():
    ctx = make_signing_context()
    exercises = InMemoryExerciseRepository()
    profiles = InMemoryProfileRepository()
    favorites = InMemoryFavoriteRepository()
    sessions = InMemorySessionRepository(exercises, profiles, favorites)
    share_links = InMemoryShareLinkRepository()
    logged = InMemoryLoggedSessionRepository(sessions, exercises)
    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_exercise_repository] = lambda: exercises
    app.dependency_overrides[get_session_repository] = lambda: sessions
    app.dependency_overrides[get_logged_session_repository] = lambda: logged
    app.dependency_overrides[get_share_link_repository] = lambda: share_links
    app.dependency_overrides[get_session_generator] = lambda: FakeGenerator()
    app.dependency_overrides[get_profile_repository] = lambda: profiles
    return TestClient(app), ctx, sessions


def _auth(ctx, sub):
    return {"Authorization": f"Bearer {ctx.mint(sub=sub)}"}


def _create_session(client, headers):
    body = {"training_type": "strength", "duration_minutes": 45, "equipment": []}
    return client.post("/api/sessions/generate", headers=headers, json=body).json()[
        "data"
    ]


def _share(client, headers, session_id):
    return client.post(f"/api/sessions/{session_id}/share", headers=headers)


# --- Sharer: create + revoke ------------------------------------------------------------


def test_share_endpoints_require_authentication():
    client, _, _ = build_client()
    assert client.post("/api/sessions/1/share").status_code == 401
    assert client.delete("/api/sessions/1/share").status_code == 401
    assert client.get("/api/shares/abc").status_code == 401
    assert client.post("/api/shares/abc/redeem").status_code == 401


def test_create_share_returns_an_unguessable_token():
    client, ctx, _ = build_client()
    headers = _auth(ctx, "sharer")
    session = _create_session(client, headers)

    response = _share(client, headers, session["id"])

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["session_id"] == session["id"]
    assert data["is_revoked"] is False
    assert len(data["token"]) >= 32


def test_create_share_is_idempotent_while_active():
    client, ctx, _ = build_client()
    headers = _auth(ctx, "sharer")
    session = _create_session(client, headers)

    first = _share(client, headers, session["id"]).json()["data"]
    second = _share(client, headers, session["id"]).json()["data"]

    assert first["token"] == second["token"]


def test_create_share_404s_for_a_non_owner():
    client, ctx, _ = build_client()
    session = _create_session(client, _auth(ctx, "owner"))

    response = _share(client, _auth(ctx, "intruder"), session["id"])

    assert response.status_code == 404


def test_create_share_409s_on_a_protocol_member():
    client, ctx, sessions = build_client()
    headers = _auth(ctx, "sharer")
    session = _create_session(client, headers)
    sessions._sessions[session["id"]].protocol_id = 999  # make it a Protocol member

    response = _share(client, headers, session["id"])

    assert response.status_code == 409


def test_revoke_share_404s_for_a_non_owner():
    client, ctx, _ = build_client()
    session = _create_session(client, _auth(ctx, "owner"))
    _share(client, _auth(ctx, "owner"), session["id"])

    response = client.delete(
        f"/api/sessions/{session['id']}/share", headers=_auth(ctx, "intruder")
    )

    assert response.status_code == 404


# --- Recipient: preview -----------------------------------------------------------------


def test_preview_shows_only_name_type_and_author():
    client, ctx, _ = build_client()
    sharer = _auth(ctx, "sharer")
    session = _create_session(client, sharer)
    client.put(
        f"/api/sessions/{session['id']}/name", headers=sharer, json={"name": "Leg Day"}
    )
    token = _share(client, sharer, session["id"]).json()["data"]["token"]

    preview = client.get(f"/api/shares/{token}", headers=_auth(ctx, "recipient")).json()[
        "data"
    ]

    assert preview["valid"] is True
    assert preview["display_name"] == "Leg Day"
    assert preview["training_type"] == "strength"
    # Author is the original creator; leaking nothing beyond name/type/author/validity.
    assert "author" in preview
    assert "prescriptions" not in preview
    assert "clerk_user_id" not in preview


def test_preview_of_a_revoked_link_is_invalid_and_bare():
    client, ctx, _ = build_client()
    sharer = _auth(ctx, "sharer")
    session = _create_session(client, sharer)
    token = _share(client, sharer, session["id"]).json()["data"]["token"]
    client.delete(f"/api/sessions/{session['id']}/share", headers=sharer)

    preview = client.get(f"/api/shares/{token}", headers=_auth(ctx, "recipient")).json()[
        "data"
    ]

    # Still 200 (validity is a field), but nothing about the once-linked Session leaks.
    assert preview["valid"] is False
    assert preview["display_name"] is None
    assert preview["training_type"] is None


def test_preview_of_an_unknown_link_is_invalid():
    client, ctx, _ = build_client()
    preview = client.get(
        "/api/shares/no-such-token", headers=_auth(ctx, "recipient")
    ).json()["data"]
    assert preview["valid"] is False


# --- Recipient: redeem ------------------------------------------------------------------


def test_redeem_deep_copies_into_a_session_owned_by_the_redeemer():
    client, ctx, _ = build_client()
    sharer = _auth(ctx, "sharer")
    session = _create_session(client, sharer)
    token = _share(client, sharer, session["id"]).json()["data"]["token"]

    redeemed = client.post(
        f"/api/shares/{token}/redeem", headers=_auth(ctx, "recipient")
    )

    assert redeemed.status_code == 200
    copy = redeemed.json()["data"]
    assert copy["id"] != session["id"]
    assert copy["clerk_user_id"] == "recipient"
    # Prescriptions copied faithfully, in order.
    assert [p["exercise_name"] for p in copy["prescriptions"]] == [
        "Back Squat",
        "Overhead Press",
    ]
    # The recipient can now read their own copy; the sharer cannot.
    assert (
        client.get(f"/api/sessions/{copy['id']}", headers=_auth(ctx, "recipient")).status_code
        == 200
    )
    assert (
        client.get(f"/api/sessions/{copy['id']}", headers=sharer).status_code == 404
    )


def test_redeem_preserves_the_author_and_carries_the_name():
    client, ctx, _ = build_client()
    sharer = _auth(ctx, "sharer")
    session = _create_session(client, sharer)
    client.put(
        f"/api/sessions/{session['id']}/name", headers=sharer, json={"name": "Leg Day"}
    )
    token = _share(client, sharer, session["id"]).json()["data"]["token"]

    copy = client.post(
        f"/api/shares/{token}/redeem", headers=_auth(ctx, "recipient")
    ).json()["data"]

    # Name carried verbatim; Author preserved as the original creator (the sharer's profile
    # name — here unset, so the web mapper's generic fallback applies; the raw id is withheld).
    assert copy["name"] == "Leg Day"
    assert copy["display_name"] == "Leg Day"
    assert "author" in copy
    assert "author_clerk_user_id" not in copy


def test_redeem_carries_the_progression_scheme_end_to_end():
    # The Progression Scheme is a plan property carried on the Redeem copy (ADR-0064, #433),
    # unlike the per-owner Favorite: the sharer selects Static on a movement, and the
    # recipient's copy keeps it through Share → Redeem.
    client, ctx, _ = build_client()
    sharer = _auth(ctx, "sharer")
    session = _create_session(client, sharer)
    # Select Static on the first movement — a no-AI plan edit, valid on any Load kind.
    chosen = client.put(
        f"/api/sessions/{session['id']}/prescriptions/0/scheme",
        headers=sharer,
        json={"scheme": "static"},
    )
    assert chosen.status_code == 200
    token = _share(client, sharer, session["id"]).json()["data"]["token"]

    copy = client.post(
        f"/api/shares/{token}/redeem", headers=_auth(ctx, "recipient")
    ).json()["data"]

    # The chosen scheme copies per-Prescription; the untouched one stays the default (null).
    assert [p["scheme"] for p in copy["prescriptions"]] == ["static", None]


def test_scheme_survives_a_share_redeem_reshare_chain_end_to_end():
    # Faithful through the chain (ADR-0064, #433): the recipient re-shares their copy and a
    # downstream user redeems it — the scheme is still there, having copied at every hop.
    client, ctx, _ = build_client()
    sharer = _auth(ctx, "sharer")
    session = _create_session(client, sharer)
    client.put(
        f"/api/sessions/{session['id']}/prescriptions/0/scheme",
        headers=sharer,
        json={"scheme": "static"},
    )
    token = _share(client, sharer, session["id"]).json()["data"]["token"]

    recipient = _auth(ctx, "recipient")
    copy = client.post(f"/api/shares/{token}/redeem", headers=recipient).json()["data"]
    # The recipient re-shares their standalone copy; a downstream user redeems that link.
    reshare_token = _share(client, recipient, copy["id"]).json()["data"]["token"]
    downstream = client.post(
        f"/api/shares/{reshare_token}/redeem", headers=_auth(ctx, "downstream")
    ).json()["data"]

    assert [p["scheme"] for p in downstream["prescriptions"]] == ["static", None]


def test_redeem_does_not_carry_favorite():
    client, ctx, _ = build_client()
    sharer = _auth(ctx, "sharer")
    session = _create_session(client, sharer)
    client.post(f"/api/sessions/{session['id']}/favorite", headers=sharer)  # sharer favorites
    token = _share(client, sharer, session["id"]).json()["data"]["token"]

    copy = client.post(
        f"/api/shares/{token}/redeem", headers=_auth(ctx, "recipient")
    ).json()["data"]

    assert copy["is_favorite"] is False


def test_each_redeem_is_a_fresh_distinct_copy():
    client, ctx, _ = build_client()
    sharer = _auth(ctx, "sharer")
    session = _create_session(client, sharer)
    token = _share(client, sharer, session["id"]).json()["data"]["token"]
    recipient = _auth(ctx, "recipient")

    first = client.post(f"/api/shares/{token}/redeem", headers=recipient).json()["data"]
    second = client.post(f"/api/shares/{token}/redeem", headers=recipient).json()["data"]

    assert first["id"] != second["id"]


def test_redeem_reflects_the_redeem_time_state():
    # The copy is taken at redeem time, so a pre-redeem edit by the sharer flows through.
    client, ctx, _ = build_client()
    sharer = _auth(ctx, "sharer")
    session = _create_session(client, sharer)
    token = _share(client, sharer, session["id"]).json()["data"]["token"]
    recipient = _auth(ctx, "recipient")

    before = client.post(f"/api/shares/{token}/redeem", headers=recipient).json()["data"]
    # Sharer removes the second movement, then a later redeem is taken off the same link.
    client.delete(f"/api/sessions/{session['id']}/prescriptions/1", headers=sharer)
    after = client.post(f"/api/shares/{token}/redeem", headers=recipient).json()["data"]

    assert len(before["prescriptions"]) == 2  # earlier copy independent of the later edit
    assert len(after["prescriptions"]) == 1  # later copy reflects the redeem-time source


def test_redeem_of_a_revoked_link_fails_cleanly():
    client, ctx, _ = build_client()
    sharer = _auth(ctx, "sharer")
    session = _create_session(client, sharer)
    token = _share(client, sharer, session["id"]).json()["data"]["token"]
    client.delete(f"/api/sessions/{session['id']}/share", headers=sharer)

    response = client.post(
        f"/api/shares/{token}/redeem", headers=_auth(ctx, "recipient")
    )

    assert response.status_code == 404
    body = response.json()
    assert body["success"] is False
    assert body["data"] is None
    assert body["error"]


def test_redeem_of_an_unknown_link_fails_cleanly():
    client, ctx, _ = build_client()
    response = client.post(
        "/api/shares/no-such-token/redeem", headers=_auth(ctx, "recipient")
    )
    assert response.status_code == 404
    assert response.json()["success"] is False


def test_redeeming_ones_own_link_yields_a_distinct_copy():
    client, ctx, _ = build_client()
    sharer = _auth(ctx, "sharer")
    session = _create_session(client, sharer)
    token = _share(client, sharer, session["id"]).json()["data"]["token"]

    copy = client.post(f"/api/shares/{token}/redeem", headers=sharer).json()["data"]

    assert copy["id"] != session["id"]
    assert copy["clerk_user_id"] == "sharer"


# --- Recipient: redeem — the ADR-0058 Received-Share safety caveat ----------------------


def _set_sensitive(client, headers, constraints):
    """Give the authenticated recipient a Sensitive Constraint via the Profile endpoint."""
    return client.put(
        "/api/profile", headers=headers, json={"sensitive_constraints": constraints}
    )


def test_redeem_flags_the_caveat_for_a_sensitive_constraint_redeemer():
    client, ctx, _ = build_client()
    sharer = _auth(ctx, "sharer")
    recipient = _auth(ctx, "injured_recipient")
    session = _create_session(client, sharer)
    token = _share(client, sharer, session["id"]).json()["data"]["token"]
    _set_sensitive(client, recipient, ["injury"])  # recipient is in rehab/injury

    copy = client.post(f"/api/shares/{token}/redeem", headers=recipient).json()["data"]

    # The Redeem still succeeds (never blocked) but the response flags the caveat with the
    # mandatory "built for another user" message (ADR-0058).
    assert copy["caveat"]["applies"] is True
    assert copy["caveat"]["message"]
    assert "another user" in copy["caveat"]["message"]


def test_redeem_flags_no_caveat_for_an_unconstrained_redeemer():
    client, ctx, _ = build_client()
    sharer = _auth(ctx, "sharer")
    session = _create_session(client, sharer)
    token = _share(client, sharer, session["id"]).json()["data"]["token"]

    copy = client.post(
        f"/api/shares/{token}/redeem", headers=_auth(ctx, "recipient")
    ).json()["data"]

    # An unconstrained redeemer receives an ordinary copy: the caveat is present but not flagged.
    assert copy["caveat"]["applies"] is False
    assert copy["caveat"]["message"] is None


def test_a_sensitive_constraint_redeem_lands_as_an_ordinary_saved_session():
    # ADR-0058: a received Share never auto-enters the active flow — it is an ordinary owned,
    # standalone Session (not a Protocol member), never silently made the Current Protocol.
    client, ctx, _ = build_client()
    sharer = _auth(ctx, "sharer")
    recipient = _auth(ctx, "injured_recipient")
    session = _create_session(client, sharer)
    token = _share(client, sharer, session["id"]).json()["data"]["token"]
    _set_sensitive(client, recipient, ["postpartum"])

    copy = client.post(f"/api/shares/{token}/redeem", headers=recipient).json()["data"]

    assert copy["is_protocol_member"] is False
    # It reads back as a plain owned Session in the recipient's library.
    read = client.get(f"/api/sessions/{copy['id']}", headers=recipient)
    assert read.status_code == 200


def test_redeem_carries_forward_a_prescription_set_type():
    # Arrange — the sharer tags an Inserted movement with a Set Type, then shares the plan
    # (ADR-0065, #449: Set Type is a plan property carried across Share/Redeem-by-copy).
    client, ctx, _ = build_client()
    sharer = _auth(ctx, "sharer_settype")
    session = _create_session(client, sharer)
    exercise_id = session["prescriptions"][0]["exercise_id"]
    tagged = client.post(
        f"/api/sessions/{session['id']}/prescriptions",
        headers=sharer,
        json={
            "exercise_id": exercise_id,
            "sets": 2,
            "reps": "10",
            "load_kind": "absolute",
            "load_value": "20",
            "set_type": "warm_up",
        },
    ).json()["data"]
    assert tagged["prescriptions"][-1]["set_type"] == "warm_up"
    token = _share(client, sharer, session["id"]).json()["data"]["token"]

    # Act — a recipient redeems the share into their own independent copy
    copy = client.post(
        f"/api/shares/{token}/redeem", headers=_auth(ctx, "recipient_settype")
    ).json()["data"]

    # Assert — the redeemed copy preserves the movement's Set Type
    assert copy["prescriptions"][-1]["set_type"] == "warm_up"


def test_redeem_carries_forward_a_prescription_note():
    # Arrange — the sharer leaves an Exercise Note on an Inserted movement, then shares the plan
    # (ADR-0065, #451: the Exercise Note is a plan property carried across Share/Redeem-by-copy).
    client, ctx, _ = build_client()
    sharer = _auth(ctx, "sharer_note")
    session = _create_session(client, sharer)
    exercise_id = session["prescriptions"][0]["exercise_id"]
    tagged = client.post(
        f"/api/sessions/{session['id']}/prescriptions",
        headers=sharer,
        json={
            "exercise_id": exercise_id,
            "sets": 2,
            "reps": "10",
            "load_kind": "absolute",
            "load_value": "20",
            "note": "brace hard",
        },
    ).json()["data"]
    assert tagged["prescriptions"][-1]["note"] == "brace hard"
    token = _share(client, sharer, session["id"]).json()["data"]["token"]

    # Act — a recipient redeems the share into their own independent copy
    copy = client.post(
        f"/api/shares/{token}/redeem", headers=_auth(ctx, "recipient_note")
    ).json()["data"]

    # Assert — the redeemed copy preserves the movement's Exercise Note
    assert copy["prescriptions"][-1]["note"] == "brace hard"


def test_redeem_carries_forward_a_prescription_target_effort():
    # Arrange — the sharer prescribes a Target Effort on an Inserted movement, then shares the
    # plan (ADR-0066, #454: Target Effort is a plan property carried across Share/Redeem-by-copy).
    client, ctx, _ = build_client()
    sharer = _auth(ctx, "sharer_target")
    session = _create_session(client, sharer)
    exercise_id = session["prescriptions"][0]["exercise_id"]
    tagged = client.post(
        f"/api/sessions/{session['id']}/prescriptions",
        headers=sharer,
        json={
            "exercise_id": exercise_id,
            "sets": 2,
            "reps": "10",
            "load_kind": "absolute",
            "load_value": "20",
            "target_effort_scale": "rir",
            "target_effort_value": 2,
        },
    ).json()["data"]
    assert tagged["prescriptions"][-1]["target_effort"] == {"scale": "rir", "value": 2}
    token = _share(client, sharer, session["id"]).json()["data"]["token"]

    # Act — a recipient redeems the share into their own independent copy
    copy = client.post(
        f"/api/shares/{token}/redeem", headers=_auth(ctx, "recipient_target")
    ).json()["data"]

    # Assert — the redeemed copy preserves the movement's Target Effort
    assert copy["prescriptions"][-1]["target_effort"] == {"scale": "rir", "value": 2}
