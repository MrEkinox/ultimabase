# 2705: Filter relation predicates and cardinality

- Status: ready
- Milestone: 27
- Packages: `@ultimabase/core`, database adapters
- Depends on: 2704
- ADR: [ADR-0247](../../docs/adr/0247-contextual-relation-filters.md)

## Goal

Make every relation predicate and aggregate observe the same filtered relation
universe as direct reads and eager inclusions.

## Acceptance criteria

- [ ] `some`, `none`, `every`, `isEmpty`, and `isNotEmpty` evaluate only targets
      admitted by the relation field's resolved filter.
- [ ] Unfiltered and filtered `count` first restrict the relation universe and
      then apply the caller's optional nested predicate and comparisons.
- [ ] Recursive pointer and relation traversal resolves the exact declaration at
      each encountered relation field without leaking contextual filters into
      the public Query AST before execution.
- [ ] Self-referential and cyclic expansions consume explicit existing budgets
      and fail deterministically before adapter work instead of recursing
      indefinitely.
- [ ] Source field policy and every target policy or protected constraint retain
      their existing private scope and compose monotonically with the resolved
      filter.
- [ ] PostgreSQL and future adapters continue receiving portable predicate and
      cardinality AST nodes; adapters never execute application callbacks.
- [ ] Predicate and aggregate results remain consistent with `Relation.count`,
      `exists`, direct reads, and included collection lengths before pagination.

## Tests

- [ ] Focused Core and adapter tests cover owning, inverse relation, inverse
      pointer, nested, filtered-count, empty, every, policy, Master, and cyclic
      cases.
- [ ] Structural and performance tests protect bounded expansion and prevent
      duplicate predicate compilation.

## Out of scope

- New relation operators, changing vacuous `every` semantics, or applying the
  filter to pointer identity comparisons.
