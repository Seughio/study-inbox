from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator, FormatChecker
from jsonschema.exceptions import ValidationError


class ConversationEventValidator:
    def __init__(self, contract_path: Path) -> None:
        with contract_path.open(encoding="utf-8") as contract_file:
            schema: dict[str, Any] = json.load(contract_file)
        Draft202012Validator.check_schema(schema)
        self._validator = Draft202012Validator(schema, format_checker=FormatChecker())

    def validate(self, payload: dict[str, object]) -> None:
        errors = sorted(self._validator.iter_errors(payload), key=self._error_key)
        if errors:
            raise errors[0]

    @staticmethod
    def _error_key(error: ValidationError) -> str:
        return ".".join(str(part) for part in error.absolute_path)
