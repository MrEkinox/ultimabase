# 2509: Expose virtual fields through GraphQL

- Status: planned
- Milestone: 25
- Packages: `@ultimabase/graphql-plugin`, `@ultimabase/graphql-yoga-plugin`
- Depends on: 2507
- ADR: [ADR-0244](../../docs/adr/0244-contextual-fields-and-virtual-results.md)

## Goal

Compile Core virtual fields into GraphQL output selections while preserving one
network-independent Core resolver and application request path.

## Acceptance criteria

- [ ] GraphQL model output types derive virtual scalar, enum, temporal, decimal,
      binary, JSON, nullable, list, and object shapes from `OutputBuilder`
      descriptors.
- [ ] GraphQL field selections normalize to the ordinary Core logical selection;
      Core alone expands dependencies and executes the resolver.
- [ ] Create, update, upsert, nested-write, where, order, connection input, and
      relationship input types omit virtual fields.
- [ ] Repeated named object output shapes compose deterministically with custom
      schema types and reject incompatible definitions.
- [ ] Networkless execution and Yoga preserve request context, authentication,
      Master provenance, cancellation, async errors, safe error ownership, and
      application isolation.
- [ ] GraphQL and Yoga contain no alternate resolver business logic, adapter
      access, transaction behavior, or private dependency exposure.

## Tests

- [ ] Schema introspection and networkless execution cover every output shape,
      exact presence/absence, context-dependent results, async failure, Access,
      connections, mutations, and nested projections.
- [ ] Yoga Fetch and packed-package tests prove parity with direct Core and REST.

## Out of scope

- GraphQL arguments on virtual fields, subscription behavior, transport-local
  DataLoader APIs, federation, virtual filters, or ordering.
