# 614: Add custom schema composition and networkless execution

- Status: completed
- Milestone: 6
- Packages: `@ultimabase/graphql-plugin`
- Depends on: 612, 613
- ADR: ADR-0010, ADR-0190, ADR-0191, ADR-0225 and ADR-0238

## Goal

Compose accepted custom GraphQL contributions with the generated application
schema and expose a lifecycle-safe networkless executor while reusing Core's
existing relationship inclusion boundary.

## Acceptance criteria

- [x] Completed schemas from Nexus, Pothos, GraphQL Tools, or another compatible
      builder enter through the exact contribution contract accepted by issue
      608 rather than a generic Core registry or mutable global schema.
- [x] Multiple contributions compose in deterministic plugin and registration
      order with exact owner and instance provenance; conflicting root fields,
      object fields, directives, scalars, or schema definitions fail startup
      without last-writer-wins behavior.
- [x] Generated and custom resolvers execute against one final immutable
      application-local schema and cannot mutate an exported schema class,
      another application's graph, or a completed schema after startup.
- [x] Application resolvers and plugin-contributed resolvers retain exact
      application or plugin-instance callback attribution and cannot borrow the
      GraphQL host's privileges.
- [x] Resolver context exposes only the accepted GraphQL request capabilities
      backed by Core's narrow executor. It never exposes `UltimaBase`, an
      application or engine object, raw authority, grants, adapters,
      transactions, privileges, or lifecycle mutation.
- [x] The networkless executor accepts the exact document, variables,
      operation-name, and real application-bound `RequestContext` contract and
      rejects foreign, forged, stale, cancelled, or disposed execution.
- [x] Generated and custom resolver failures share the accepted safe GraphQL
      error boundary and never leak callbacks, stacks, schema provenance,
      credentials, SQL, or internal diagnostics.
- [x] Generated pointer and relation resolution uses Core's existing eager
      inclusion contract and introduces no framework DataLoader, per-parent
      query loop, second result materializer, or policy bypass.
- [x] A custom resolver may own request-local batching through ordinary
      application APIs, but no result, error, principal, cache, or policy-visible
      state leaks across requests, applications, users, anonymous and Master
      contexts, or disposal.

## Tests

- [x] Nexus-like, Pothos-like, GraphQL Tools, extension, conflict, ordering,
      resolver-context, safe-error, and lifecycle fixtures pass.
- [x] Query-count and isolation tests prove generated relationship inclusion
      avoids per-parent loading without bypassing Access, ACL, selection, hooks,
      transactions, or application provenance.

## Out of scope

- HTTP, Yoga, explorer UIs, subscriptions, federation, or a general service
  lookup for custom resolvers.
