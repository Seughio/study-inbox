from __future__ import annotations

import sqlite3
from datetime import UTC, datetime
from pathlib import Path

import pytest
from pydantic import ValidationError

from study_inbox.knowledge_models import (
    Attachment,
    AttachmentStorageMode,
    KnowledgeSource,
    SourceKind,
)
from study_inbox.schema import LATEST_SCHEMA_VERSION, DatabaseSchema


def connect(database_path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(database_path)
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def table_names(connection: sqlite3.Connection) -> set[str]:
    rows = connection.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table'"
    ).fetchall()
    return {str(row[0]) for row in rows}


def test_initialization_creates_versioned_knowledge_schema(tmp_path: Path) -> None:
    database_path = tmp_path / "study-inbox.sqlite3"

    DatabaseSchema(database_path).initialize()

    with connect(database_path) as connection:
        assert table_names(connection) >= {
            "conversations",
            "schema_migrations",
            "knowledge_sources",
            "knowledge_documents",
            "ingest_events",
            "collections",
            "document_collections",
            "tags",
            "document_tags",
            "attachments",
        }
        migration = connection.execute(
            "SELECT version, name FROM schema_migrations"
        ).fetchall()
        assert migration == [(LATEST_SCHEMA_VERSION, "knowledge_library_foundation")]


def test_schema_initialization_is_idempotent(tmp_path: Path) -> None:
    database_path = tmp_path / "study-inbox.sqlite3"
    schema = DatabaseSchema(database_path)

    schema.initialize()
    schema.initialize()

    with connect(database_path) as connection:
        assert connection.execute(
            "SELECT count(*) FROM schema_migrations"
        ).fetchone() == (1,)


def test_newer_database_schema_fails_safely(tmp_path: Path) -> None:
    database_path = tmp_path / "future.sqlite3"
    with connect(database_path) as connection:
        connection.execute(
            """
            CREATE TABLE schema_migrations (
                version INTEGER PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                applied_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            INSERT INTO schema_migrations (version, name, applied_at)
            VALUES (?, ?, ?)
            """,
            (
                LATEST_SCHEMA_VERSION + 1,
                "future-schema",
                "2026-09-18T00:00:00Z",
            ),
        )

    with pytest.raises(RuntimeError, match="newer than this application supports"):
        DatabaseSchema(database_path).initialize()


