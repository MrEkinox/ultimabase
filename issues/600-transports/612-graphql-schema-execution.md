# 612: Execute generated GraphQL schema operations

- Status: planned
- Milestone: 6
- Packages: `@ultimabase/graphql-plugin`
- Depends on: 610, 611, 2319
- ADR: ADR-0004, ADR-0225, ADR-0231, ADR-0232 and ADR-0238

## Goal

Generate and execute the accepted schema reads and mutation commands through
Core's narrow application request capability and the canonical Runtime pipeline.

## Acceptance criteria

- [ ] Generated root field names, arguments, payloads, enablement, and collision
      rules exactly match the issue 608 contract.
- [ ] Reads call only `ApplicationRequestExecutor.executeRead()` with normalized
      read discriminants; mutations call only
      `ApplicationRequestExecutor.executeMutation()` with its closed schema
      command union.
- [ ] GraphQL never receives a `RequestEngine`, framework engine, application
      object, adapter, transaction, authority, grant, privilege, or lifecycle
      control.
- [ ] CRUD, count, exists, upsert, and homogeneous itemized bulk operations keep
      their canonical Core input, result, atomicity, hook, validation,
      transaction, and persistence semantics.
- [ ] The GraphQL selection tree controls Core selection and relationship
      inclusion without loading hidden extra application fields or creating a
      second result materializer.
- [ ] Installed Access, ACL, Hooks, Validation, Runtime middleware, protected
      constraints, and Master bypass behavior apply only through Runtime;
      GraphQL imports and names none of those products.
- [ ] Every generated public schema exposure uses Core's shared
      `UNVERIFIED_PUBLIC_TRANSPORT_PROTECTION` diagnostic and exact application
      acknowledgement rather than a GraphQL-specific protection claim.
- [ ] Safe Core failures follow the accepted GraphQL error contract, while
      unknown failures, stacks, SQL, policy internals, plugin options, and
      credentials never enter results or errors.
- [ ] Request cancellation and application disposal stop execution through the
      existing context signal and lifecycle boundary.

## Tests

- [ ] Generated-operation contract tests cover every read and mutation family,
      result selection, relations, policies, validation, hooks, transactions,
      anonymous and owning Master contexts, cancellation, and application
      isolation.
- [ ] Source, built, JavaScript, Typegen-free, generated TypeScript, and packed
      consumers execute through public exports.

## Out of scope

- Explicit plugin operations, custom schema resolvers, Yoga, and HTTP request
  handling.
