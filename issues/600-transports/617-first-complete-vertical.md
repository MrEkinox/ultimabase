# 617: Verify the first complete vertical

- Status: planned
- Milestone: 6
- Packages: all first-release packages
- Depends on: 415, 508, 509, 515, 518, 602, 606, 607, 615
- ADR: all accepted ADRs

## Goal

Deliver the minimal example with full primitive CRUD, PostgreSQL, REST, GraphQL, permissions, and parallel tests.

## Acceptance criteria

- [ ] The example starts on port 1337.
- [ ] REST and GraphQL produce equivalent behavior.
- [ ] CRUD, bulk, upsert, cursor pagination, transactions, CLP, ACL, and field access work.
- [ ] Multiple test applications and workers remain isolated.
- [ ] User code imports only public package exports.

## Tests

- [ ] End-to-end REST and GraphQL suites.
- [ ] Packed-package consumer smoke test.
