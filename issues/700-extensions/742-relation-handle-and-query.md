# 742: Add immutable Relation handles and scoped queries

- Status: planned
- Milestone: 7+
- Packages: `@ultimabase/core`
- Depends on: 737, 741
- ADR: ADR-0058, ADR-0108, ADR-0115, ADR-0118

## Goal

Expose related collections from persisted models through a small typed handle
that reuses ordinary target Query behavior without loading an array.

## Acceptance criteria

- [ ] A persisted model exposes `relation(fieldName)` with autocomplete limited to its relation fields and exact source and target inference.
- [ ] Draft models and projections without protected source identity cannot execute relation operations.
- [ ] `Relation<TSource, TTarget>` is immutable and its `query()` returns a normal target Query supporting selection, filters, ordering, cursors, count, and exists.
- [ ] The relationship scope is immutable private Runtime state and cannot be serialized, inspected, replaced, or removed by developer Query methods or business hooks.
- [ ] Queries inherit contextual execution and retain the same terminal-only application, context, and master options as ordinary Query.
- [ ] To-many values remain absent from ordinary model properties and `toJSON()` unless a future explicit bounded aggregate contract is introduced.

## Tests

- [ ] Colocated runtime, type, language-service, immutability, protected-identity, and packed-export tests cover owning and inverse handles.

## Out of scope

- Relation mutations, relation predicates, database execution, REST, and GraphQL.
