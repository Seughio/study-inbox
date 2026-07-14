from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def repository_root() -> Path:
    return Path(__file__).resolve().parents[4]


@dataclass(frozen=True)
class Settings:
    database_path: Path
    export_directory: Path
    contract_path: Path

    @classmethod
    def from_environment(cls) -> Settings:
        data_directory = Path(
            os.environ.get(
                "STUDY_INBOX_DATA_DIR",
                Path.home() / ".study-inbox",
            )
        ).expanduser()
        return cls(
            database_path=Path(
                os.environ.get(
                    "STUDY_INBOX_DATABASE",
                    data_directory / "study-inbox.sqlite3",
                )
            ).expanduser(),
            export_directory=Path(
                os.environ.get(
                    "STUDY_INBOX_EXPORT_DIR",
                    data_directory / "markdown",
                )
            ).expanduser(),
            contract_path=(
                repository_root() / "contracts" / "conversation-event.schema.json"
            ),
        )
