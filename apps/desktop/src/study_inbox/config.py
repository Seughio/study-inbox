from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

DEFAULT_LLM_BASE_URL = "https://api.deepseek.com"
DEFAULT_LLM_MODEL = "deepseek-chat"
DEFAULT_LLM_TIMEOUT_SECONDS = 30.0


class ConfigurationError(ValueError):
    """Raised when environment configuration cannot produce valid settings."""


def repository_root() -> Path:
    return Path(__file__).resolve().parents[4]


@dataclass(frozen=True)
class LLMSettings:
    """Connection settings for an OpenAI-compatible chat completions endpoint."""

    api_key: str
    base_url: str = DEFAULT_LLM_BASE_URL
    model: str = DEFAULT_LLM_MODEL
    timeout_seconds: float = DEFAULT_LLM_TIMEOUT_SECONDS

    def __repr__(self) -> str:
        return (
            f"LLMSettings(api_key='***', base_url={self.base_url!r}, "
            f"model={self.model!r}, timeout_seconds={self.timeout_seconds!r})"
        )

    @classmethod
    def from_environment(cls) -> LLMSettings:
        api_key = os.environ.get("STUDY_INBOX_LLM_API_KEY", "").strip()
        if not api_key:
            raise ConfigurationError(
                "STUDY_INBOX_CLASSIFIER=llm requires STUDY_INBOX_LLM_API_KEY"
            )
        raw_timeout = os.environ.get("STUDY_INBOX_LLM_TIMEOUT", "").strip()
        try:
            timeout = float(raw_timeout) if raw_timeout else DEFAULT_LLM_TIMEOUT_SECONDS
        except ValueError as error:
            raise ConfigurationError(
                "STUDY_INBOX_LLM_TIMEOUT must be a number of seconds"
            ) from error
        if timeout <= 0:
            raise ConfigurationError("STUDY_INBOX_LLM_TIMEOUT must be positive")
        return cls(
            api_key=api_key,
            base_url=(
                os.environ.get("STUDY_INBOX_LLM_BASE_URL", "").strip()
                or DEFAULT_LLM_BASE_URL
            ),
            model=(
                os.environ.get("STUDY_INBOX_LLM_MODEL", "").strip() or DEFAULT_LLM_MODEL
            ),
            timeout_seconds=timeout,
        )


@dataclass(frozen=True)
class Settings:
    database_path: Path
    export_directory: Path
    contract_path: Path
    llm: LLMSettings | None = None

    @classmethod
    def from_environment(cls) -> Settings:
        data_directory = Path(
            os.environ.get(
                "STUDY_INBOX_DATA_DIR",
                Path.home() / ".study-inbox",
            )
        ).expanduser()
        classifier = os.environ.get("STUDY_INBOX_CLASSIFIER", "mock").strip().lower()
        if classifier == "mock":
            llm = None
        elif classifier == "llm":
            llm = LLMSettings.from_environment()
        else:
            raise ConfigurationError(
                f"STUDY_INBOX_CLASSIFIER must be 'mock' or 'llm', got {classifier!r}"
            )
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
            llm=llm,
        )
