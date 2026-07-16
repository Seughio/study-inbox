from __future__ import annotations

import shutil
from pathlib import Path

from conftest import make_event
from fastapi.testclient import TestClient

from study_inbox.app import create_app
from study_inbox.config import Settings, repository_root


def test_health_reports_local_runtime_configuration(
    client: TestClient, tmp_path: Path, export_directory: Path
) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "application_version": "0.1.0",
        "classifier_type": "MockClassifier",
        "database_path": str((tmp_path / "study-inbox.sqlite3").resolve()),
        "export_directory": str(export_directory.resolve()),
    }


def test_writes_and_lists_learning_conversation(client: TestClient) -> None:
    response = client.post("/api/v1/conversations", json=make_event())

    assert response.status_code == 201
    body = response.json()
    assert body["created"] is True
    assert body["conversation"]["is_learning"] is True
    assert body["conversation"]["subject"] == "mathematics"
    assert set(body["conversation"]) >= {
        "is_learning",
        "subject",
        "topic",
        "normalized_question",
        "answer_summary",
        "confidence",
    }

    listed = client.get("/api/v1/conversations")
    assert listed.status_code == 200
    assert [item["event_id"] for item in listed.json()] == ["event-001"]


def test_duplicate_event_is_written_only_once(client: TestClient) -> None:
    first = client.post("/api/v1/conversations", json=make_event())
    duplicate = client.post(
        "/api/v1/conversations",
        json=make_event(question="数学：这个不同内容不应覆盖原记录。"),
    )

    assert first.json()["created"] is True
    assert duplicate.json()["created"] is False
    assert duplicate.json()["conversation"]["question"] == make_event()["question"]
    assert len(client.get("/api/v1/conversations").json()) == 1


def test_non_learning_content_is_marked_and_not_exported(
    client: TestClient, export_directory: Path
) -> None:
    response = client.post(
        "/api/v1/conversations",
        json=make_event(
            question="周末午饭吃什么？",
            answer="可以根据手边食材选择简单的午饭。",
        ),
    )

    conversation = response.json()["conversation"]
    assert conversation["is_learning"] is False
    assert conversation["subject"] == "non-learning"
    export = client.post("/api/v1/export/markdown")
    assert export.json() == {"exported_files": [], "conversation_count": 0}
    assert list(export_directory.glob("*.md")) == []


def test_exports_one_markdown_file_per_subject(
    client: TestClient, export_directory: Path
) -> None:
    client.post("/api/v1/conversations", json=make_event())
    client.post(
        "/api/v1/conversations",
        json=make_event(
            event_id="event-physics",
            question="物理中的牛顿定律是什么？",
            answer="牛顿定律描述物体运动与受力的关系。",
        ),
    )

    response = client.post("/api/v1/export/markdown")

    assert response.status_code == 200
    assert response.json()["conversation_count"] == 2
    assert {path.name for path in export_directory.glob("*.md")} == {
        "mathematics.md",
        "physics.md",
    }
    mathematics = (export_directory / "mathematics.md").read_text(encoding="utf-8")
    physics = (export_directory / "physics.md").read_text(encoding="utf-8")
    assert "一元二次方程" in mathematics
    assert "牛顿定律" in physics
    assert "牛顿定律" not in mathematics


def test_rejects_payload_that_violates_shared_contract(client: TestClient) -> None:
    invalid = make_event()
    invalid["captured_at"] = "not-a-date"
    invalid["unexpected"] = "not allowed"

    response = client.post("/api/v1/conversations", json=invalid)

    assert response.status_code == 422
    assert client.get("/api/v1/conversations").json() == []


def test_repeated_app_shutdown_releases_windows_file_handles(tmp_path: Path) -> None:
    for index in range(3):
        run_directory = tmp_path / f"lifecycle-{index}"
        settings = Settings(
            database_path=run_directory / "study-inbox.sqlite3",
            export_directory=run_directory / "exports",
            contract_path=(
                repository_root() / "contracts" / "conversation-event.schema.json"
            ),
        )

        with TestClient(create_app(settings)) as test_client:
            response = test_client.post(
                "/api/v1/conversations",
                json=make_event(event_id=f"lifecycle-event-{index}"),
            )
            assert response.status_code == 201
            assert test_client.post("/api/v1/export/markdown").status_code == 200

        shutil.rmtree(run_directory)
        assert not run_directory.exists()
