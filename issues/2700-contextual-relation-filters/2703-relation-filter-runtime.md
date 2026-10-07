# 2703: Resolve filters for relation reads

- Status: completed
- Milestone: 27
- Packages: `@ultimabase/core`, `@ultimabase/testing`
- Depends on: 2702
- ADR: [ADR-0247](../../docs/adr/0247-contextual-relation-filters.md)

## Goal

Resolve and compose the declared relation filter for every direct read through
a persisted model's relation handle.

## Acceptance criteria

- [x] `Relation.findMany`, `findOne`, `get`, `count`, and `exists` resolve the
      source field's filter under the exact active request context.
- [x] Static and contextual filters normalize through the ordinary target Query
      contract and combine with caller `where` through logical `AND` without
      mutating either declaration or Query.
- [x] Resolution runs through application-bound callback attribution,
      cancellation, safe error handling, and deterministic operation-local
      reuse before database work.
- [x] Source relation-field policy, target operation/filter/item/field policy,
      protected constraints, and physical relation scope retain their existing
      monotonic order.
- [x] Anonymous, authenticated plugin contexts, and Master all retain shaping;
      the resolver may explicitly return a different filter for each context.
- [x] Invalid or asynchronous returns, foreign builders, disposed applications,
      stale contexts, and cross-application execution fail deterministically.
- [x] Relation membership commands and nested writes remain byte-for-byte
      equivalent in logical behavior and do not evaluate the read filter.
- [x] The Testing package's relation conformance surface covers the portable
      behavior without selecting PostgreSQL or a policy plugin.

## Tests

- [x] Focused Core tests cover all terminals, caller composition, no caller
      predicate, errors, cancellation, policy ordering, Master, and isolation.
- [x] Regression tests prove `connect`, `disconnect`, `set`, and `clear` neither
      invoke nor inherit the filter.

## Completion evidence

- Runtime now resolves the source relation declaration only for direct read
  terminals, after source traversal and caller-operation enforcement, and
  combines its normalized expression with protected row restrictions in the
  private adapter envelope. Caller Query ASTs and physical relation scopes stay
  independent and immutable.
- One operation-local resolver cache attributes application and plugin-owned
  callbacks through the shared Runtime executor, checks cancellation before and
  after invocation, rejects thenables and malformed outputs behind a safe error
  boundary, and retains shaping for anonymous, plugin-enriched, and Master
  contexts.
- Core tests cover static and contextual filters, every direct terminal,
  caller composition, policy order, Master branching, callback reuse,
  cancellation, lifecycle and application isolation, exact plugin instances,
  membership commands, and nested-write exclusion. The Testing package adds a
  public `relation-read` conformance contract with a product-neutral adapter
  fixture.
- `yarn typecheck`, `yarn test`, `yarn lint` with a 6144 MiB heap, and
  `yarn build` passed. The complete suite passed 2,345 tests in 500 files; lint
  reported only 61 existing line-budget warnings. `yarn constraints`,
  `yarn check:issues`, `yarn format:check`, and `git diff --check` also passed.

## Out of scope

- Eager inclusions, source-query relationship predicates, or transport-specific
  behavior.
