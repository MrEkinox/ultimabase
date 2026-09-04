# 617: Verify GraphQL cross-transport parity

- Status: planned
- Milestone: 6
- Packages: all first-release packages
- Depends on: 415, 508, 509, 515, 518, 615, 2315
- ADR: all accepted ADRs

## Goal

Extend the completed authenticated REST product vertical with independent
GraphQL execution and prove cross-transport parity.

## Acceptance criteria

- [ ] The example starts on port 1337.
- [ ] REST and GraphQL produce equivalent behavior.
- [ ] CRUD, bulk, upsert, cursor pagination, transactions, native schema and field Access, roles, and ACL work.
- [ ] GraphQL depends on the shared HTTP contract and never imports REST.
- [ ] Password Auth identity and audited Master contexts behave identically
      through REST and GraphQL without either transport importing the plugin.
- [ ] Multiple test applications and workers remain isolated.
- [ ] User code imports only public package exports.

## Tests

- [ ] End-to-end REST and GraphQL suites.
- [ ] Packed-package consumer smoke test.
