# 510: Store ACL in indexed JSONB columns

- Status: done
- Milestone: 5
- Packages: `@ultimabase/core`, `@ultimabase/postgres-plugin`, `@ultimabase/acl-permissions-plugin`, `@ultimabase/roles-plugin`
- Depends on: 410, 424, 503
- ADR: ADR-0006, ADR-0007, ADR-0113, ADR-0116, ADR-0122, ADR-0124

## Goal

Store one adapter-owned ACL JSONB value directly on every ACL-enabled object row
and index its subjects and rights without coupling the public `ACLJSON` contract
to PostgreSQL.

## Acceptance criteria

- [x] Every ACL-enabled schema receives one reserved non-null JSONB column; schemas without `acl()` receive no ACL column or index.
- [x] Object and ACL creation, replacement, and deletion remain one atomic row mutation without a generated ACL table or join.
- [x] Public, authenticated, exact-principal, and role subjects serialize consistently, with any number of principal and role entries per object.
- [x] Exact principals store schema class name plus object ID so equal IDs from different schemas cannot collide.
- [x] Subject rows do not depend on a native Core user mode or user schema.
- [x] Role references resolve names before persistence and store schema-qualified stable UUIDs.
- [x] Read, update, and delete grants use one deterministic JSONB representation without storing master as a subject or persisted ACL-management right.
- [x] A GIN index supports subject-and-right containment for public, authenticated, principal, and resolved-role predicates.
- [x] Direct synchronization, introspection, and migration snapshots include the generated column and index only for schemas carrying the owned extension.
- [x] The physical JSONB codec is versioned, validates strictly, and may differ from public `ACLJSON` without leaking into Core or transports.

## Tests

- [x] Catalog, atomic-write, multiple-subject, same-ID-different-schema, role-resolution, drift, GIN-index, and no-join query-plan fixtures.
