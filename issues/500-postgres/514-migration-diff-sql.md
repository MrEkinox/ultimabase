# 514: Generate PostgreSQL migration plans and SQL

- Status: planned
- Milestone: 5
- Packages: `@ultimabase/postgres-migrations`
- Depends on: 512, 513
- ADR: ADR-0008

## Goal

Generate deterministic plans, SQL files, and snapshots from schema differences.

## Acceptance criteria

- [ ] Plans classify safe, alter, and destructive steps.
- [ ] Explicit renames avoid drop/add.
- [ ] File names and content are reproducible.
- [ ] SQL generation can run without applying.

## Tests

- [ ] Golden files for representative migrations.
