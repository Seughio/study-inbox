# Study Inbox repository instructions

## Product principles

1. Do not require users to manually maintain a knowledge base.
2. Raw conversations and documents remain local by default.
3. Never move a file without explicit user approval.
4. Every file move must be logged and reversible.
5. Do not collect unrelated browsing data.
6. Request host permissions only for explicitly supported AI websites.
7. Prefer a reliable narrow implementation over broad incomplete support.

## Repository structure

- apps/extension: TypeScript Chrome Manifest V3 extension
- apps/desktop: Python local desktop agent
- contracts: JSON schemas shared between components
- fixtures: sanitized test fixtures
- docs: architecture and decision records

Do not introduce another top-level application without updating
ARCHITECTURE.md first.

## Development rules

- Implement one vertical feature at a time.
- Do not implement future milestones unless explicitly requested.
- Add tests for every parser, classifier contract and file operation.
- Do not depend on live ChatGPT pages in automated tests.
- Store sanitized HTML fixtures for site-adapter tests.
- Use deterministic mock classifiers in tests.
- Do not commit secrets, user documents, conversation data or databases.
- All paths must be handled with pathlib on the Python side.
- All file moves must check collisions before execution.
- Ignore temporary files such as .crdownload, .tmp and ~$ files.
- Validate all messages crossing the extension/desktop boundary.
- Keep business logic independent from the UI.

## Definition of done

A task is complete only when:

1. Relevant tests pass.
2. Formatting and static checks pass.
3. README or development docs are updated.
4. No unrelated files are changed.
5. The final response lists changed files, commands run and known limitations.
