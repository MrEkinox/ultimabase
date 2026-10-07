# 612: Execute generated GraphQL schema operations

- Status: completed
- Milestone: 6
- Packages: `@ultimabase/graphql-plugin`
- Depends on: 610, 611, 2319
- ADR: ADR-0004, ADR-0225, ADR-0231, ADR-0232, ADR-0238 and ADR-0239

## Goal

Generate and execute the accepted schema reads and mutation commands through
Core's narrow application request capability and the canonical Runtime pipeline.

## Acceptance criteria

- [x] Generated root field names, arguments, payloads, enablement, and collision
      rules exactly match the issue 608 contract.
- [x] Reads call only `ApplicationRequestExecutor.executeRead()` with normalized
      read discriminants; mutations call only
      `ApplicationRequestExecutor.executeMutation()` with its closed schema
      command union.
- [x] GraphQL never receives a `RequestEngine`, framework engine, application
      object, adapter, transaction, authority, grant, privilege, or lifecycle
      control.
- [x] CRUD, count, exists, upsert, and homogeneous itemized bulk operations keep
      their canonical Core input, result, atomicity, hook, validation,
      transaction, and persistence semantics.
- [x] The GraphQL selection tree controls Core selection and relationship
      inclusion without loading hidden extra application fields or creating a
      second result materializer. Per ADR-0239, delete and upsert retain Core's
      flat result projection and reject relationship hydration before Runtime.
- [x] Installed Access, ACL, Hooks, Validation, Runtime middleware, protected
      constraints, and Master bypass behavior apply only through Runtime;
      GraphQL imports and names none of those products.
- [x] Every generated public schema exposure uses Core's shared
      `UNVERIFIED_PUBLIC_TRANSPORT_PROTECTION` diagnostic and exact application
      acknowledgement rather than a GraphQL-specific protection claim.
- [x] Safe Core failures follow the accepted GraphQL error contract, while
      unknown failures, stacks, SQL, policy internals, plugin options, and
      credentials never enter results or errors.
- [x] Request cancellation and application disposal stop execution through the
      existing context signal and lifecycle boundary.

## Tests

- [x] Generated-operation contract tests cover every read and mutation family,
      result selection, relations, policies, validation, hooks, transactions,
      anonymous and owning Master contexts, cancellation, and application
      isolation.
- [x] Source, built, JavaScript, Typegen-free, generated TypeScript, and packed
      consumers execute through public exports.

## Out of scope

- Explicit plugin operations, custom schema resolvers, Yoga, and HTTP request
  handling.
