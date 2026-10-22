"""Cross-language guard tying the web Avatar artwork to the backend catalog (#747).

The backend owns the curated Avatar catalog (``app.domain.avatars``) and the web
app owns the artwork, listed in the committed manifest
``apps/web/lib/avatar/manifest.json`` (ADR-0136, ADR-0137). Nothing in the web suite
can see the Python catalog, so this closes the loop from the API side: the manifest's
ids and Avatar Universes must be exactly the catalog's, in order. An Avatar or universe
added without portraits, or portraits left behind for a retired one, fails here; the web
suite checks each listed portrait file exists. Prior art: tests/test_atlas_muscle_contract.py."""

from __future__ import annotations

import json
from pathlib import Path

from app.domain.avatars import AVATAR_CATALOG, AVATAR_UNIVERSES

_MANIFEST_PATH = (
    Path(__file__).resolve().parents[2] / "web" / "lib" / "avatar" / "manifest.json"
)


def test_manifest_lists_exactly_the_catalog_ids_in_order() -> None:
    # Arrange
    catalog_ids = [avatar.id for avatar in AVATAR_CATALOG]

    # Act
    manifest = json.loads(_MANIFEST_PATH.read_text(encoding="utf-8"))

    # Assert
    assert manifest["avatars"] == catalog_ids


def test_manifest_lists_exactly_the_avatar_universes_in_order() -> None:
    # Act
    manifest = json.loads(_MANIFEST_PATH.read_text(encoding="utf-8"))

    # Assert
    assert manifest["universes"] == list(AVATAR_UNIVERSES)
