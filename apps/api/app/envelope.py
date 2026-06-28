"""Consistent response envelope for all API responses.

Every response carries a ``success`` flag, a nullable ``data`` payload, and a
nullable ``error`` message; paginated responses add a ``meta`` block."""

from __future__ import annotations

from typing import Any


def success_envelope(data: Any, *, meta: dict | None = None) -> dict[str, Any]:
    body: dict[str, Any] = {"success": True, "data": data, "error": None}
    if meta is not None:
        body["meta"] = meta
    return body


def error_envelope(message: str) -> dict[str, Any]:
    return {"success": False, "data": None, "error": message}
