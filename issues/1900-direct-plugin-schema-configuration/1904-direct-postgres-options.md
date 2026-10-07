# 1904: Migrate PostgreSQL metadata to direct options

- Status: completed
- Milestone: 19
- Packages: `@ultimabase/postgres-plugin`, `@ultimabase/core`, `@ultimabase/typegen`
- Depends on: 1903
- ADR: decision from issue 1901, ADR-0078, ADR-0082, ADR-0138

## Goal

Replace PostgreSQL table and column extensions with direct plugin-owned schema
and field options compiled by the PostgreSQL plugin.

## Acceptance criteria

- [x] A direct `postgres` schema option carries the explicit physical table name with strict validation and exact autocomplete.
- [x] A direct `postgres` field option carries `renamedFrom` migration intent on every supported field shape, including nested paths where currently legal.
- [x] Both options are unknown without `postgresPlugin()`, fail static compilation when forged or malformed, and retain owner and contribution provenance.
- [x] Naming, escaping, schema compilation, synchronization, migration diffing, archive inspection, and application isolation preserve their current behavior.
- [x] `postgresTable()`, `postgresColumn()`, their extension names and types, extension readers, exports, documentation, and examples are removed in the same change.
- [x] PostgreSQL consumes only its direct option contracts and adds no database vocabulary to Core.
- [x] ADR-0078, ADR-0082, and ADR-0138 are superseded or refined without rewriting their history.

## Tests

- [x] Runtime, type, Typegen, language-service, JavaScript, Typegen-free, packed-package, migration, and Testcontainers tests cover both direct options.
- [x] Missing-plugin, malformed-option, identifier-escaping, rename, nesting, and multi-application regressions pass.
- [x] `yarn constraints`, `yarn typecheck`, `yarn test`, `yarn lint`, `yarn format:check`, and `yarn build` pass.

## Out of scope

- Changing PostgreSQL's default table naming or storage mappings.
- Introducing adapter options that Core interprets.
