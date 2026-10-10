"""Doc-link tripwire: every relative Markdown link must resolve to a real path.

Agents reach the domain docs (``GLOSSARY.md``, ``REVIEW.md``, the ADRs) through
pointers in other docs. A rename that leaves a pointer behind strands every
agent that follows it — ``CONTEXT.md`` became ``GLOSSARY.md`` with ~90 pointers
still naming the old file. This guard fails the suite when a ``[text](path)``
link in a tracked Markdown file names a path that does not exist.

Only relative links are checked: URLs, mail links and same-page anchors are
skipped, and a ``#fragment`` or ``?query`` is stripped before resolving.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

# <repo>/apps/api/app/quality/doc_link_guard.py → the root is four parents up.
REPO_ROOT = Path(__file__).resolve().parents[4]

# Directories never scanned: dependencies, build output, and vendored trees.
SKIPPED_DIRS: frozenset[str] = frozenset(
    {".git", "node_modules", ".next", ".venv", "venv", "__pycache__", ".pytest_cache"}
)

# Historical records allowed to quote links as they stood when written, and
# third-party skills vendored verbatim from upstream (their own link rot).
EXCLUDED_PATHS: tuple[str, ...] = (
    ".agents/skills",
    "docs/origin",
    "docs/ai",
    "docs/research",
)

# An inline Markdown link or image: ``[text](target)`` / ``![alt](target "title")``.
_LINK = re.compile(r"!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+\"[^\"]*\")?\s*\)")
_EXTERNAL = re.compile(r"^(?:[a-z][a-z0-9+.-]*:|//|#)", re.IGNORECASE)
_FENCE = re.compile(r"^\s*(```|~~~)")


@dataclass(frozen=True)
class BrokenLink:
    """A relative link whose target path does not exist."""

    file: str
    line: int
    target: str


def _markdown_files(root: Path) -> list[Path]:
    files = []
    for path in root.rglob("*.md"):
        rel = path.relative_to(root)
        if any(part in SKIPPED_DIRS for part in rel.parts):
            continue
        if rel.as_posix().startswith(EXCLUDED_PATHS):
            continue
        files.append(path)
    return sorted(files)


def _links(text: str) -> list[tuple[int, str]]:
    """Return ``(line, target)`` for each link outside fenced code blocks."""
    found = []
    in_fence = False
    for number, line in enumerate(text.splitlines(), start=1):
        if _FENCE.match(line):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        found.extend((number, match.group(1)) for match in _LINK.finditer(line))
    return found


def _resolves(source: Path, target: str, root: Path) -> bool:
    path_part = re.split(r"[#?]", target, maxsplit=1)[0]
    if not path_part:
        return True
    base = root if path_part.startswith("/") else source.parent
    return (base / path_part.lstrip("/")).exists()


def find_broken_links(repo_root: Path = REPO_ROOT) -> list[BrokenLink]:
    """Scan every Markdown file under ``repo_root`` for unresolvable links."""
    broken = []
    for path in _markdown_files(repo_root):
        text = path.read_text(encoding="utf-8", errors="replace")
        for line, target in _links(text):
            if _EXTERNAL.match(target) or _resolves(path, target, repo_root):
                continue
            broken.append(
                BrokenLink(
                    file=path.relative_to(repo_root).as_posix(), line=line, target=target
                )
            )
    return broken


def format_broken_links(broken: list[BrokenLink]) -> str:
    """Render findings one per line, ``file:line → target``."""
    return "\n".join(f"{b.file}:{b.line} → {b.target} (no such path)" for b in broken)
