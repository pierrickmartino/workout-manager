"""Cross-language guard tying the web Muscle Atlas assets to the canonical vocabulary (#542).

The anatomical atlas assets and their manifest live in the web app
(``apps/web/lib/atlas/``), but their ``data-muscle-id`` contract is the *server's* canonical
:class:`~app.domain.muscles.Muscle` vocabulary from issue #539. Nothing in the web test suite
can see the Python enum, so this test closes the loop from the API side: it reads the committed
manifest and asserts it is a faithful, exhaustive index of ``MUSCLE_ORDER`` — every canonical
muscle present, in canonical order, under its real parent Muscle Group, and no orphan id. If a
muscle is ever added, removed, renamed, or regrouped in the vocabulary, this fails until the
atlas manifest (and the artwork behind it) is regenerated to match, so the acceptance promise —
"every canonical Muscle has at least one path in every figure" — can never silently rot.
"""

from __future__ import annotations

import json
from pathlib import Path

from app.domain.muscles import MUSCLE_ORDER, group_of

# The committed manifest, resolved relative to the monorepo root so the test is location-stable.
_MANIFEST_PATH = (
    Path(__file__).resolve().parents[2] / "web" / "lib" / "atlas" / "manifest.json"
)


def _load_manifest() -> dict:
    return json.loads(_MANIFEST_PATH.read_text(encoding="utf-8"))


def test_manifest_file_exists() -> None:
    assert _MANIFEST_PATH.is_file(), f"atlas manifest missing at {_MANIFEST_PATH}"


def test_manifest_lists_exactly_the_canonical_muscles_in_order() -> None:
    manifest = _load_manifest()
    expected = [muscle.value for muscle in MUSCLE_ORDER]
    assert list(manifest["muscles"].keys()) == expected
    assert manifest["muscleCount"] == len(expected)


def test_every_manifest_muscle_nests_under_its_real_group() -> None:
    manifest = _load_manifest()
    for muscle in MUSCLE_ORDER:
        entry = manifest["muscles"][muscle.value]
        assert entry["group"] == group_of(muscle).value, muscle.value


def test_every_manifest_muscle_has_at_least_one_addressable_occurrence() -> None:
    manifest = _load_manifest()
    for muscle in MUSCLE_ORDER:
        occurrences = manifest["muscles"][muscle.value]["occurrences"]
        assert occurrences, f"{muscle.value} has no path occurrence"
        for occurrence in occurrences:
            assert occurrence["view"] in {"front", "back"}
            assert occurrence["side"] in {"left", "right", "center"}


def test_manifest_carries_no_unclassified_or_orphan_ids() -> None:
    manifest = _load_manifest()
    canonical = {muscle.value for muscle in MUSCLE_ORDER}
    assert "Unclassified" not in manifest["muscles"]
    assert set(manifest["muscles"].keys()) == canonical
