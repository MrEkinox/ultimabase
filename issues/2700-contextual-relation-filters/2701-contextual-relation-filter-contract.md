# 2701: Decide contextual relation filters

- Status: ready
- Milestone: 27
- Packages: architecture documentation
- Depends on: none
- ADR: proposed ADR-0247

## Goal

Accept the exact static and request-contextual relation `where` contract before
implementation changes any public field, Query, Runtime, policy, adapter, or
transport boundary.

## Acceptance criteria

- [ ] ADR-0247 refines ADR-0118, ADR-0154, ADR-0156, ADR-0157, ADR-0158,
      ADR-0160, ADR-0207, ADR-0218, ADR-0227, and ADR-0238 without rewriting
      accepted history.
- [ ] The ADR defines the target-typed static form and synchronous
      `{ context, where }` callback, immutable return contract, application
      attribution, cancellation, invalid-return handling, and no-Typegen
      execution.
- [ ] Evaluation order fixes logical `AND` composition among the relation
      filter, caller predicate, target policy, protected constraints, and
      physical membership without adding adapter-specific behavior.
- [ ] Direct relation reads, eager inclusion, GraphQL connections, REST
      projections, `some`, `none`, `every`, filtered and unfiltered `count`,
      `isEmpty`, and `isNotEmpty` receive one visible-membership definition.
- [ ] Nested and cyclic relation filters have explicit bounded expansion,
      validation, and deterministic failure semantics.
- [ ] Source relation-field policy, target policy, ACL, Master, caching, and
      application-isolation semantics are explicit and cannot be weakened.
- [ ] `connect`, `disconnect`, `set`, `clear`, and nested writes are explicitly
      excluded from the read filter.
- [ ] Source-item-dependent and asynchronous callbacks, public bypass flags,
      schema-root filters, and adapter-native callback syntax remain outside v1.

## Tests

- [ ] `yarn check:issues`, focused documentation tests, `yarn format:check`, and
      `git diff --check` pass.

## Out of scope

- Changing implementation before ADR-0247 is accepted.
