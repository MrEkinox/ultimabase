# 2701: Decide contextual relation filters

- Status: completed
- Milestone: 27
- Packages: architecture documentation
- Depends on: none
- ADR: [ADR-0247](../../docs/adr/0247-contextual-relation-filters.md)

## Goal

Accept the exact static and request-contextual relation `where` contract before
implementation changes any public field, Query, Runtime, policy, adapter, or
transport boundary.

## Acceptance criteria

- [x] ADR-0247 refines ADR-0118, ADR-0154, ADR-0156, ADR-0157, ADR-0158,
      ADR-0160, ADR-0207, ADR-0218, ADR-0227, and ADR-0238 without rewriting
      accepted history.
- [x] The ADR defines the target-typed static form and synchronous
      `{ context, where }` callback, immutable return contract, application
      attribution, cancellation, invalid-return handling, and no-Typegen
      execution.
- [x] Evaluation order fixes logical `AND` composition among the relation
      filter, caller predicate, target policy, protected constraints, and
      physical membership without adding adapter-specific behavior.
- [x] Direct relation reads, eager inclusion, GraphQL connections, REST
      projections, `some`, `none`, `every`, filtered and unfiltered `count`,
      `isEmpty`, and `isNotEmpty` receive one visible-membership definition.
- [x] Nested and cyclic relation filters have explicit bounded expansion,
      validation, and deterministic failure semantics.
- [x] Source relation-field policy, target policy, ACL, Master, caching, and
      application-isolation semantics are explicit and cannot be weakened.
- [x] `connect`, `disconnect`, `set`, `clear`, and nested writes are explicitly
      excluded from the read filter.
- [x] Source-item-dependent and asynchronous callbacks, public bypass flags,
      schema-root filters, and adapter-native callback syntax remain outside v1.

## Tests

- [x] `yarn check:issues`, focused documentation tests, `yarn format:check`, and
      `git diff --check` pass.

## Completion evidence

- ADR-0247 accepts one target-typed static input or synchronous
  `{ context, where }` callback whose normalized result remains a private
  relation-shaping scope rather than caller-authored Query syntax.
- The decision fixes one filtered visible universe for direct relation reads,
  eager projections, REST, GraphQL, predicates, emptiness, and cardinality while
  preserving physical membership semantics for every write.
- Caller filter Access remains independent from application-owned shaping;
  target policy, ACL, protected constraints, and membership can only narrow the
  final adapter request. Master retains shaping unless the declaration branches
  explicitly.
- Runtime callback attribution, synchronous failure, cancellation, per-operation
  reuse, bounded recursive expansion, cursor behavior, Typegen absence, and
  adapter neutrality are explicit.
- `yarn check:issues`, the focused active-contract documentation suite,
  `yarn format:check`, and `git diff --check` passed.

## Out of scope

- Implementing the accepted public or Runtime contract; issue 2702 starts that
  work.
