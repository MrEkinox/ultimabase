# 515: Apply migrations with lock and drift protection

- Status: planned
- Milestone: 5
- Packages: `@ultimabase/postgres-migrations-plugin`
- Depends on: 513, 514
- ADR: ADR-0008

## Goal

Claim schema preparation, serialize concurrent startup, enforce policies, and detect drift.

## Acceptance criteria

- [ ] PostgreSQL advisory locking prevents concurrent application.
- [ ] Other instances wait then verify.
- [ ] Files, metadata, and live-schema disagreement fails safely.
- [ ] Repair requires an explicit future command.

## Tests

- [ ] Concurrent starts and drift fixtures.

## Architecture prerequisite after milestone 31

Accepted [ADR-0266](../../docs/adr/0266-defer-migration-only-protocols.md)
is implemented by issue 3110: the preinstalled migration protocols are removed. This future feature
must first decide its integration against the current public kernel; it cannot
assume `adapterMigrationCapability`, upgrade-intent helpers or
`postgresSchemaPreparationCapability` remain available. Current direct
synchronization, physical provenance and private storage remain supported.
The original dependency chain stays intact. No replacement extension point or
migration implementation is authorized by milestone 31.
