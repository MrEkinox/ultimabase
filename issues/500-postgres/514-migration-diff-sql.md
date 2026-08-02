# 514: Generate PostgreSQL migration plans and SQL

- Status: planned
- Milestone: 5
- Packages: `@ultimabase/postgres-migrations`
- Depends on: 512, 513
- ADR: ADR-0008

## Goal

Generate immutable `MigrationPlan` instances, deterministic SQL files, and
snapshots from PostgreSQL schema differences.

## Acceptance criteria

- [ ] Plans classify safe, alter, and destructive steps.
- [ ] Explicit renames avoid drop/add.
- [ ] File names and content are reproducible.
- [ ] SQL generation can run without applying.
- [ ] `MigrationPlan` snapshots its ordered operations and exposes `hasChanges()`, `getOperations()`, `describe()`, and deterministic SQL generation.
- [ ] Plan inspection never opens a connection, applies SQL, or mutates plugin state.
- [ ] The migration plugin remains the only owner of plan application and policy decisions.
- [ ] Public methods and operation variants provide concise English JSDoc, autocomplete, and compact hovers.

## Tests

- [ ] Golden files for representative migrations.
- [ ] Runtime tests cover immutability, empty plans, operation ordering, descriptions, and repeated deterministic generation.
- [ ] Compile-time and language-service tests cover operation narrowing, autocomplete, and QuickInfo.
