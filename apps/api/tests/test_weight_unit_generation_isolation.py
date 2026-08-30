"""Proof that the **Weight Unit** facet never crosses into generation (#416).

Weight Unit is an **Interface Preference** (CONTEXT "Weight Unit", ADR-0047/0055):
like Mode and Keep Screen Awake it steers only how a Load is *entered and displayed*
and must never enter generation input or the generation **cache key** — two users on
different units must share one cached Protocol. These tests are the executable
tripwire for that boundary.

- **The cache key.** ``derive_key`` reduces a request to its coarse fields; if the
  facet is not even a field of ``CacheRequest`` it structurally cannot move the key.
  We assert both: the field's absence, and that the key is invariant when the same
  coarse request is built (the facet has nowhere to enter).
- **Generation input.** The whole ``app/generation`` package is scanned: it must not
  reference the Weight Unit facet or the appearance store at all, so a preference can
  never leak into the prompt the LLM sees.
"""

from __future__ import annotations

from pathlib import Path

from app.generation.cache import CacheRequest, derive_key

GENERATION_ROOT = Path(__file__).resolve().parents[1] / "app" / "generation"

# Identifier fragments that would signal the Interface Preference / Weight Unit facet
# leaking into the generation surface. Kept to identifier forms so this is a genuine
# boundary tripwire, not a prose grep.
FORBIDDEN_FRAGMENTS: tuple[str, ...] = (
    "weight_unit",
    "WeightUnit",
    "InterfacePreference",
    "appearance",
)


def test_weight_unit_is_not_a_field_of_the_cache_request():
    # Assert — the coarse cache key is derived only from CacheRequest's fields, so a
    # facet that is not a field can never enter the key.
    assert "weight_unit" not in CacheRequest.__dataclass_fields__


def test_cache_key_has_no_weight_unit_input_to_vary():
    # Arrange — two coarsely-equivalent requests (the facet has no parameter to set)
    base = dict(
        training_type="strength",
        objective="gain muscle mass",
        fitness_level=5,
        sessions_per_week=3,
        weeks=8,
        duration_minutes=45,
        equipment=["barbell", "rack"],
    )

    # Act / Assert — with no Weight Unit input, equivalent requests share one key,
    # so a kg user and an lb user reuse the same cached Protocol (ADR-0003).
    assert derive_key(CacheRequest(**base)) == derive_key(CacheRequest(**base))


def test_generation_package_never_references_the_weight_unit_facet():
    # Arrange — scan every Python source file under app/generation
    offenders: list[str] = []
    for path in sorted(GENERATION_ROOT.rglob("*.py")):
        text = path.read_text(encoding="utf-8", errors="ignore")
        for fragment in FORBIDDEN_FRAGMENTS:
            if fragment in text:
                offenders.append(f"{path.name}: {fragment!r}")

    # Assert — the generation package is entirely free of the Interface Preference /
    # Weight Unit facet: it cannot enter the prompt or the cache key.
    assert offenders == [], (
        "Weight Unit / Interface Preference must never reach generation "
        f"(ADR-0047/0055). Found: {offenders}"
    )
