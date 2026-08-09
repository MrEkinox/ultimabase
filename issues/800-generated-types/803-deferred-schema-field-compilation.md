# 803: Compile deferred schema field declarations

- Status: planned
- Milestone: 8
- Packages: `@ultimabase/core`
- Depends on: 802
- ADR: issue 802 ADR

## Goal

Implement the accepted application schema-compilation phase so plugin-owned
field methods are registered before Core resolves and freezes static schema
field callbacks.

## Acceptance criteria

- [ ] `Schema.define()` retains one immutable field declaration callback rather than requiring its final field map during module evaluation.
- [ ] Application compilation executes pure plugin declaration contributions before resolving any schema field callback.
- [ ] Each field callback executes exactly once per accepted compilation boundary and produces one immutable deterministic field map.
- [ ] Declaration registries are application-owned, record plugin ownership, and reject duplicate or incompatible method identities.
- [ ] Missing plugin field methods fail with a precise schema path before infrastructure connects.
- [ ] Reusing one schema class across isolated applications follows the model and metadata semantics selected by the ADR without first-application leakage.
- [ ] Indexes, extensions, Access, hooks, target resolution, validation plans, and schema hashes observe only the final frozen field map.
- [ ] Plugin declaration code cannot access adapters, requests, transactions, or infrastructure lifecycle state.

## Tests

- [ ] Runtime tests cover ordering, callback count, immutability, missing methods, conflicts, repeated compilation, and two applications.
- [ ] Type tests preserve the accepted unresolved and compiled schema boundaries without `any`.
