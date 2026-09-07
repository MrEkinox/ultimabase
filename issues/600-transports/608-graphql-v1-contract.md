# 608: Decide the GraphQL v1 contract and kernel boundaries

- Status: ready
- Milestone: 6
- Packages: architecture documentation
- Depends on: 2316
- ADR: ADR-0010, ADR-0186, ADR-0190, ADR-0191, ADR-0193, ADR-0209, ADR-0224, ADR-0225, ADR-0226, ADR-0227, ADR-0229, ADR-0230, ADR-0231, ADR-0232, ADR-0233 and a new GraphQL v1 ADR

## Goal

Replace the underspecified pre-kernel GraphQL plan with one explicit v1
contract aligned with the delivered capability, HTTP, request-execution,
wire-codec, operation-exposure, and authority boundaries.

## Acceptance criteria

- [ ] A new accepted ADR states which parts of ADR-0010 remain valid and
      explicitly refines every assumption that no longer matches the current
      plugin kernel.
- [ ] The package graph keeps GraphQL Core network-independent, makes Yoga
      depend on GraphQL and HTTP, and prohibits every GraphQL package from
      importing REST, authentication, Access, ACL, PostgreSQL, or a framework
      engine.
- [ ] The ADR fixes plugin identities, capability lifetimes, instance behavior,
      privilege requirements, setup order, teardown, and whether Yoga uses
      explicit sibling configuration or deterministic nested-plugin sugar.
- [ ] Generated schema exposure has one immutable global and per-schema
      configuration contract, provenance-aware defaults, deterministic names,
      collision rules, and a clear distinction from authorization.
- [ ] Root reads, mutations, Relay connections, selection and inclusion,
      filters, ordering, limits, bulk operations, upserts, and disabled
      operations receive exact GraphQL names and input/result shapes.
- [ ] The ADR defines how GraphQL field nullability and execution errors remain
      sound when Runtime applies dynamic monotonic field and output restrictions,
      without inspecting a concrete policy engine.
- [ ] Every built-in field representation is fixed, and plugin-defined fields
      require an exact canonical GraphQL protocol identity plus owner-provided
      input and output codecs rather than a storage or REST fallback.
- [ ] Relay cursor contents, ordering, integrity, invalidation, forward-page
      behavior, and translation into ordinary Core Query clauses are explicit;
      no Core cursor API or AST node is reintroduced.
- [ ] Explicit plugin operations use Core's canonical transport binding,
      `transport:expose`, an application allowlist, complete safe error
      behavior, and an exact GraphQL wire contract. Password Auth login,
      sign-up, logout, and refresh are covered as the first concrete proof.
- [ ] Custom schema contribution, merge conflict, resolver context,
      application isolation, networkless execution, request-scoped batching,
      introspection, and schema-printing behavior have one owner and lifecycle.
- [ ] Yoga's path, accepted HTTP methods and media types, request limits,
      request cancellation, application-ID selection, resolved session context,
      audited Master inheritance, route-dispatch error ownership, production
      masking, and explorer separation are explicit.
- [ ] Public examples demonstrate anonymous, session-authenticated, and audited
      Master execution without passing credentials or authority through GraphQL
      arguments, variables, extensions, or resolver-created context shapes.
- [ ] Subscriptions, live queries, federation, uploads, persisted queries,
      `@defer`, `@stream`, client generation, and policy-specific schema
      rewriting are explicitly accepted or rejected for v1 rather than left
      ambiguous.

## Tests

- [ ] `yarn check:issues`, `yarn format:check`, and focused active-documentation
      tests pass.

## Out of scope

- Creating a GraphQL package or changing Runtime, HTTP, REST, Password Auth, or
  another production implementation before the ADR is approved.
