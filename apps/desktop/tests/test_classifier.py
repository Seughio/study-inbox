from study_inbox.classifier import MockClassifier
from study_inbox.models import ConversationEvent


def test_mock_classifier_is_deterministic() -> None:
    event = ConversationEvent(
        event_id="classifier-event",
        source="chatgpt",
        conversation_id=None,
        question="  如何用 Python   实现算法？ ",
        answer="可以先定义输入和输出，再编写步骤。",
        captured_at="2026-01-02T03:04:05Z",
    )
    classifier = MockClassifier()

    first = classifier.classify(event)
    second = classifier.classify(event)

    assert first == second
    assert first.is_learning is True
    assert first.subject == "computer-science"
    assert first.topic == "算法"
    assert first.normalized_question == "如何用 Python 实现算法？"
    assert first.answer_summary == "可以先定义输入和输出，再编写步骤。"
    assert first.confidence == 0.95
