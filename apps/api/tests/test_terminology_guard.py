"""Regression tripwire for the Program to Protocol rename (issue #48).

These tests exercise the terminology guard through its public interface:
``find_stray_program`` walks the backend and frontend source roots and reports
any stray whole-word "Program" identifier so the rename can't silently regress.
"""

from __future__ import annotations

from pathlib import Path

from app.quality.terminology_guard import (
    BANNED_TERMS,
    find_stray_program,
    find_violations,
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


# --- Generalized registry: the guard now enforces more than the Program rename ---


def test_current_tree_has_no_terminology_violations() -> None:
    # Act — scan the real tree for the full banned-term registry
    findings = find_violations()

    # Assert — every registered term is absent from production source
    assert findings == [], format_findings(findings)


def test_flags_daily_streak_identifier(tmp_path: Path) -> None:
    # Arrange — Streak is weekly, not daily (ADR-0001)
    _write(tmp_path, "apps/api/app/domain/streak.py", "daily_streak = 0\n")

    # Act
    findings = find_violations(repo_root=tmp_path)

    # Assert
    assert len(findings) == 1
    assert findings[0].term == "daily streak"
    assert findings[0].match == "daily_streak"


def test_flags_personal_best_and_max_weight_in_frontend(tmp_path: Path) -> None:
    # Arrange — both are deliberately-avoided synonyms for Personal Record / Load
    _write(
        tmp_path,
        "apps/web/lib/exercise-stats-view.ts",
        "const personalBest = 100;\nconst max_weight = 200;\n",
    )

    # Act
    findings = find_violations(repo_root=tmp_path)

    # Assert — both offending identifiers are reported
    matched = {(f.line, f.match) for f in findings}
    assert (1, "personalBest") in matched
    assert (2, "max_weight") in matched


def test_flags_readiness_and_recovery_score_forms(tmp_path: Path) -> None:
    # Arrange — Readiness is a 3-state signal, never a computed score/percentage
    _write(
        tmp_path,
        "apps/web/lib/home-view.ts",
        "const readinessScore = 0.8;\nconst recovery_percent = 87;\n",
    )

    # Act
    findings = find_violations(repo_root=tmp_path)

    # Assert
    matched = {f.match for f in findings}
    assert "readinessScore" in matched
    assert "recovery_percent" in matched


def test_ignores_recovery_as_english_prose(tmp_path: Path) -> None:
    # Arrange — the domain legitimately says there is *no* recovery figure; only
    # the compound score/percentage identifier forms are banned, not bare prose.
    _write(
        tmp_path,
        "apps/api/app/domain/readiness.py",
        "# no fatigue/recovery/volume figure is present\n",
    )

    # Act
    findings = find_violations(repo_root=tmp_path)

    # Assert — bare "recovery" prose is not a violation
    assert findings == []


def test_flags_a_hand_rolled_logged_set_record(tmp_path: Path) -> None:
    # Arrange — a read model re-inlining the flattening instead of routing through the
    # one domain seam; this is the shape that drops the Performed Body Weight (ADR-0029)
    _write(
        tmp_path,
        "apps/api/app/logbook/some_read_model.py",
        "records = [LoggedSetRecord(exercise_id=1, reps=5)]\n",
    )

    # Act
    findings = find_violations(repo_root=tmp_path)

    # Assert
    assert len(findings) == 1
    assert findings[0].term == "hand-rolled LoggedSetRecord"
    assert findings[0].match == "LoggedSetRecord("


def test_allows_the_flattening_module_to_build_records(tmp_path: Path) -> None:
    # Arrange — the one module the term is exempted in, plus a banned term it is NOT
    # exempted from, so the per-term allowance cannot silence the whole registry there
    _write(
        tmp_path,
        "apps/api/app/domain/personal_records.py",
        "record = LoggedSetRecord(exercise_id=1, reps=5)\nprogram_id = 7\n",
    )

    # Act
    findings = find_violations(repo_root=tmp_path)

    # Assert — the construction is allowed here; every other tripwire stays live
    assert [(f.term, f.match) for f in findings] == [("Program", "program_")]


def test_type_annotations_naming_the_record_are_not_flagged(tmp_path: Path) -> None:
    # Arrange — only the construction form is banned; naming the type stays legal so a
    # read model can still declare what it receives
    _write(
        tmp_path,
        "apps/api/app/logbook/some_read_model.py",
        "def f(records: list[LoggedSetRecord]) -> LoggedSetRecord | None: ...\n",
    )

    # Act / Assert
    assert find_violations(repo_root=tmp_path) == []


def test_registry_has_no_duplicate_term_names() -> None:
    # A duplicate name would make find_stray_program's lookup ambiguous.
    names = [term.name for term in BANNED_TERMS]
    assert len(names) == len(set(names))
