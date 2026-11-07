from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Migration:
    version: int
    name: str
    statements: tuple[str, ...]


KNOWLEDGE_SCHEMA_V1 = Migration(
    version=1,
    name="knowledge_library_foundation",
    statements=(
        """
        CREATE TABLE IF NOT EXISTS conversations (
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
        """,
        """
        CREATE TABLE IF NOT EXISTS knowledge_sources (
            id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
            kind TEXT NOT NULL CHECK (kind IN ('conversation', 'local_file', 'manual')),
            provider TEXT,
            external_ref TEXT,
            original_path TEXT,
            created_at TEXT NOT NULL,
            CHECK (
                (kind = 'conversation' AND provider IS NOT NULL
                    AND length(trim(provider)) > 0 AND original_path IS NULL)
                OR (kind = 'local_file' AND original_path IS NOT NULL
                    AND length(trim(original_path)) > 0 AND provider IS NULL
                    AND external_ref IS NULL)
                OR (kind = 'manual' AND provider IS NULL AND external_ref IS NULL
                    AND original_path IS NULL)
            )
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS knowledge_documents (
            id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
            kind TEXT NOT NULL CHECK (
                kind IN ('source', 'note', 'knowledge_point')
            ),
            status TEXT NOT NULL CHECK (
                status IN ('inbox', 'organized', 'archived')
            ),
            title TEXT NOT NULL CHECK (length(trim(title)) > 0),
            body_markdown TEXT NOT NULL,
            source_id TEXT REFERENCES knowledge_sources(id) ON DELETE RESTRICT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS ingest_events (
            id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
            kind TEXT NOT NULL CHECK (
                kind IN ('conversation_turn', 'file_import', 'manual')
            ),
            status TEXT NOT NULL CHECK (
                status IN ('received', 'materialized', 'ignored', 'failed')
            ),
            source_id TEXT NOT NULL REFERENCES knowledge_sources(id)
                ON DELETE RESTRICT,
            document_id TEXT REFERENCES knowledge_documents(id) ON DELETE RESTRICT,
            external_event_id TEXT UNIQUE,
            captured_at TEXT NOT NULL,
            received_at TEXT NOT NULL,
            CHECK (
                (status = 'materialized' AND document_id IS NOT NULL)
                OR (status <> 'materialized' AND document_id IS NULL)
            )
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS collections (
            id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
            name TEXT NOT NULL CHECK (length(trim(name)) > 0),
            parent_id TEXT REFERENCES collections(id) ON DELETE RESTRICT,
            created_at TEXT NOT NULL,
            CHECK (parent_id IS NULL OR parent_id <> id)
        )
        """,
        """
        CREATE UNIQUE INDEX IF NOT EXISTS collections_sibling_name_unique
        ON collections(COALESCE(parent_id, ''), name COLLATE NOCASE)
        """,
        """
        CREATE TABLE IF NOT EXISTS document_collections (
            document_id TEXT NOT NULL REFERENCES knowledge_documents(id)
                ON DELETE CASCADE,
            collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
            added_at TEXT NOT NULL,
            PRIMARY KEY (document_id, collection_id)
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS tags (
            id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
            name TEXT NOT NULL COLLATE NOCASE UNIQUE
                CHECK (length(trim(name)) > 0),
            created_at TEXT NOT NULL
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS document_tags (
            document_id TEXT NOT NULL REFERENCES knowledge_documents(id)
                ON DELETE CASCADE,
            tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
            added_at TEXT NOT NULL,
            PRIMARY KEY (document_id, tag_id)
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS attachments (
            id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
            document_id TEXT NOT NULL REFERENCES knowledge_documents(id)
                ON DELETE CASCADE,
            storage_mode TEXT NOT NULL CHECK (
                storage_mode IN ('reference', 'managed_copy')
            ),
            filename TEXT NOT NULL CHECK (length(trim(filename)) > 0),
            media_type TEXT,
            byte_size INTEGER CHECK (byte_size IS NULL OR byte_size >= 0),
            content_sha256 TEXT CHECK (
                content_sha256 IS NULL
                OR (length(content_sha256) = 64
                    AND content_sha256 NOT GLOB '*[^0-9a-f]*')
            ),
            original_path TEXT,
            managed_path TEXT,
            created_at TEXT NOT NULL,
            CHECK (
                (storage_mode = 'reference' AND original_path IS NOT NULL
                    AND length(trim(original_path)) > 0 AND managed_path IS NULL)
                OR (storage_mode = 'managed_copy' AND managed_path IS NOT NULL
                    AND length(trim(managed_path)) > 0 AND original_path IS NULL)
            )
        )
        """,
        """
        CREATE INDEX IF NOT EXISTS knowledge_documents_status_updated_idx
        ON knowledge_documents(status, updated_at DESC)
        """,
        """
        CREATE INDEX IF NOT EXISTS ingest_events_status_received_idx
        ON ingest_events(status, received_at)
        """,
        """
        CREATE INDEX IF NOT EXISTS attachments_document_idx
        ON attachments(document_id)
        """,
    ),
)

MIGRATIONS = (KNOWLEDGE_SCHEMA_V1,)
LATEST_SCHEMA_VERSION = MIGRATIONS[-1].version


class DatabaseSchema:
    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path

    def initialize(self) -> None:
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.database_path)
        try:
            connection.execute("PRAGMA foreign_keys = ON")
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version INTEGER PRIMARY KEY,
                    name TEXT NOT NULL UNIQUE,
                    applied_at TEXT NOT NULL
                )
                """
            )
            applied = {
                int(row[0])
                for row in connection.execute(
                    "SELECT version FROM schema_migrations"
                ).fetchall()
            }
            unsupported = [
                version for version in applied if version > LATEST_SCHEMA_VERSION
            ]
            if unsupported:
                raise RuntimeError(
                    "Database schema is newer than this application supports: "
                    f"{max(unsupported)} > {LATEST_SCHEMA_VERSION}"
                )

            for migration in MIGRATIONS:
                if migration.version in applied:
                    continue
                for statement in migration.statements:
                    connection.execute(statement)
                connection.execute(
                    """
                    INSERT INTO schema_migrations (version, name, applied_at)
                    VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                    """,
                    (migration.version, migration.name),
                )
            connection.commit()
        except BaseException:
            connection.rollback()
            raise
        finally:
            connection.close()
