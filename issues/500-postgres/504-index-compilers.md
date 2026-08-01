# 504: Compile indexes

- Status: ready
- Milestone: 5
- Packages: `@ultimabase/postgres`
- Depends on: 114, 503
- ADR: ADR-0007

## Goal

Compile unique, composite, and ordinary indexes.

## Acceptance criteria

- [ ] Names are deterministic and length-safe.
- [ ] Unique composites can become upsert targets.

## Tests

- [ ] PostgreSQL catalog assertions.
