from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, status
from jsonschema.exceptions import ValidationError

from study_inbox import __version__
from study_inbox.classifier import MockClassifier
from study_inbox.config import Settings
from study_inbox.database import ConversationRepository
from study_inbox.exporter import MarkdownExporter
from study_inbox.models import (
    ConversationEvent,
    ExportResponse,
    HealthResponse,
    IngestResponse,
    StoredConversation,
)
from study_inbox.validation import ConversationEventValidator


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved_settings = settings or Settings.from_environment()
    repository = ConversationRepository(resolved_settings.database_path)
    classifier = MockClassifier()
    exporter = MarkdownExporter(resolved_settings.export_directory)
    validator = ConversationEventValidator(resolved_settings.contract_path)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        repository.initialize()
        yield

    app = FastAPI(title="Study Inbox Local API", version="0.1.0", lifespan=lifespan)

    @app.get("/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse(
            status="ok",
            application_version=__version__,
            classifier_type=type(classifier).__name__,
            database_path=str(resolved_settings.database_path.resolve()),
            export_directory=str(resolved_settings.export_directory.resolve()),
        )

    @app.post(
        "/api/v1/conversations",
        response_model=IngestResponse,
        status_code=status.HTTP_201_CREATED,
    )
    def create_conversation(payload: dict[str, object]) -> IngestResponse:
        try:
            validator.validate(payload)
        except ValidationError as error:
            path = ".".join(str(part) for part in error.absolute_path)
            location = f" at '{path}'" if path else ""
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Conversation event is invalid{location}: {error.message}",
            ) from error

        event = ConversationEvent.from_payload(payload)
        created, conversation = repository.add(event, classifier.classify(event))
        return IngestResponse(created=created, conversation=conversation)

    @app.get(
        "/api/v1/conversations",
        response_model=list[StoredConversation],
    )
    def list_conversations() -> list[StoredConversation]:
        return repository.list_all()

    @app.post("/api/v1/export/markdown", response_model=ExportResponse)
    def export_markdown() -> ExportResponse:
        conversations = repository.list_learning()
        paths = exporter.export(conversations)
        return ExportResponse(
            exported_files=[str(path) for path in paths],
            conversation_count=len(conversations),
        )

    return app
