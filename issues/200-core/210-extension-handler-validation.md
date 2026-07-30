# 210: Validate plugin-provided extension handlers

- Status: planned
- Milestone: 2
- Packages: `@ultimabase/core`, `@ultimabase/schema`
- Depends on: 103, 207, 209
- ADR: ADR-0002

## Goal

Fail setup when a schema or field extension has no installed plugin handler.

## Acceptance criteria

- [ ] Errors identify schema, field when relevant, extension, and expected plugin.
- [ ] Duplicate handlers follow an explicit conflict policy.
- [ ] Validation happens before infrastructure mutation.

## Tests

- [ ] Missing, duplicate, and successful handler fixtures.
