from __future__ import annotations

import json
from pathlib import Path

import pytest
from jsonschema.exceptions import ValidationError

from study_inbox.config import repository_root
from study_inbox.validation import ConversationEventValidator


def fixture_directory() -> Path:
    return repository_root() / "fixtures" / "conversations"


def load_fixture(name: str) -> dict[str, object]:
    with (fixture_directory() / name).open(encoding="utf-8") as fixture_file:
        payload: dict[str, object] = json.load(fixture_file)
    return payload


@pytest.mark.parametrize(
    "fixture_name",
    [
        "learning-thermodynamics.json",
        "learning-ai.json",
        "non-learning.json",
    ],
)
def test_valid_conversation_fixtures_match_shared_schema(fixture_name: str) -> None:
    validator = ConversationEventValidator(
        repository_root() / "contracts" / "conversation-event.schema.json"
    )

    validator.validate(load_fixture(fixture_name))


def test_invalid_conversation_fixture_is_rejected_by_shared_schema() -> None:
    validator = ConversationEventValidator(
        repository_root() / "contracts" / "conversation-event.schema.json"
    )

    with pytest.raises(ValidationError):
        validator.validate(load_fixture("invalid.json"))
