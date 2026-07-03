"""Terminology guard: a regression tripwire for the Program to Protocol rename.

The domain concept once called *Program* was renamed to *Protocol* everywhere in
the codebase (issue #44). This guard scans the backend and frontend source and
fails if a stray whole-word "Program" identifier reappears, so a future change
can't silently regress the rename. It is intentionally simple — a tripwire, not
a general-purpose linter.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

# Repo root, resolved from this file: app/quality/terminology_guard.py lives at
# <repo>/apps/api/app/quality/terminology_guard.py, so the root is four parents up.
REPO_ROOT = Path(__file__).resolve().parents[4]

# Source trees to scan — the renamed production surface, backend and frontend.
SOURCE_ROOTS: tuple[str, ...] = (
    "apps/api/app",
    "apps/web/app",
    "apps/web/components",
    "apps/web/lib",
)

# Paths intentionally left untouched by the guard:
# - the guard's own module necessarily names "Program" to describe what it forbids;
# - the Alembic migrations must retain the historical ``program`` table/column
#   names to perform and reverse the rename;
# - the origin idea documents and the Codex PR-comments analysis are historical
#   records allowed to quote the original "Program" wording verbatim.
EXCLUDED_PATHS: tuple[str, ...] = (
    "apps/api/app/quality/terminology_guard.py",
    "apps/api/app/alembic",
    "docs/origin",
    "docs/ai/codex-pr17-comments-analysis.md",
)

# File extensions worth scanning inside the source roots.
SCAN_EXTENSIONS: frozenset[str] = frozenset({".py", ".ts", ".tsx", ".js", ".jsx"})

# Matches the capitalized identifier fragment "Program" (class names, components,
# strings), the snake_case fragment "program_" (columns/variables like
# ``program_id``), and the "/programs" route segment — while leaving lowercase
# English prose such as "the program ran" untouched.
PATTERN = re.compile(r"Program|program_|/programs?\b")


@dataclass(frozen=True)
class Finding:
    """A single stray-"Program" occurrence, located by repo-relative path."""

    file: str
    line: int
    text: str
    match: str


def is_excluded(rel_path: str, excluded: tuple[str, ...] = EXCLUDED_PATHS) -> bool:
    """Whether ``rel_path`` (repo-relative, POSIX) falls under an excluded path."""
    return any(rel_path == e or rel_path.startswith(f"{e}/") for e in excluded)


def find_stray_program(
    repo_root: Path = REPO_ROOT,
    source_roots: tuple[str, ...] = SOURCE_ROOTS,
    excluded: tuple[str, ...] = EXCLUDED_PATHS,
) -> list[Finding]:
    """Scan the source roots and return every stray "Program" occurrence found."""
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
            findings.extend(_scan_file(path, rel_path))
    return findings


def _scan_file(path: Path, rel_path: str) -> list[Finding]:
    findings: list[Finding] = []
    text = path.read_text(encoding="utf-8", errors="ignore")
    for lineno, line in enumerate(text.splitlines(), start=1):
        match = PATTERN.search(line)
        if match:
            findings.append(
                Finding(
                    file=rel_path,
                    line=lineno,
                    text=line.strip(),
                    match=match.group(),
                )
            )
    return findings


def format_findings(findings: list[Finding]) -> str:
    """Render findings into a message that names each offending file and match."""
    lines = [
        "Stray 'Program' terminology found — the Program->Protocol rename has "
        "regressed. Rename these to 'Protocol':",
    ]
    for f in findings:
        lines.append(f"  {f.file}:{f.line}: {f.text!r} (matched {f.match!r})")
    return "\n".join(lines)
