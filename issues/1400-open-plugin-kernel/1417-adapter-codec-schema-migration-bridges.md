# 1417: Add adapter, codec, physical schema, and migration bridges

- Status: completed
- Milestone: 14
- Packages: `@ultimabase/core`, `@ultimabase/postgres-plugin`, `@ultimabase/testing`
- Depends on: 1410, 1416
- ADR: ADR-0063, ADR-0124, ADR-0188, ADR-0191, ADR-0192, ADR-0193

## Goal

Let portable plugins require versioned adapter behavior and let separate bridge
packages contribute storage, constraint, physical schema, and migration support
without database-specific Core contracts.

## Acceptance criteria

- [x] Adapters advertise separate versioned capabilities for value storage codecs, opaque constraints, persistence-plan kinds, physical schema metadata, migration intent, and transaction-scoped raw access.
- [x] Application assembly rejects every missing or incompatible required adapter capability before infrastructure starts.
- [x] Portable logical plugins depend only on public neutral contracts; adapter-specific bridge packages own concrete database imports and physical compilation.
- [x] Logical, JSON, wire, storage, and Typegen representations remain distinct and validate round trips independently.
- [x] `adapter:consume` resolves portable public adapter capabilities; `adapter:raw` resolves an adapter-owned nominal facade only inside setup or an active transaction lease.
- [x] Raw adapter access cannot escape its lease, forge Master, bypass protected constraints accidentally, or present itself as portable behavior.
- [x] Physical schema and migration contributions preserve plugin ID, instance ID, package version, protocol version, stable contribution ID, and normalized static options.
- [x] Explicit upgrade and migration intent requires `migration:contribute`; adapter consumption or schema transformation never grants it implicitly.
- [x] Explicit plugin upgrade steps and orphaned plugin-removal metadata reach migration planning; missing required upgrades never fall back to automatic destructive synchronization.
- [x] PostgreSQL compiles the proof value, constraint, persistence rewrite, physical schema, and upgrade metadata through public capabilities without importing a logical community fixture.

## Tests

- [x] Runtime and PostgreSQL tests cover codec round trips, missing capabilities, protocol mismatch, raw lease escape, protected constraints, schema metadata, upgrades, orphaned removal, rollback, and isolation.
- [x] Dependency, source, packed, Typegen, migration snapshot, and conformance tests prove bridge separation and exact provenance.

## Out of scope

- A generic raw SQL API in Core.
- Publishing production community bridge packages from milestone fixtures.

## Validation

- `yarn typecheck`
- `yarn test` — 337 files and 1,997 tests passed.
- `yarn test:coverage` — 88.01% statements, 80.25% branches, 92.45% functions, and 88.19% lines.
- `yarn lint` — passed with only the repository's tracked size warnings.
- `yarn constraints`
- `yarn format:check`
- `yarn build` — package builds, `attw`, and `publint` passed.
- `yarn test:pack:built` — 10 files and 53 tests passed.
- `yarn test:e2e:built` — 33 files and 133 tests passed through Docker/Testcontainers outside the filesystem sandbox.
