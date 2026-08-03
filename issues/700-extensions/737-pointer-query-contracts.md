# 737: Add pointer Query contracts and inclusion

- Status: done
- Milestone: 7+
- Packages: `@ultimabase/core`
- Depends on: 702
- ADR: ADR-0052, ADR-0055, ADR-0067, ADR-0118

## Goal

Extend the portable immutable Query contract with pointer-safe predicates,
target queries, and selection-aware single-target inclusion.

## Acceptance criteria

- [x] Pointer fields expose only compatible equality, membership, and existence predicates with exact target inference.
- [x] `pointer.query()` creates a normal Query for the exact target schema without performing I/O.
- [x] `include(pointerField, callback)` accepts only pointer keys and lets the callback select, filter, and shape one immutable target Query.
- [x] Included target typing reflects its exact selection while a non-included pointer remains `Pointer<TSchema>`.
- [x] Inclusion and pointer predicates normalize into immutable transport-neutral AST nodes with deterministic duplicate behavior.
- [x] Query JSON and diagnostics expose logical field paths and never physical foreign-key names.

## Tests

- [x] Colocated runtime, type, language-service, immutability, normalization, and packed-export tests cover valid and invalid pointer queries.

## Out of scope

- Query execution, to-many inclusion, DataLoader behavior, SQL, REST, and GraphQL.
