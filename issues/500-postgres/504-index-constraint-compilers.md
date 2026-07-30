# 504: Compile indexes and constraints

- Status: planned
- Milestone: 5
- Packages: `@ultimabase/postgres`
- Depends on: 114, 503
- ADR: ADR-0007

## Goal

Compile unique, composite, ordinary indexes, and supported check constraints.

## Acceptance criteria

- [ ] Names are deterministic and length-safe.
- [ ] Unique composites can become upsert targets.
- [ ] Unsupported constraints fail before DDL execution.

## Tests

- [ ] PostgreSQL catalog assertions.
