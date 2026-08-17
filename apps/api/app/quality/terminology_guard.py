"""Terminology guard: regression tripwires for forbidden domain terms.

``CONTEXT.md`` fixes the domain's language and lists, for every concept, the
words to _Avoid_. Most of those are casual synonyms that only matter in prose;
a handful are *hard regressions* — a term the codebase was deliberately moved
away from (or one whose very shape encodes a rejected design), whose reappearance
as an identifier is a bug. This guard encodes that second set as executable
tripwires, so each class of regression is caught forever rather than
re-litigated in review — the domain glossary made enforceable.

Each :class:`BannedTerm` pairs a pattern that matches the *identifier* forms
(``dailyStreak``, ``daily_streak``, a ``/route`` segment) while leaving ordinary
English prose untouched, with the guidance a developer needs to fix it. The
guard is intentionally simple — a tripwire, not a general-purpose linter — and
every term in the registry is verified absent from the current tree by
``test_current_tree_has_no_terminology_violations``.

Adding the next renamed or rejected term is a one-line addition to
``BANNED_TERMS``.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

# Repo root, resolved from this file: app/quality/terminology_guard.py lives at
# <repo>/apps/api/app/quality/terminology_guard.py, so the root is four parents up.
REPO_ROOT = Path(__file__).resolve().parents[4]

# Source trees to scan — the production surface, backend and frontend.
SOURCE_ROOTS: tuple[str, ...] = (
    "apps/api/app",
    "apps/web/app",
    "apps/web/components",
    "apps/web/lib",
)

# Paths intentionally left untouched by the guard:
# - the guard's own module necessarily names the forbidden terms to forbid them;
# - the Alembic migrations must retain the historical ``program`` table/column
#   names to perform and reverse the rename;
# - the origin idea documents and the Codex PR-comments analysis are historical
#   records allowed to quote the original wording verbatim.
EXCLUDED_PATHS: tuple[str, ...] = (
    "apps/api/app/quality/terminology_guard.py",
    "apps/api/app/alembic",
    "docs/origin",
    "docs/ai/codex-pr17-comments-analysis.md",
)

# File extensions worth scanning inside the source roots.
SCAN_EXTENSIONS: frozenset[str] = frozenset({".py", ".ts", ".tsx", ".js", ".jsx"})


@dataclass(frozen=True)
class BannedTerm:
    """A forbidden domain term, its identifier pattern, and how to fix it.

    ``pattern`` must match only *identifier* forms so ordinary English prose in
    comments (e.g. "the training program ran") never trips the guard.
    ``guidance`` is shown to the developer and names the term to use instead and
    the CONTEXT.md / ADR reference that fixes it.
    """

    name: str
    pattern: re.Pattern[str]
    guidance: str
    # Paths where *this* term alone is legitimate — the one module allowed to build
    # what everywhere else must route through. Distinct from ``EXCLUDED_PATHS``, which
    # switches the whole registry off for a file; a per-term exemption keeps every other
    # tripwire live there. Empty for a term that is banned everywhere.
    allowed_paths: tuple[str, ...] = ()


# The registry. Every entry is a *hard* regression — a term the codebase moved
# away from or whose shape encodes a rejected design — verified absent from the
# current tree. Casual prose synonyms from CONTEXT.md's _Avoid_ lists are
# deliberately NOT here: they collide with legitimate identifiers ("weight",
# "status", "level", "feedback") and belong in review, not a tripwire.
BANNED_TERMS: tuple[BannedTerm, ...] = (
    BannedTerm(
        name="Program",
        # Capitalized identifier fragment ("ProgramRepository"), the snake_case
        # fragment ("program_id"), and the "/programs" route segment — while
        # leaving lowercase prose such as "the program ran" untouched.
        pattern=re.compile(r"Program|program_|/programs?\b"),
        guidance=(
            "The domain concept 'Program' was renamed to 'Protocol' (issue #44, "
            "ADR-0007). Rename these identifiers to 'Protocol'."
        ),
    ),
    BannedTerm(
        name="daily streak",
        pattern=re.compile(r"daily_streak|dailyStreak|/daily-streak\b"),
        guidance=(
            "Streak is deliberately *weekly*, not daily (ADR-0001, CONTEXT 'Streak'): "
            "the plan model is self-paced and calendar-free, so there is no 'today' "
            "to miss. Use the weekly consecutive-week Streak."
        ),
    ),
    BannedTerm(
        name="personal best",
        pattern=re.compile(r"personal_best|personalBest"),
        guidance=(
            "Use 'Personal Record' — the best Estimated 1RM ever logged (CONTEXT "
            "'Personal Record'). 'personal best' is the deliberately-avoided raw "
            "heaviest-load concept it must never be confused with."
        ),
    ),
    BannedTerm(
        name="max weight",
        pattern=re.compile(r"max_weight|maxWeight"),
        guidance=(
            "Load is a typed value, never a bare kg (CONTEXT 'Load'). Per-Exercise "
            "strength is the Personal Record (Estimated 1RM), not a 'max weight' tile "
            "(CONTEXT 'Personal Record')."
        ),
    ),
    BannedTerm(
        name="readiness/recovery score",
        pattern=re.compile(
            r"readiness_score|readinessScore|recovery_score|recoveryScore"
            r"|recovery_percent|recoveryPercent"
        ),
        guidance=(
            "Readiness is a qualitative three-state signal (Ready / Caution / Extra "
            "Caution), NOT a computed score or recovery percentage (ADR-0001, CONTEXT "
            "'Readiness'): the calendar-free model gives no honest basis for a "
            "recovery %."
        ),
    ),
    BannedTerm(
        name="mileage",
        pattern=re.compile(r"mileage|Mileage"),
        guidance=(
            "The weekly-distance projection is 'Distance', reported in kilometres "
            "(CONTEXT 'Distance', ADR-0049). The app is metric-canonical; 'mileage' "
            "smuggles in an imperial unit. Use Distance / kilometres."
        ),
    ),
    BannedTerm(
        name="stored pace",
        pattern=re.compile(r"stored_pace|storedPace|pace_column"),
        guidance=(
            "Pace is a read-time projection over a distance Quantity's metres and "
            "companion duration, never stored (ADR-0032, CONTEXT 'Quantity'). A "
            "stored-pace field reinvents the derived value that ADR eliminated."
        ),
    ),
    BannedTerm(
        name="amount (Quantity label)",
        # Only the quoted display-label form (``label="Amount"``, ``const x = "Amount"``)
        # is banned — the user-facing word for the amount axis is "Quantity" (issue #345).
        # Scoped to the label string so internal identifiers (``DEFAULT_AMOUNT_KIND``,
        # ``performedAmount``) and prose that name the amount axis stay legal.
        pattern=re.compile(r"[\"']Amount[\"']"),
        guidance=(
            "The amount picker's user-facing label is 'Quantity', not 'Amount' (CONTEXT "
            "'Quantity' lists 'amount' under _Avoid_; ADR-0032/0050). Rename the display "
            "label to 'Quantity'. Internal identifiers naming the amount axis are fine — "
            "only the quoted label string is banned."
        ),
    ),
    BannedTerm(
        name="hand-rolled LoggedSetRecord",
        # Only the *construction* form — ``LoggedSetRecord(`` — is banned. Type
        # annotations (``list[LoggedSetRecord]``) and imports carry no paren and stay
        # legal, so a read model may still name the type it receives.
        pattern=re.compile(r"LoggedSetRecord\("),
        guidance=(
            "Flatten Logged Sessions through "
            "'domain/personal_records.logged_set_records' instead. A hand-rolled "
            "LoggedSetRecord is the shape that drops the Performed Body Weight "
            "(ADR-0026), which is exactly how the First Record milestone came to "
            "disagree with every other Personal-Record surface (ADR-0029)."
        ),
        allowed_paths=("apps/api/app/domain/personal_records.py",),
    ),
)


@dataclass(frozen=True)
class Finding:
    """A single forbidden-term occurrence, located by repo-relative path.

    ``match`` is the offending substring; ``term`` and ``guidance`` identify
    which banned term matched and how to fix it.
    """

    file: str
    line: int
    text: str
    match: str
    term: str = ""
    guidance: str = ""


def is_excluded(rel_path: str, excluded: tuple[str, ...] = EXCLUDED_PATHS) -> bool:
    """Whether ``rel_path`` (repo-relative, POSIX) falls under an excluded path."""
    return any(rel_path == e or rel_path.startswith(f"{e}/") for e in excluded)


def find_violations(
    repo_root: Path = REPO_ROOT,
    source_roots: tuple[str, ...] = SOURCE_ROOTS,
    excluded: tuple[str, ...] = EXCLUDED_PATHS,
    terms: tuple[BannedTerm, ...] = BANNED_TERMS,
) -> list[Finding]:
    """Scan the source roots and return every forbidden-term occurrence found."""
    findings: list[Finding] = []
    for root in source_roots:
        base = repo_root / root
        if not base.exists():
            continue
        for path in sorted(base.rglob("*")):
            if not path.is_file() or path.suffix not in SCAN_EXTENSIONS:
                continue
            rel_path = path.relative_to(repo_root).as_posix()
            if is_excluded(rel_path, excluded):
                continue
            findings.extend(_scan_file(path, rel_path, terms))
    return findings


def find_stray_program(
    repo_root: Path = REPO_ROOT,
    source_roots: tuple[str, ...] = SOURCE_ROOTS,
    excluded: tuple[str, ...] = EXCLUDED_PATHS,
) -> list[Finding]:
    """Scan for stray "Program" identifiers only (the original rename tripwire)."""
    program_term = next(t for t in BANNED_TERMS if t.name == "Program")
    return find_violations(repo_root, source_roots, excluded, terms=(program_term,))


def _scan_file(path: Path, rel_path: str, terms: tuple[BannedTerm, ...]) -> list[Finding]:
    findings: list[Finding] = []
    text = path.read_text(encoding="utf-8", errors="ignore")
    for lineno, line in enumerate(text.splitlines(), start=1):
        for term in terms:
            if term.allowed_paths and is_excluded(rel_path, term.allowed_paths):
                continue
            match = term.pattern.search(line)
            if match:
                findings.append(
                    Finding(
                        file=rel_path,
                        line=lineno,
                        text=line.strip(),
                        match=match.group(),
                        term=term.name,
                        guidance=term.guidance,
                    )
                )
    return findings


def format_findings(findings: list[Finding]) -> str:
    """Render findings into a message naming each offending file, match, and fix."""
    lines = [
        "Forbidden terminology found — these identifiers regress the domain "
        "language fixed in CONTEXT.md. Fix each before merging:",
    ]
    for f in findings:
        guidance = f" — {f.guidance}" if f.guidance else ""
        lines.append(f"  {f.file}:{f.line}: {f.text!r} (matched {f.match!r}){guidance}")
    return "\n".join(lines)
