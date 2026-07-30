# 513: Add PostgreSQL migration snapshots and history

- Status: planned
- Milestone: 5
- Packages: `@ultimabase/postgres-migrations`
- Depends on: 204, 208, 511
- ADR: ADR-0008

## Goal

Create `_ultimabase_schema`, versioned normalized snapshots, and applied-migration history.

## Acceptance criteria

- [ ] The migration plugin alone creates its metadata table.
- [ ] Snapshot format has an explicit version.
- [ ] History updates transactionally with applied DDL where supported.

## Tests

- [ ] Fresh, existing, and incompatible metadata versions.
