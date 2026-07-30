# 402: Implement Role class and internal schema

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/roles`
- Depends on: 112, 204, 401
- ADR: ADR-0005, ADR-0006

## Goal

Define immutable Role values with UUID, unique name, and display name plus internal persistence metadata.

## Acceptance criteria

- [ ] Names are unique case-insensitively.
- [ ] Role persistence uses RequestEngine, not Active Record.
- [ ] Generated transport exposure is off by default.

## Tests

- [ ] Construction and type tests.
