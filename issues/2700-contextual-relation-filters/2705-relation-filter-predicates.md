# 2705: Filter relation predicates and cardinality

- Status: completed
- Milestone: 27
- Packages: `@ultimabase/core`, database adapters
- Depends on: 2704
- ADR: [ADR-0247](../../docs/adr/0247-contextual-relation-filters.md)

## Goal

Make every relation predicate and aggregate observe the same filtered relation
universe as direct reads and eager inclusions.

## Acceptance criteria

- [x] `some`, `none`, `every`, `isEmpty`, and `isNotEmpty` evaluate only targets
      admitted by the relation field's resolved filter.
- [x] Unfiltered and filtered `count` first restrict the relation universe and
      then apply the caller's optional nested predicate and comparisons.
- [x] Recursive pointer and relation traversal resolves the exact declaration at
      each encountered relation field without leaking contextual filters into
      the public Query AST before execution.
- [x] Self-referential and cyclic expansions consume explicit existing budgets
      and fail deterministically before adapter work instead of recursing
      indefinitely.
- [x] Source field policy and every target policy or protected constraint retain
      their existing private scope and compose monotonically with the resolved
      filter.
- [x] PostgreSQL and future adapters continue receiving portable predicate and
      cardinality AST nodes; adapters never execute application callbacks.
- [x] Predicate and aggregate results remain consistent with `Relation.count`,
      `exists`, direct reads, and included collection lengths before pagination.

## Tests

- [x] Focused Core and adapter tests cover owning, inverse relation, inverse
      pointer, nested, filtered-count, empty, every, policy, Master, and cyclic
      cases.
- [x] Structural and performance tests protect bounded expansion and prevent
      duplicate predicate compilation.

## Completion evidence

- Runtime now prepares one private scope for every relation predicate even when
  no policy plugin is installed. Each collection scope combines the exact
  relation declaration with target policy while leaving the caller's immutable
  Query AST unchanged.
- Nested caller predicates retain source-field and target-filter policy checks;
  relation filters and policy-owned predicates expand as trusted private syntax.
  The request-local resolver is shared with direct reads and eager inclusions,
  so repeated quantifiers, counts, and projections invoke one contextual
  declaration once per exact field and root operation.
- Declaration expansion reuses the existing relationship-depth budget and
  rejects active self-referential or cyclic declaration chains before adapter
  execution. Pointer identity traversal receives target policy but never a
  neighboring relation declaration.
- Focused Core and PostgreSQL tests cover quantifiers, both emptiness forms,
  filtered count, nested relations and pointers, policy, Master, cycles, owning
  joins, inverse joins, and inverse pointers. PostgreSQL receives only portable
  predicate nodes plus immutable private row scopes.
- `yarn typecheck`, `yarn lint`, `yarn build`, `yarn constraints`,
  `yarn check:issues`, `yarn format:check`, and `git diff --check` passed. The
  focused Runtime and PostgreSQL suites passed 67 tests. The complete unit,
  type, browser, and performance suite passed all 2,354 tests in 503 files.

## Out of scope

- New relation operators, changing vacuous `every` semantics, or applying the
  filter to pointer identity comparisons.
