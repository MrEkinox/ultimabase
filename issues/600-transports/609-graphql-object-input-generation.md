# 609: Generate GraphQL objects and inputs

- Status: planned
- Milestone: 6
- Packages: `@ultimabase/graphql-plugin`
- Depends on: 112, 608
- ADR: ADR-0010, ADR-0014

## Goal

Generate object, create, update, enum, JSON, array, date, and system-field types.

## Acceptance criteria

- [ ] GraphQL names are deterministic and collision-checked.
- [ ] Dates use an explicit scalar.
- [ ] Context-dependent readable fields are nullable.
- [ ] Create/update inputs exclude system fields.

## Tests

- [ ] Schema snapshot and invalid-name fixtures.
