"""The closed Training Type set (GLOSSARY 'Training Type').

A Session — and every Logged Session — is typed by one of these, drawn from a small curated
set and never AI- or user-invented. Shared by the Curated Protocol integrity gate and the
Builder's deploy boundary (#707), so both accept exactly the same kinds. Pure: no I/O.
"""

from __future__ import annotations

TRAINING_TYPES: frozenset[str] = frozenset({"strength", "cardio", "hiit", "yoga", "mobility"})
