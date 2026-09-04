# 615: Implement graphqlYogaPlugin

- Status: planned
- Milestone: 6
- Packages: `@ultimabase/graphql-yoga-plugin`
- Depends on: 2304, 608, 614
- ADR: ADR-0010, ADR-0225, ADR-0226

## Goal

Mount the final GraphQL schema over HTTP through Yoga at `/graphql`.

## Acceptance criteria

- [ ] GraphQL Core is auto-installed when absent.
- [ ] RequestEngine and AsyncLocalStorage cover execution.
- [ ] The package depends on `@ultimabase/http-plugin` and
      `@ultimabase/graphql-plugin` but never imports REST.
- [ ] Application ID, request context, optional session identity, and audited
      Master authority arrive through HTTP without GraphQL manufacturing them.
- [ ] Yoga consumes only Core's narrow application request executor through the
      HTTP boundary and never receives a framework engine or application object.
- [ ] Yoga’s built-in GraphiQL is disabled.
- [ ] Error masking is production-safe.

## Tests

- [ ] HTTP and networkless results are behaviorally equivalent.
