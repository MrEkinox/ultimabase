# 747: Verify and audit the complete relations vertical

- Status: planned
- Milestone: 7+
- Packages: `@ultimabase/core`, `@ultimabase/postgres`
- Depends on: 743, 744, 745, 746
- ADR: ADR-0086, ADR-0087, ADR-0118

## Goal

Prove the complete transport-free pointer and relation system through public
developer APIs, then audit its DX, security, and adapter boundaries before any
transport consumes it.

## Acceptance criteria

- [ ] One public-export E2E covers unique pointers, one-to-one, one-to-many, many-to-many, inverse mappings, and explicit relationship models.
- [ ] Reads, selections, pointer inclusion, relation queries, cursors, counts, predicates, and every mutation work through `UltimaBase` plus `postgresPlugin` only.
- [ ] Access, field restrictions, hooks, nested contextual queries, automatic and explicit transactions, master authority, and rollback remain active for every relationship path.
- [ ] Missing and inaccessible sources or targets are observably identical and SQL does not materialize unbounded related collections.
- [ ] Circular schemas, multiple applications, worker isolation, schema synchronization, referential cleanup, and deterministic naming are covered against live PostgreSQL.
- [ ] Public hovers expose concise model, Pointer, Relation, Query, and mutation types with focused English JSDoc and no adapter internals.
- [ ] Core imports no PostgreSQL or transport implementation, PostgreSQL imports only public Core contracts, and no deep imports enter packed declarations.
- [ ] Core and PostgreSQL examples describe the implemented API and all relation issues are updated to their verified final status.

## Tests

- [ ] Targeted checks plus the justified repository typecheck, test, lint, build, packed-package, and Docker-backed E2E suites pass.

## Out of scope

- REST, GraphQL, transport batching, roles, authentication, and permission-provider-specific relation semantics.
