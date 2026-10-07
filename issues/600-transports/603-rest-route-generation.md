# 603: Generate REST route metadata

- Status: superseded
- Superseded by: 2306
- Milestone: 6
- Packages: `@ultimabase/rest-plugin`
- Depends on: 113, 601
- ADR: ADR-0004, ADR-0009

## Goal

Generate individually configurable CRUD, query, count, and bulk route definitions.

## Acceptance criteria

- [ ] Plural paths derive from schema naming.
- [ ] Each operation can be disabled.
- [ ] Route generation contains no Runtime execution or Hono code.

## Tests

- [ ] Metadata fixtures for enabled and disabled operations.
