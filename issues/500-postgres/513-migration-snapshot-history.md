# 513: Add PostgreSQL migration snapshots and history

- Status: blocked
- Milestone: 5
- Packages: `@ultimabase/postgres-migrations-plugin`
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

## Architecture prerequisite after milestone 31

Accepted [ADR-0266](../../docs/adr/0266-defer-migration-only-protocols.md)
is implemented by issue 3110: the preinstalled migration protocols are removed. This future feature
must first decide its integration against the current public kernel; it cannot
assume `adapterMigrationCapability`, upgrade-intent helpers or
`postgresSchemaPreparationCapability` remain available. Current direct
synchronization, physical provenance and private storage remain supported.
The original dependency chain stays intact. No replacement extension point or
migration implementation is authorized by milestone 31.
