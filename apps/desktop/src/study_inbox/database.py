from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from study_inbox.models import Classification, ConversationEvent, StoredConversation


class ConversationRepository:
    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path

    def initialize(self) -> None:
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connection() as connection:
            connection.execute(
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
                """
            )

    def add(
        self, event: ConversationEvent, classification: Classification
    ) -> tuple[bool, StoredConversation]:
        with self._connection() as connection:
            cursor = connection.execute(
                """
                INSERT OR IGNORE INTO conversations (
                    event_id, source, conversation_id, question, answer, captured_at,
                    is_learning, subject, topic, normalized_question, answer_summary,
                    confidence
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    event.event_id,
                    event.source,
                    event.conversation_id,
                    event.question,
                    event.answer,
                    event.captured_at,
                    classification.is_learning,
                    classification.subject,
                    classification.topic,
                    classification.normalized_question,
                    classification.answer_summary,
                    classification.confidence,
                ),
            )
            stored = self.get(event.event_id, connection)
            if stored is None:
                raise RuntimeError("Conversation insert did not produce a stored row")
            return cursor.rowcount == 1, stored

    def get(
        self,
        event_id: str,
        connection: sqlite3.Connection | None = None,
    ) -> StoredConversation | None:
        if connection is not None:
            row = connection.execute(
                "SELECT * FROM conversations WHERE event_id = ?", (event_id,)
            ).fetchone()
            return self._from_row(row) if row is not None else None

        with self._connection() as owned_connection:
            row = owned_connection.execute(
                "SELECT * FROM conversations WHERE event_id = ?", (event_id,)
            ).fetchone()
            return self._from_row(row) if row is not None else None

    def list_all(self) -> list[StoredConversation]:
        with self._connection() as connection:
            rows = connection.execute(
                "SELECT * FROM conversations ORDER BY captured_at, event_id"
            ).fetchall()
        return [self._from_row(row) for row in rows]

    def list_learning(self) -> list[StoredConversation]:
        with self._connection() as connection:
            rows = connection.execute(
                """
                SELECT * FROM conversations
                WHERE is_learning = 1
                ORDER BY subject, captured_at, event_id
                """
            ).fetchall()
        return [self._from_row(row) for row in rows]

    @contextmanager
    def _connection(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    @staticmethod
    def _from_row(row: sqlite3.Row) -> StoredConversation:
        return StoredConversation(
            event_id=row["event_id"],
            source=row["source"],
            conversation_id=row["conversation_id"],
            question=row["question"],
            answer=row["answer"],
            captured_at=row["captured_at"],
            is_learning=bool(row["is_learning"]),
            subject=row["subject"],
            topic=row["topic"],
            normalized_question=row["normalized_question"],
            answer_summary=row["answer_summary"],
            confidence=row["confidence"],
        )
