# 612: Generate GraphQL CRUD and bulk operations

- Status: planned
- Milestone: 6
- Packages: `@ultimabase/graphql`
- Depends on: 315, 316, 609, 610, 611
- ADR: ADR-0004, ADR-0010

## Goal

Generate class-typed queries and mutations that only call RequestEngine.

## Acceptance criteria

- [ ] Naming is `user`, `users`, `createUser`, and equivalent typed operations.
- [ ] Bulk and upsert contracts match Runtime.
- [ ] Selection AST controls database selection.
- [ ] ACL and field rules affect generated inputs and output.

## Tests

- [ ] Generated-operation contract suite.
