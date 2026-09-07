# 615: Implement graphqlYogaPlugin

- Status: planned
- Milestone: 6
- Packages: `@ultimabase/graphql-yoga-plugin`
- Depends on: 614, 2317
- ADR: ADR-0010, ADR-0224, ADR-0225, ADR-0226 and the issue 608 GraphQL v1 contract

## Goal

Mount the final GraphQL schema through Yoga and the shared HTTP application
capability without giving Yoga or GraphQL an application engine.

## Acceptance criteria

- [ ] A complete publishable `packages/graphql-yoga-plugin` workspace exports
      the accepted `graphqlYogaPlugin()` API; installation or nested-plugin
      composition follows issue 608 without hidden duplicates or ambiguous
      instance selection.
- [ ] Yoga contributes the accepted `/graphql` mount through
      `@ultimabase/http-plugin` with deterministic route collision, rollback,
      restart, stop, and disposal behavior.
- [ ] The package depends on `@ultimabase/http-plugin` and
      `@ultimabase/graphql-plugin` but never imports REST.
- [ ] HTTP selects one exact application, creates the request ID and cancellation
      signal, resolves optional session identity, and exchanges an explicitly
      enabled Master credential before Yoga's selected handler begins.
- [ ] GraphQL receives only that real application-bound context and consumes
      Core's narrow request executor through the HTTP endpoint boundary; it
      never manufactures authority or receives a framework engine, application,
      adapter, transaction, grant, or lifecycle facade.
- [ ] Accepted HTTP methods, GraphQL media types, content negotiation, streamed
      body limits, variables, operation names, batching policy, introspection,
      cache headers, and request cancellation match the issue 608 contract.
- [ ] Application-selection, sensitive-header, context, credential, and Master
      failures use HTTP's protocol-neutral pre-dispatch boundary. Parse,
      validation, execution, and resolver failures after dispatch use GraphQL's
      safe error contract.
- [ ] Yoga’s built-in GraphiQL is disabled.
- [ ] Error masking is production-safe.
- [ ] Multiple applications may share one Hono provider while retaining exact
      application IDs, browser policy, routes, schemas, contexts, loaders,
      credentials, authorities, and cleanup.

## Tests

- [ ] Networkless and real Yoga HTTP results are behaviorally equivalent for
      anonymous, session-authenticated, and audited Master execution.
- [ ] Source, built, packed, browser Fetch, existing-Hono, managed-Hono,
      multi-application, deadline, abort, restart, and teardown suites pass.

## Out of scope

- Implementing an HTTP server, REST behavior, authentication, explorer UI,
  subscriptions, rate limiting, TLS, compression, or proxy trust.
