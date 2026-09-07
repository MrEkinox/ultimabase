# 614: Add custom schema composition and networkless execution

- Status: planned
- Milestone: 6
- Packages: `@ultimabase/graphql-plugin`
- Depends on: 612, 613
- ADR: ADR-0010, ADR-0190, ADR-0191, ADR-0225 and the issue 608 GraphQL v1 contract

## Goal

Compose accepted custom GraphQL contributions with the generated application
schema, expose a lifecycle-safe networkless executor, and batch repeated loads
within one request context.

## Acceptance criteria

- [ ] Completed schemas from Nexus, Pothos, GraphQL Tools, or another compatible
      builder enter through the exact contribution contract accepted by issue
      608 rather than a generic Core registry or mutable global schema.
- [ ] Multiple contributions compose in deterministic plugin and registration
      order with exact owner and instance provenance; conflicting root fields,
      object fields, directives, scalars, or schema definitions fail startup
      without last-writer-wins behavior.
- [ ] Generated and custom resolvers execute against one final immutable
      application-local schema and cannot mutate an exported schema class,
      another application's graph, or a completed schema after startup.
- [ ] Resolver context exposes only the accepted GraphQL request capabilities
      backed by Core's narrow executor. It never exposes `UltimaBase`, an
      application or engine object, raw authority, grants, adapters,
      transactions, privileges, or lifecycle mutation.
- [ ] The networkless executor accepts the exact document, variables,
      operation-name, and real application-bound `RequestContext` contract and
      rejects foreign, forged, stale, cancelled, or disposed execution.
- [ ] Generated and custom resolver failures share the accepted safe GraphQL
      error boundary and never leak callbacks, stacks, schema provenance,
      credentials, SQL, or internal diagnostics.
- [ ] Every DataLoader is request-, application-, schema-, selection-, and
      authority-context scoped as required by the accepted contract, batches
      deterministically, preserves result order, and delegates through Runtime.
- [ ] No loader, result, error, principal, or policy-visible state leaks across
      requests, applications, users, anonymous and Master contexts, or disposal.

## Tests

- [ ] Nexus-like, Pothos-like, GraphQL Tools, extension, conflict, ordering,
      resolver-context, safe-error, and lifecycle fixtures pass.
- [ ] Query-count and isolation tests prove batching without bypassing Access,
      ACL, selection, hooks, transactions, or application provenance.

## Out of scope

- HTTP, Yoga, explorer UIs, subscriptions, federation, or a general service
  lookup for custom resolvers.
