from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient
from test_fixtures import load_fixture


def test_demo_dependencies_cover_deduplication_and_export(
    client: TestClient, export_directory: Path
) -> None:
    thermodynamics = load_fixture("learning-thermodynamics.json")
    artificial_intelligence = load_fixture("learning-ai.json")
    non_learning = load_fixture("non-learning.json")

    first = client.post("/api/v1/conversations", json=thermodynamics)
    duplicate = client.post("/api/v1/conversations", json=thermodynamics)
    daily = client.post("/api/v1/conversations", json=non_learning)
    ai = client.post("/api/v1/conversations", json=artificial_intelligence)

    assert first.json()["created"] is True
    assert first.json()["conversation"]["subject"] == "physics"
    assert duplicate.json()["created"] is False
    assert daily.json()["conversation"]["is_learning"] is False
    assert ai.json()["conversation"]["subject"] == "computer-science"
    assert len(client.get("/api/v1/conversations").json()) == 3

    export = client.post("/api/v1/export/markdown")

    assert export.status_code == 200
    assert export.json()["conversation_count"] == 2
    physics = (export_directory / "physics.md").read_text(encoding="utf-8")
    computer_science = (export_directory / "computer-science.md").read_text(
        encoding="utf-8"
    )
    all_markdown = physics + computer_science
    assert physics.count("fixture-learning-thermodynamics") == 1
    assert "热力学第一定律" in physics
    assert "人工智能算法" in computer_science
    assert "今天午餐" not in all_markdown
