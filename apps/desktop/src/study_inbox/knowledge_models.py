from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class KnowledgeBaseModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    @field_validator(
        "created_at",
        "updated_at",
        "captured_at",
        "received_at",
        check_fields=False,
    )
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("timestamps must include a timezone")
        return value


class SourceKind(StrEnum):
    CONVERSATION = "conversation"
    LOCAL_FILE = "local_file"
    MANUAL = "manual"


class DocumentKind(StrEnum):
    SOURCE = "source"
    NOTE = "note"
    KNOWLEDGE_POINT = "knowledge_point"


class DocumentStatus(StrEnum):
    INBOX = "inbox"
    ORGANIZED = "organized"
    ARCHIVED = "archived"


class IngestKind(StrEnum):
    CONVERSATION_TURN = "conversation_turn"
    FILE_IMPORT = "file_import"
    MANUAL = "manual"


class IngestStatus(StrEnum):
    RECEIVED = "received"
    MATERIALIZED = "materialized"
    IGNORED = "ignored"
    FAILED = "failed"


class AttachmentStorageMode(StrEnum):
    REFERENCE = "reference"
    MANAGED_COPY = "managed_copy"


class KnowledgeSource(KnowledgeBaseModel):
    id: str = Field(min_length=1)
    kind: SourceKind
    provider: str | None = None
    external_ref: str | None = None
    original_path: str | None = None
    created_at: datetime

    @model_validator(mode="after")
    def validate_kind_specific_fields(self) -> KnowledgeSource:
        if self.kind is SourceKind.CONVERSATION and (
            not self.provider
            or not self.provider.strip()
            or self.original_path is not None
        ):
            raise ValueError("conversation sources require a provider and no path")
        if self.kind is SourceKind.LOCAL_FILE and (
            not self.original_path
            or not self.original_path.strip()
            or self.provider is not None
            or self.external_ref is not None
        ):
            raise ValueError("local-file sources require only an original path")
        if self.kind is SourceKind.MANUAL and (
            self.provider is not None
            or self.external_ref is not None
            or self.original_path is not None
        ):
            raise ValueError("manual sources cannot identify an external resource")
        return self


class KnowledgeDocument(KnowledgeBaseModel):
    id: str = Field(min_length=1)
    kind: DocumentKind
    status: DocumentStatus
    title: str = Field(min_length=1)
    body_markdown: str
    source_id: str | None = None
    created_at: datetime
    updated_at: datetime


class Collection(KnowledgeBaseModel):
    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    parent_id: str | None = None
    created_at: datetime


class Tag(KnowledgeBaseModel):
    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    created_at: datetime


class Attachment(KnowledgeBaseModel):
    id: str = Field(min_length=1)
    document_id: str = Field(min_length=1)
    storage_mode: AttachmentStorageMode
    filename: str = Field(min_length=1)
    media_type: str | None = None
    byte_size: int | None = Field(default=None, ge=0)
    content_sha256: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")
    original_path: str | None = None
    managed_path: str | None = None
    created_at: datetime

    @model_validator(mode="after")
    def validate_storage_path(self) -> Attachment:
        if self.storage_mode is AttachmentStorageMode.REFERENCE:
            if not self.original_path or self.managed_path is not None:
                raise ValueError("referenced attachments require only an original path")
        elif not self.managed_path or self.original_path is not None:
            raise ValueError("managed attachments require only a managed path")
        return self


class IngestEvent(KnowledgeBaseModel):
    id: str = Field(min_length=1)
    kind: IngestKind
    status: IngestStatus
    source_id: str = Field(min_length=1)
    document_id: str | None = None
    external_event_id: str | None = None
    captured_at: datetime
    received_at: datetime
