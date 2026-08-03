# 740: Verify the pointer vertical against PostgreSQL

- Status: planned
- Milestone: 7+
- Packages: `@ultimabase/core`, `@ultimabase/postgres`
- Depends on: 739
- ADR: ADR-0086, ADR-0087, ADR-0118

## Goal

Prove the complete pointer developer flow through public Core and PostgreSQL
exports before building to-many relations on top of it.

## Acceptance criteria

- [ ] A Core-only schema declaration creates, filters, selects, includes, updates, and deletes pointers through `UltimaBase` plus `postgresPlugin`.
- [ ] Circular targets, unique pointers, every referential action, and explicit transactions behave predictably against live PostgreSQL.
- [ ] Native Access, hooks, nested queries, model commands, and rollback remain active across pointer operations.
- [ ] Missing and denied included targets are indistinguishable to developer code.
- [ ] The E2E imports only public package exports and uses one isolated PostgreSQL schema per worker.
- [ ] No HTTP server, REST route, GraphQL schema, resolver, or transport package participates in the proof.

## Tests

- [ ] The Docker-backed root E2E covers happy paths, denial, invalid references, referential actions, rollback, and application isolation.
