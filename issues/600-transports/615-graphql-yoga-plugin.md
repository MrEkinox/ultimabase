# 615: Implement graphqlYogaPlugin

- Status: planned
- Milestone: 6
- Packages: `@ultimabase/graphql-yoga-plugin`
- Depends on: 601, 604, 608, 614
- ADR: ADR-0010

## Goal

Mount the final GraphQL schema over HTTP through Yoga at `/graphql`.

## Acceptance criteria

- [ ] GraphQL Core is auto-installed when absent.
- [ ] RequestEngine and AsyncLocalStorage cover execution.
- [ ] Yoga’s built-in GraphiQL is disabled.
- [ ] Error masking is production-safe.

## Tests

- [ ] HTTP and networkless results are behaviorally equivalent.
