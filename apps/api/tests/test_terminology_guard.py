"""Regression tripwire for the Program to Protocol rename (issue #48).

These tests exercise the terminology guard through its public interface:
``find_stray_program`` walks the backend and frontend source roots and reports
any stray whole-word "Program" identifier so the rename can't silently regress.
"""

from __future__ import annotations

from pathlib import Path

from app.quality.terminology_guard import (
    find_stray_program,
    format_findings,
    is_excluded,
)


def _write(root: Path, rel: str, body: str) -> Path:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body, encoding="utf-8")
    return path


def test_flags_stray_program_identifier_in_backend_source(tmp_path: Path) -> None:
    # Arrange — a backend source file reintroduces the old name
    _write(tmp_path, "apps/api/app/repositories/foo.py", "class ProgramRepository:\n    pass\n")

    # Act
    findings = find_stray_program(repo_root=tmp_path)

    # Assert — the offending file and match are reported
    assert len(findings) == 1
    finding = findings[0]
    assert finding.file == "apps/api/app/repositories/foo.py"
    assert finding.match == "Program"
    assert finding.line == 1


def test_current_tree_passes_cleanly() -> None:
    # Act — scan the real, post-rename repository
    findings = find_stray_program()

    # Assert — nothing stray remains (message included to ease debugging failures)
    assert findings == [], format_findings(findings)


def test_excludes_migrations_and_historical_docs(tmp_path: Path) -> None:
    # Arrange — "Program" appears only in paths the guard is meant to skip
    _write(tmp_path, "apps/api/app/alembic/versions/0009_rename.py", "rename('program')\n")
    _write(tmp_path, "docs/origin/idea-en.md", "The Program is the plan.\n")
    _write(
        tmp_path,
        "docs/ai/codex-pr17-comments-analysis.md",
        "> quoting GeneratedProgramSession\n",
    )

    # Act
    findings = find_stray_program(repo_root=tmp_path)

    # Assert — historical/migration references are allowed
    assert findings == []


def test_historical_doc_paths_are_recognized_as_excluded() -> None:
    # The origin idea docs and the Codex analysis are explicitly excluded so a
    # future historical quote reintroducing "Program" won't trip the guard.
    assert is_excluded("docs/origin/idea-fr.md")
    assert is_excluded("docs/ai/codex-pr17-comments-analysis.md")
    assert not is_excluded("apps/api/app/repositories/protocol_repository.py")


def test_catches_snake_case_and_route_forms_in_frontend(tmp_path: Path) -> None:
    # Arrange — a frontend file with a snake_case field and a route segment
    _write(
        tmp_path,
        "apps/web/app/protocols/page.tsx",
        'const program_id = 1;\nfetch("/programs");\n',
    )

    # Act
    findings = find_stray_program(repo_root=tmp_path)

    # Assert — both identifier forms are reported
    matched = {(f.line, f.match) for f in findings}
    assert (1, "program_") in matched
    assert (2, "/programs") in matched


def test_ignores_lowercase_english_prose(tmp_path: Path) -> None:
    # Arrange — "program" as an ordinary English word, not an identifier
    _write(
        tmp_path,
        "apps/api/app/notes.py",
        "# the training program ran; deprogram the cache before reprogramming\n",
    )

    # Act
    findings = find_stray_program(repo_root=tmp_path)

    # Assert — no false positive on prose
    assert findings == []


def test_message_identifies_offending_file_and_match(tmp_path: Path) -> None:
    # Arrange
    _write(tmp_path, "apps/api/app/generation/foo.py", "GeneratedProgram = 1\n")

    # Act
    message = format_findings(find_stray_program(repo_root=tmp_path))

    # Assert — a developer can see the file, line, and match at a glance
    assert "apps/api/app/generation/foo.py" in message
    assert ":1:" in message
    assert "Program" in message