def test_migration_preserves_existing_conversation_rows(tmp_path: Path) -> None:
    database_path = tmp_path / "legacy.sqlite3"
    with connect(database_path) as connection:
        connection.execute(
            """
            CREATE TABLE conversations (
                event_id TEXT PRIMARY KEY,
                source TEXT NOT NULL,
                conversation_id TEXT,
                question TEXT NOT NULL,
                answer TEXT NOT NULL,
                captured_at TEXT NOT NULL,
                is_learning INTEGER NOT NULL,
                subject TEXT NOT NULL,
                topic TEXT NOT NULL,
                normalized_question TEXT NOT NULL,
                answer_summary TEXT NOT NULL,
                confidence REAL NOT NULL
            )
            """
        )
        connection.execute(
            """
            INSERT INTO conversations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "event-existing",
                "deepseek",
                "local-conversation",
                "synthetic question",
                "synthetic answer",
                "2026-09-18T00:00:00Z",
                1,
                "synthetic-subject",
                "synthetic-topic",
                "synthetic normalized question",
                "synthetic answer summary",
                1.0,
            ),
        )

    DatabaseSchema(database_path).initialize()

    with connect(database_path) as connection:
        assert connection.execute(
            "SELECT question FROM conversations WHERE event_id = ?",
            ("event-existing",),
        ).fetchone() == ("synthetic question",)
        assert connection.execute(
            "SELECT count(*) FROM knowledge_documents"
        ).fetchone() == (0,)
        assert connection.execute("SELECT count(*) FROM ingest_events").fetchone() == (
            0,
        )


def test_relations_support_virtual_collections_and_tags(tmp_path: Path) -> None:
    database_path = tmp_path / "study-inbox.sqlite3"
    DatabaseSchema(database_path).initialize()

    with connect(database_path) as connection:
        connection.execute(
            """
            INSERT INTO knowledge_sources (
                id, kind, provider, external_ref, created_at
            ) VALUES (?, ?, ?, ?, ?)
            """,
            (
                "source-1",
                "conversation",
                "doubao",
                "local-only-reference",
                "2026-09-18T00:00:00Z",
            ),
        )
        connection.execute(
            """
            INSERT INTO knowledge_documents (
                id, kind, status, title, body_markdown, source_id,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "document-1",
                "source",
                "inbox",
                "Synthetic title",
                "Synthetic body",
                "source-1",
                "2026-09-18T00:00:00Z",
                "2026-09-18T00:00:00Z",
            ),
        )
        connection.execute(
            "INSERT INTO collections (id, name, created_at) VALUES (?, ?, ?)",
            ("collection-1", "Physics", "2026-09-18T00:00:00Z"),
        )
        connection.execute(
            "INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)",
            ("tag-1", "Thermodynamics", "2026-09-18T00:00:00Z"),
        )
        connection.execute(
            """
            INSERT INTO document_collections (
                document_id, collection_id, added_at
            ) VALUES (?, ?, ?)
            """,
            ("document-1", "collection-1", "2026-09-18T00:00:00Z"),
        )
        connection.execute(
            """
            INSERT INTO document_tags (document_id, tag_id, added_at)
            VALUES (?, ?, ?)
            """,
            ("document-1", "tag-1", "2026-09-18T00:00:00Z"),
        )

        assert connection.execute(
            "SELECT count(*) FROM document_collections"
        ).fetchone() == (1,)
        assert connection.execute("SELECT count(*) FROM document_tags").fetchone() == (
            1,
        )


def test_schema_rejects_invalid_attachment_storage_and_foreign_keys(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "study-inbox.sqlite3"
    DatabaseSchema(database_path).initialize()

    with connect(database_path) as connection:
        connection.execute(
            """
            INSERT INTO knowledge_sources (id, kind, created_at)
            VALUES (?, ?, ?)
            """,
            ("source-1", "manual", "2026-09-18T00:00:00Z"),
        )
        connection.execute(
            """
            INSERT INTO knowledge_documents (
                id, kind, status, title, body_markdown, source_id,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "document-1",
                "note",
                "inbox",
                "Synthetic title",
                "Synthetic body",
                "source-1",
                "2026-09-18T00:00:00Z",
                "2026-09-18T00:00:00Z",
            ),
        )

        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                """
                INSERT INTO attachments (
                    id, document_id, storage_mode, filename,
                    original_path, managed_path, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    "attachment-1",
                    "document-1",
                    "reference",
                    "synthetic.pdf",
                    "D:/synthetic.pdf",
                    "managed/synthetic.pdf",
                    "2026-09-18T00:00:00Z",
                ),
            )

        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                """
                INSERT INTO attachments (
                    id, document_id, storage_mode, filename,
                    original_path, created_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    "attachment-2",
                    "missing-document",
                    "reference",
                    "synthetic.pdf",
                    "D:/synthetic.pdf",
                    "2026-09-18T00:00:00Z",
                ),
            )


def test_domain_models_enforce_source_and_attachment_boundaries() -> None:
    now = datetime(2026, 9, 18, tzinfo=UTC)

    with pytest.raises(ValidationError):
        KnowledgeSource(id="source-1", kind=SourceKind.CONVERSATION, created_at=now)

    with pytest.raises(ValidationError):
        KnowledgeSource(
            id="source-2",
            kind=SourceKind.MANUAL,
            created_at=datetime(2026, 9, 18),
        )

    with pytest.raises(ValidationError):
        Attachment(
            id="attachment-1",
            document_id="document-1",
            storage_mode=AttachmentStorageMode.REFERENCE,
            filename="synthetic.pdf",
            original_path="D:/synthetic.pdf",
            managed_path="managed/synthetic.pdf",
            created_at=now,
        )
