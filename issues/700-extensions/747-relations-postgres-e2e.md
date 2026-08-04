# 747: Verify and audit the complete relations vertical

- Status: done
- Milestone: 7+
- Packages: `@ultimabase/core`, `@ultimabase/postgres-plugin`
- Depends on: 743, 744, 745, 746
- ADR: ADR-0086, ADR-0087, ADR-0118

## Goal

Prove the complete transport-free pointer and relation system through public
developer APIs, then audit its DX, security, and adapter boundaries before any
transport consumes it.

## Acceptance criteria

- [x] One public-export E2E covers unique pointers, one-to-one, one-to-many, many-to-many, inverse mappings, and explicit relationship models.
- [x] Reads, selections, pointer inclusion, relation queries, cursors, counts, predicates, and every mutation work through `UltimaBase` plus `postgresPlugin` only.
- [x] Access, field restrictions, hooks, nested contextual queries, automatic and explicit transactions, master authority, and rollback remain active for every relationship path.
- [x] Missing and inaccessible sources or targets are observably identical and SQL does not materialize unbounded related collections.
- [x] Circular schemas, multiple applications, worker isolation, schema synchronization, referential cleanup, and deterministic naming are covered against live PostgreSQL.
- [x] Public hovers expose concise model, Pointer, Relation, Query, and mutation types with focused English JSDoc and no adapter internals.
- [x] Core imports no PostgreSQL or transport implementation, PostgreSQL imports only public Core contracts, and no deep imports enter packed declarations.
- [x] Core and PostgreSQL examples describe the implemented API and all relation issues are updated to their verified final status.

## Tests

- [x] Targeted checks plus the justified repository typecheck, test, lint, build, packed-package, and Docker-backed E2E suites pass.

The public-export PostgreSQL proof is split by responsibility across pointer,
relation, and explicit-edge files. They run as one worker-isolated E2E project,
share only public package imports, and avoid one monolithic fixture whose setup
would obscure topology-specific failures.

## Out of scope

- REST, GraphQL, transport batching, roles, authentication, and permission-provider-specific relation semantics.
