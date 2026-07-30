# 304: Add selection, ordering, limit, and skip

- Status: planned
- Milestone: 3
- Packages: `@ultimabase/query`
- Depends on: 301
- ADR: ADR-0004

## Goal

Represent selected fields, includes, deterministic ordering, limit, and offset.

## Acceptance criteria

- [ ] Selected and ordered fields are schema-checked.
- [ ] Limits reject invalid values.
- [ ] Duplicate selection and ordering normalize predictably.

## Tests

- [ ] Runtime and type tests.
