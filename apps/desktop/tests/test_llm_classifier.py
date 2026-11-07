from __future__ import annotations

import json
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

import httpx
import pytest
from conftest import make_event
from fastapi.testclient import TestClient

from study_inbox.app import create_app
from study_inbox.config import (
    ConfigurationError,
    LLMSettings,
    Settings,
    repository_root,
)
from study_inbox.llm_classifier import (
    MAX_ANSWER_CHARS,
    ClassifierUnavailableError,
    LLMClassifier,
)
from study_inbox.models import Classification, ConversationEvent

API_KEY = "sk-test-not-a-real-key"

Handler = Callable[[httpx.Request], httpx.Response]


def make_conversation(
    question: str = "它的判别式是什么？", answer: str = "Δ=b²-4ac。"
) -> ConversationEvent:
    return ConversationEvent.from_payload(
        make_event(question=question, answer=answer)  # type: ignore[arg-type]
    )


def completion(content: object) -> httpx.Response:
    text = content if isinstance(content, str) else json.dumps(content)
    return httpx.Response(200, json={"choices": [{"message": {"content": text}}]})


def make_classifier(handler: Handler) -> LLMClassifier:
    settings = LLMSettings(api_key=API_KEY, base_url="https://llm.test")
    client = httpx.Client(
        base_url=settings.base_url, transport=httpx.MockTransport(handler)
    )
    return LLMClassifier(settings, client=client)


LEARNING_OUTPUT: dict[str, Any] = {
    "is_learning": True,
    "subject": "Mathematics",
    "topic": "一元二次方程判别式",
    "normalized_question": "一元二次方程\n的判别式是什么？",
    "answer_summary": "判别式 Δ=b²-4ac，用于判断实根个数。",
    "confidence": 0.9,
}


def test_learning_turn_is_classified_from_model_json() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return completion(LEARNING_OUTPUT)

    result = make_classifier(handler).classify(make_conversation())

    assert result == Classification(
        is_learning=True,
        subject="mathematics",
        topic="一元二次方程判别式",
        normalized_question="一元二次方程 的判别式是什么？",
        answer_summary="判别式 Δ=b²-4ac，用于判断实根个数。",
        confidence=0.9,
    )
    assert len(requests) == 1
    request = requests[0]
    assert request.url == "https://llm.test/chat/completions"
    assert request.headers["Authorization"] == f"Bearer {API_KEY}"
    body = json.loads(request.content)
    assert body["model"] == "deepseek-chat"
    assert body["response_format"] == {"type": "json_object"}
    assert "它的判别式是什么？" in body["messages"][1]["content"]


def test_non_learning_turn_uses_reserved_subject() -> None:
    output = {**LEARNING_OUTPUT, "is_learning": False, "subject": "food"}

    result = make_classifier(lambda _: completion(output)).classify(make_conversation())

    assert result.is_learning is False
    assert result.subject == "non-learning"
    assert result.topic == "non-learning"


def test_invalid_output_is_retried_once() -> None:
    responses = iter([completion("not json"), completion(LEARNING_OUTPUT)])

    result = make_classifier(lambda _: next(responses)).classify(make_conversation())

    assert result.subject == "mathematics"


@pytest.mark.parametrize(
    "subject", ["../secrets", "con", "non-learning", "数学", "a" * 41, ""]
)
def test_unsafe_subject_is_rejected(subject: str) -> None:
    output = {**LEARNING_OUTPUT, "subject": subject}

    with pytest.raises(ClassifierUnavailableError):
        make_classifier(lambda _: completion(output)).classify(make_conversation())


def test_server_errors_raise_without_leaking_key() -> None:
    calls = 0

    def handler(_: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(500)

    with pytest.raises(ClassifierUnavailableError) as raised:
        make_classifier(handler).classify(make_conversation())

    assert calls == 2
    assert "HTTP 500" in str(raised.value)
    assert API_KEY not in str(raised.value)


def test_authentication_failure_is_not_retried() -> None:
    calls = 0

    def handler(_: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(401)

    with pytest.raises(ClassifierUnavailableError):
        make_classifier(handler).classify(make_conversation())

    assert calls == 1


def test_long_answer_is_truncated_before_sending() -> None:
    sent: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        sent.append(json.loads(request.content)["messages"][1]["content"])
        return completion(LEARNING_OUTPUT)

    make_classifier(handler).classify(make_conversation(answer="x" * 50_000))

    assert len(sent[0]) < MAX_ANSWER_CHARS + 1_000


class FailingClassifier:
    def classify(self, event: ConversationEvent) -> Classification:
        raise ClassifierUnavailableError("LLM classifier unavailable: HTTP 500")


class CountingClassifier:
    def __init__(self) -> None:
        self.calls = 0

    def classify(self, event: ConversationEvent) -> Classification:
        self.calls += 1
        return Classification(**{**LEARNING_OUTPUT, "subject": "mathematics"})


def build_settings(tmp_path: Path) -> Settings:
    return Settings(
        database_path=tmp_path / "study-inbox.sqlite3",
        export_directory=tmp_path / "exports",
        contract_path=repository_root()
        / "contracts"
        / "conversation-event.schema.json",
    )


@pytest.fixture
def failing_client(tmp_path: Path) -> Iterator[TestClient]:
    app = create_app(build_settings(tmp_path), classifier=FailingClassifier())
    with TestClient(app) as test_client:
        yield test_client


def test_unavailable_classifier_returns_503_and_stores_nothing(
    failing_client: TestClient,
) -> None:
    response = failing_client.post("/api/v1/conversations", json=make_event())

    assert response.status_code == 503
    assert failing_client.get("/api/v1/conversations").json() == []


def test_duplicate_event_does_not_call_classifier_again(tmp_path: Path) -> None:
    classifier = CountingClassifier()
    app = create_app(build_settings(tmp_path), classifier=classifier)

    with TestClient(app) as test_client:
        first = test_client.post("/api/v1/conversations", json=make_event())
        second = test_client.post("/api/v1/conversations", json=make_event())

    assert first.json()["created"] is True
    assert second.json()["created"] is False
    assert classifier.calls == 1


def test_environment_defaults_to_mock_classifier(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("STUDY_INBOX_CLASSIFIER", raising=False)

    assert Settings.from_environment().llm is None


def test_llm_classifier_requires_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("STUDY_INBOX_CLASSIFIER", "llm")
    monkeypatch.delenv("STUDY_INBOX_LLM_API_KEY", raising=False)

    with pytest.raises(ConfigurationError):
        Settings.from_environment()


def test_llm_settings_are_read_from_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("STUDY_INBOX_CLASSIFIER", "LLM")
    monkeypatch.setenv("STUDY_INBOX_LLM_API_KEY", API_KEY)
    monkeypatch.setenv("STUDY_INBOX_LLM_MODEL", "custom-model")
    monkeypatch.setenv("STUDY_INBOX_LLM_TIMEOUT", "12.5")

    llm = Settings.from_environment().llm

    assert llm is not None
    assert llm.model == "custom-model"
    assert llm.timeout_seconds == 12.5
    assert API_KEY not in repr(llm)


def test_unknown_classifier_name_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("STUDY_INBOX_CLASSIFIER", "gpt")

    with pytest.raises(ConfigurationError):
        Settings.from_environment()
