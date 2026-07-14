from __future__ import annotations

from collections import defaultdict
from pathlib import Path

from study_inbox.models import StoredConversation


class MarkdownExporter:
    def __init__(self, export_directory: Path) -> None:
        self.export_directory = export_directory

    def export(self, conversations: list[StoredConversation]) -> list[Path]:
        grouped: dict[str, list[StoredConversation]] = defaultdict(list)
        for conversation in conversations:
            if not conversation.is_learning:
                continue
            grouped[conversation.subject].append(conversation)

        self.export_directory.mkdir(parents=True, exist_ok=True)
        exported: list[Path] = []
        for subject, subject_conversations in sorted(grouped.items()):
            destination = self.export_directory / f"{subject}.md"
            destination.write_text(
                self._render(subject, subject_conversations), encoding="utf-8"
            )
            exported.append(destination)
        return exported

    @staticmethod
    def _render(subject: str, conversations: list[StoredConversation]) -> str:
        sections = [f"# {subject}\n"]
        for conversation in conversations:
            sections.append(
                "\n".join(
                    (
                        f"## {conversation.normalized_question}",
                        "",
                        conversation.answer_summary,
                        "",
                        f"- Topic: {conversation.topic}",
                        f"- Captured: {conversation.captured_at}",
                        f"- Event ID: `{conversation.event_id}`",
                    )
                )
            )
        return "\n\n".join(sections).rstrip() + "\n"
