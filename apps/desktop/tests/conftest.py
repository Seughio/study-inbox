from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from study_inbox.app import create_app
from study_inbox.config import Settings, repository_root


@pytest.fixture
def export_directory(tmp_path: Path) -> Path:
    return tmp_path / "exports"


@pytest.fixture
def client(
    tmp_path: Path,
    export_directory: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[TestClient]:
    ignored_environment_path = tmp_path / "environment-must-not-be-used"
    monkeypatch.setenv("STUDY_INBOX_DATA_DIR", str(ignored_environment_path))
    monkeypatch.setenv(
        "STUDY_INBOX_DATABASE", str(ignored_environment_path / "ignored.sqlite3")
    )
    monkeypatch.setenv(
        "STUDY_INBOX_EXPORT_DIR", str(ignored_environment_path / "ignored-exports")
    )
    settings = Settings(
        database_path=tmp_path / "study-inbox.sqlite3",
        export_directory=export_directory,
        contract_path=(
            repository_root() / "contracts" / "conversation-event.schema.json"
        ),
    )
    with TestClient(create_app(settings)) as test_client:
        yield test_client
    assert not ignored_environment_path.exists()


def make_event(
    event_id: str = "event-001",
    question: str = "请解释数学中的一元二次方程。",
    answer: str = "一元二次方程可以写成 ax² + bx + c = 0。",
) -> dict[str, str]:
    return {
        "event_id": event_id,
        "source": "chatgpt",
        "conversation_id": "sanitized-conversation",
        "question": question,
        "answer": answer,
        "captured_at": "2026-01-02T03:04:05Z",
    }
