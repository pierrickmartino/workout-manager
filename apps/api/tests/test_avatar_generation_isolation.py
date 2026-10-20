"""Proof that the **Avatar** never crosses into the Fitness Profile or generation (#747).

The Avatar is a stored **Interface Preference** (ADR-0136): identity, not a
generation input. It must never be a field of the Fitness Profile, never enter the
coarse generation **cache key**, and never be referenced by the generation package,
so the safety cache bypass (ADR-0003) is untouched. Prior art:
tests/test_weight_unit_generation_isolation.py."""

from __future__ import annotations

from pathlib import Path

from app.db.models import Profile
from app.generation.cache import CacheRequest

APP_ROOT = Path(__file__).resolve().parents[1] / "app"
GENERATION_ROOT = APP_ROOT / "generation"


def test_avatar_is_not_a_field_of_the_cache_request():
    assert "avatar" not in CacheRequest.__dataclass_fields__


def test_avatar_is_not_a_column_of_the_fitness_profile():
    assert "avatar" not in Profile.model_fields


def test_generation_package_never_references_the_avatar():
    # Arrange — scan every Python source file under app/generation
    offenders = [
        path.name
        for path in sorted(GENERATION_ROOT.rglob("*.py"))
        if "avatar" in path.read_text(encoding="utf-8", errors="ignore").lower()
    ]

    # Assert — the Avatar cannot enter the prompt or the cache key
    assert offenders == []
