# 402: Implement Role class and internal schema

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/roles`
- Depends on: 112, 204, 420, 747
- ADR: ADR-0005, ADR-0006, ADR-0116

## Goal

Define immutable Role values and an internal schema built on the completed
relation contracts, without making roles a Core Access concept.

## Acceptance criteria

- [ ] Names are unique case-insensitively.
- [ ] Role persistence uses RequestEngine, not Active Record.
- [ ] Generated transport exposure is off by default.
- [ ] Role and membership relations use the same public relation primitives available to application schemas.
- [ ] The package implements the neutral provider contracts from issue 420 without Core importing `@ultimabase/roles`.

## Tests

- [ ] Construction and type tests.
