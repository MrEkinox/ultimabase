# 210: Validate plugin-provided extension handlers

- Status: completed
- Milestone: 2
- Packages: `@ultimabase/core`, `@ultimabase/schema`
- Depends on: 103, 207, 209
- ADR: ADR-0002, ADR-0051

## Goal

Fail setup when a schema or field extension has no installed plugin handler.

## Acceptance criteria

- [x] Errors identify schema, field when relevant, extension, and expected plugin.
- [x] Duplicate handlers follow an explicit conflict policy.
- [x] Validation happens before infrastructure mutation.

## Tests

- [x] Missing, duplicate, and successful handler fixtures.
