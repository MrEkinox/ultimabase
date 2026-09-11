# 2703: Resolve filters for relation reads

- Status: planned
- Milestone: 27
- Packages: `@ultimabase/core`, `@ultimabase/testing`
- Depends on: 2702
- ADR: [ADR-0247](../../docs/adr/0247-contextual-relation-filters.md)

## Goal

Resolve and compose the declared relation filter for every direct read through
a persisted model's relation handle.

## Acceptance criteria

- [ ] `Relation.findMany`, `findOne`, `get`, `count`, and `exists` resolve the
      source field's filter under the exact active request context.
- [ ] Static and contextual filters normalize through the ordinary target Query
      contract and combine with caller `where` through logical `AND` without
      mutating either declaration or Query.
- [ ] Resolution runs through application-bound callback attribution,
      cancellation, safe error handling, and deterministic operation-local
      reuse before database work.
- [ ] Source relation-field policy, target operation/filter/item/field policy,
      protected constraints, and physical relation scope retain their existing
      monotonic order.
- [ ] Anonymous, authenticated plugin contexts, and Master all retain shaping;
      the resolver may explicitly return a different filter for each context.
- [ ] Invalid or asynchronous returns, foreign builders, disposed applications,
      stale contexts, and cross-application execution fail deterministically.
- [ ] Relation membership commands and nested writes remain byte-for-byte
      equivalent in logical behavior and do not evaluate the read filter.
- [ ] The Testing package's relation conformance surface covers the portable
      behavior without selecting PostgreSQL or a policy plugin.

## Tests

- [ ] Focused Core tests cover all terminals, caller composition, no caller
      predicate, errors, cancellation, policy ordering, Master, and isolation.
- [ ] Regression tests prove `connect`, `disconnect`, `set`, and `clear` neither
      invoke nor inherit the filter.

## Out of scope

- Eager inclusions, source-query relationship predicates, or transport-specific
  behavior.
