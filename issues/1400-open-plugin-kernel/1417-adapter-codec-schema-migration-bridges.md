# 1417: Add adapter, codec, physical schema, and migration bridges

- Status: planned
- Milestone: 14
- Packages: `@ultimabase/core`, `@ultimabase/postgres-plugin`, `@ultimabase/testing`
- Depends on: 1410, 1416
- ADR: ADR-0063, ADR-0124, ADR-0188, ADR-0191, ADR-0192, ADR-0193

## Goal

Let portable plugins require versioned adapter behavior and let separate bridge
packages contribute storage, constraint, physical schema, and migration support
without database-specific Core contracts.

## Acceptance criteria

- [ ] Adapters advertise separate versioned capabilities for value storage codecs, opaque constraints, persistence-plan kinds, physical schema metadata, migration intent, and transaction-scoped raw access.
- [ ] Application assembly rejects every missing or incompatible required adapter capability before infrastructure starts.
- [ ] Portable logical plugins depend only on public neutral contracts; adapter-specific bridge packages own concrete database imports and physical compilation.
- [ ] Logical, JSON, wire, storage, and Typegen representations remain distinct and validate round trips independently.
- [ ] `adapter:consume` resolves portable public adapter capabilities; `adapter:raw` resolves an adapter-owned nominal facade only inside setup or an active transaction lease.
- [ ] Raw adapter access cannot escape its lease, forge Master, bypass protected constraints accidentally, or present itself as portable behavior.
- [ ] Physical schema and migration contributions preserve plugin ID, instance ID, package version, protocol version, stable contribution ID, and normalized static options.
- [ ] Explicit upgrade and migration intent requires `migration:contribute`; adapter consumption or schema transformation never grants it implicitly.
- [ ] Explicit plugin upgrade steps and orphaned plugin-removal metadata reach migration planning; missing required upgrades never fall back to automatic destructive synchronization.
- [ ] PostgreSQL compiles the proof value, constraint, persistence rewrite, physical schema, and upgrade metadata through public capabilities without importing a logical community fixture.

## Tests

- [ ] Runtime and PostgreSQL tests cover codec round trips, missing capabilities, protocol mismatch, raw lease escape, protected constraints, schema metadata, upgrades, orphaned removal, rollback, and isolation.
- [ ] Dependency, source, packed, Typegen, migration snapshot, and conformance tests prove bridge separation and exact provenance.

## Out of scope

- A generic raw SQL API in Core.
- Publishing production community bridge packages from milestone fixtures.
