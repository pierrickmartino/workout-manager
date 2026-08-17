"""Behavior of the Skin catalog domain module: the fixed, code-defined registry
of palette families (ADR-0048) and the pure invariant validator.

A Skin is a named palette family drawn from a *fixed, curated catalog*; each one
must define **both** a light and a dark variant, and each variant must cover the
full required token set, so a Skin composes with any Mode (CONTEXT "Skin"). This
is the same catalog ``PUT /api/active-skin`` validates a published id against, so
an unknown id can never become the Active Skin. Pure, no I/O. Prior art:
tests/test_profile_domain.py."""

from __future__ import annotations

import pytest

from app.domain.skin import (
    DEFAULT_ACTIVE_SKIN,
    REQUIRED_TOKENS,
    SKIN_CATALOG,
    Skin,
    Variant,
    is_known_skin,
    skin_ids,
    validate_catalog,
)


def _complete_variants() -> dict[Variant, frozenset[str]]:
    """Both variants covering exactly the required token set — a valid Skin."""

    return {
        Variant.LIGHT: frozenset(REQUIRED_TOKENS),
        Variant.DARK: frozenset(REQUIRED_TOKENS),
    }


# --- the shipped catalog holds ---------------------------------------------


def test_shipped_catalog_passes_its_own_invariant():
    # Act / Assert — the real catalog validates (raises on any violation)
    validate_catalog(SKIN_CATALOG)


def test_every_shipped_skin_defines_both_a_light_and_a_dark_variant():
    # Assert — a Skin composes with any Mode only if both polarities exist
    for skin in SKIN_CATALOG:
        assert Variant.LIGHT in skin.variants
        assert Variant.DARK in skin.variants


def test_every_shipped_variant_covers_the_required_token_set():
    # Assert — no variant may omit a token a component consumes
    for skin in SKIN_CATALOG:
        for tokens in skin.variants.values():
            assert REQUIRED_TOKENS <= tokens


def test_pulse_is_the_default_active_skin_and_is_in_the_catalog():
    # Assert — the Active Skin's starting value is the original PULSE Skin
    assert DEFAULT_ACTIVE_SKIN == "pulse"
    assert "pulse" in skin_ids()


def test_a_second_skin_ships_so_a_publish_is_observable():
    # Assert — the catalog carries more than PULSE so switching the Active Skin
    # actually restyles the app (the minimal seed Skin, ADR-0048 / #331)
    assert len(skin_ids()) >= 2


def test_vercel_skin_ships_in_the_catalog():
    # Assert — the Vercel-inspired Skin is a curated catalog member, so an admin
    # can publish it and the PUT gate accepts its id (its token values live in
    # the frontend's globals.css under [data-skin="vercel"]).
    assert "vercel" in skin_ids()
    assert is_known_skin("vercel") is True


def test_skin_ids_are_unique():
    ids = skin_ids()
    assert len(ids) == len(set(ids))


# --- is_known_skin: the gate PUT validates against --------------------------


def test_a_catalog_id_is_known():
    assert is_known_skin("pulse") is True


def test_an_unknown_id_is_not_known():
    # A typo'd or fabricated id must fail closed, never becoming the Active Skin
    assert is_known_skin("neon-disco") is False


def test_the_empty_string_is_not_known():
    assert is_known_skin("") is False


# --- validate_catalog: the invariant enforcer ------------------------------


def test_validator_rejects_a_skin_missing_the_dark_variant():
    # Arrange — a Skin that only ships a light variant can't honour Dark Mode
    broken = (
        Skin(id="halfling", variants={Variant.LIGHT: frozenset(REQUIRED_TOKENS)}),
    )

    # Act / Assert
    with pytest.raises(ValueError):
        validate_catalog(broken)


def test_validator_rejects_a_variant_missing_a_required_token():
    # Arrange — a variant that omits one token leaves a component unstyled
    short = frozenset(REQUIRED_TOKENS - {"cyan"})
    broken = (
        Skin(
            id="gappy",
            variants={Variant.LIGHT: short, Variant.DARK: frozenset(REQUIRED_TOKENS)},
        ),
    )

    # Act / Assert
    with pytest.raises(ValueError):
        validate_catalog(broken)


def test_validator_rejects_duplicate_skin_ids():
    # Arrange — two Skins claiming the same id would make the id ambiguous
    dupe = (
        Skin(id="twin", variants=_complete_variants()),
        Skin(id="twin", variants=_complete_variants()),
    )

    # Act / Assert
    with pytest.raises(ValueError):
        validate_catalog(dupe)


def test_validator_accepts_a_well_formed_catalog():
    # Arrange — a hand-built, complete catalog
    good = (
        Skin(id="alpha", variants=_complete_variants()),
        Skin(id="beta", variants=_complete_variants()),
    )

    # Act / Assert — no raise
    validate_catalog(good)
