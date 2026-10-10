"""Doc-link tripwire: a relative Markdown link must name a path that exists."""

from __future__ import annotations

from pathlib import Path

from app.quality.doc_link_guard import find_broken_links, format_broken_links


def _write(root: Path, rel: str, body: str) -> Path:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body, encoding="utf-8")
    return path


def test_flags_a_link_to_a_renamed_doc(tmp_path: Path) -> None:
    # Arrange — CLAUDE.md still points at the old name of a renamed glossary
    _write(tmp_path, "GLOSSARY.md", "# Glossary\n")
    _write(tmp_path, "CLAUDE.md", "Intro.\n\nRead [the terms](./CONTEXT.md) first.\n")

    # Act
    broken = find_broken_links(repo_root=tmp_path)

    # Assert
    assert len(broken) == 1
    assert broken[0].file == "CLAUDE.md"
    assert broken[0].line == 3
    assert broken[0].target == "./CONTEXT.md"


def test_resolves_links_relative_to_the_linking_file(tmp_path: Path) -> None:
    # Arrange — a nested doc links up and across, with an anchor
    _write(tmp_path, "GLOSSARY.md", "# Glossary\n")
    _write(tmp_path, "docs/adr/0001-x.md", "See [Load](../../GLOSSARY.md#load).\n")

    # Act
    broken = find_broken_links(repo_root=tmp_path)

    # Assert
    assert broken == []


def test_skips_urls_anchors_and_fenced_code(tmp_path: Path) -> None:
    # Arrange
    _write(
        tmp_path,
        "README.md",
        "[site](https://example.com) [top](#top) [mail](mailto:a@b.c)\n"
        "```md\n[example](./missing.md)\n```\n",
    )

    # Act
    broken = find_broken_links(repo_root=tmp_path)

    # Assert
    assert broken == []


def test_skips_dependency_and_historical_trees(tmp_path: Path) -> None:
    # Arrange — broken links only where the guard is meant not to look
    _write(tmp_path, "apps/web/node_modules/pkg/README.md", "[x](./gone.md)\n")
    _write(tmp_path, "docs/origin/idea.md", "[x](./gone.md)\n")

    # Act
    broken = find_broken_links(repo_root=tmp_path)

    # Assert
    assert broken == []


def test_current_tree_has_no_broken_doc_links() -> None:
    # Act
    broken = find_broken_links()

    # Assert
    assert broken == [], format_broken_links(broken)
