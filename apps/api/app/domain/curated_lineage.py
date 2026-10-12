"""Curated lineage — which Curated Protocol, and which version, a plan was adopted from
(ADR-0130, issue #688).

An immutable plan property, the twin of Session Provenance and ``trace_id`` lineage
(ADR-0043): Adopt writes it on the Protocol and each of its Sessions, nothing else ever
changes it, and Duplicate and Redeem carry it forward unchanged. The ``name`` is the Curated
Protocol's name *as adopted*, kept so a read can say "Based on <name>" without consulting
the registry: adopting copies the plan once and nothing re-syncs it, so a later version's
rename never reaches an existing copy. A plan adopted from a Generated Protocol, or authored
by hand, has no lineage (``None``).

Pure: no I/O, no ORM."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class CuratedLineage:
    """The Curated Protocol a plan was adopted from: its identifier, version and name."""

    identifier: str
    version: int
    name: str

    def to_dict(self) -> dict:
        return {"identifier": self.identifier, "version": self.version, "name": self.name}


def lineage_from_columns(
    identifier: str | None, version: int | None, name: str | None
) -> CuratedLineage | None:
    """The lineage stored across a row's three nullable columns, or ``None`` when the row
    has none. The columns are written together, so a partial set reads as no lineage."""

    if identifier is None or version is None or name is None:
        return None
    return CuratedLineage(identifier=identifier, version=version, name=name)


class LineageColumns(Protocol):
    """Any row carrying the three lineage columns — a Protocol or a Session."""

    curated_identifier: str | None
    curated_version: int | None
    curated_name: str | None


def lineage_of(row: LineageColumns) -> CuratedLineage | None:
    """The lineage a Protocol or Session row stores, or ``None``."""

    return lineage_from_columns(
        row.curated_identifier, row.curated_version, row.curated_name
    )


def lineage_columns(lineage: CuratedLineage | None) -> dict[str, str | int | None]:
    """The three column values that store ``lineage`` on a row — all ``None`` for none.
    The inverse of :func:`lineage_from_columns`, so every write stamps them together."""

    if lineage is None:
        return {"curated_identifier": None, "curated_version": None, "curated_name": None}
    return {
        "curated_identifier": lineage.identifier,
        "curated_version": lineage.version,
        "curated_name": lineage.name,
    }


def lineage_dict(lineage: CuratedLineage | None) -> dict | None:
    """The JSON shape a read exposes: the lineage's dict, or ``None``."""

    return None if lineage is None else lineage.to_dict()


__all__ = [
    "CuratedLineage",
    "LineageColumns",
    "lineage_from_columns",
    "lineage_of",
    "lineage_columns",
    "lineage_dict",
]
