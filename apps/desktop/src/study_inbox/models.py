from __future__ import annotations

from dataclasses import dataclass

from pydantic import BaseModel, ConfigDict


class Classification(BaseModel):
    model_config = ConfigDict(extra="forbid")

    is_learning: bool
    subject: str
    topic: str
    normalized_question: str
    answer_summary: str
    confidence: float


class StoredConversation(Classification):
    event_id: str
    source: str
    conversation_id: str | None
    question: str
    answer: str
    captured_at: str


class IngestResponse(BaseModel):
    created: bool
    conversation: StoredConversation


class ExportResponse(BaseModel):
    exported_files: list[str]
    conversation_count: int


@dataclass(frozen=True)
class ConversationEvent:
    event_id: str
    source: str
    conversation_id: str | None
    question: str
    answer: str
    captured_at: str

    @classmethod
    def from_payload(cls, payload: dict[str, object]) -> ConversationEvent:
        conversation_id = payload.get("conversation_id")
        return cls(
            event_id=str(payload["event_id"]),
            source=str(payload["source"]),
            conversation_id=(
                str(conversation_id) if conversation_id is not None else None
            ),
            question=str(payload["question"]),
            answer=str(payload["answer"]),
            captured_at=str(payload["captured_at"]),
        )
