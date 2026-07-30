# 614: Add networkless executor and DataLoader

- Status: planned
- Milestone: 6
- Packages: `@ultimabase/graphql`
- Depends on: 612, 613
- ADR: ADR-0010

## Goal

Execute the final schema in tests and batch repeated object loads per request.

## Acceptance criteria

- [ ] Executor accepts document, variables, and request context.
- [ ] DataLoader is request-scoped.
- [ ] Generated and custom resolvers use the same final schema.
- [ ] No cache leaks between requests.

## Tests

- [ ] Query-count and isolation tests.
