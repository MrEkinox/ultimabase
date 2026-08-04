# 510: Store ACL in indexed JSONB columns

- Status: planned
- Milestone: 5
- Packages: `@ultimabase/postgres-plugin`, `@ultimabase/acl-permissions-plugin`
- Depends on: 410, 424, 503
- ADR: ADR-0006, ADR-0007, ADR-0113, ADR-0116, ADR-0122

## Goal

Store one adapter-owned ACL JSONB value directly on every ACL-enabled object row
and index its subjects and rights without coupling the public `ACLJSON` contract
to PostgreSQL.

## Acceptance criteria

- [ ] Every ACL-enabled schema receives one reserved non-null JSONB column; schemas without `acl()` receive no ACL column or index.
- [ ] Object and ACL creation, replacement, and deletion remain one atomic row mutation without a generated ACL table or join.
- [ ] Public, authenticated, exact-principal, and role subjects serialize consistently, with any number of principal and role entries per object.
- [ ] Exact principals store schema class name plus object ID so equal IDs from different schemas cannot collide.
- [ ] Subject rows do not depend on a native Core user mode or user schema.
- [ ] Role references resolve names before persistence and store schema-qualified stable UUIDs.
- [ ] Read, update, and delete grants use one deterministic JSONB representation without storing master as a subject or persisted ACL-management right.
- [ ] A GIN index supports subject-and-right containment for public, authenticated, principal, and resolved-role predicates.
- [ ] Direct synchronization, introspection, and migration snapshots include the generated column and index only for schemas carrying the owned extension.
- [ ] The physical JSONB codec is versioned, validates strictly, and may differ from public `ACLJSON` without leaking into Core or transports.

## Tests

- [ ] Catalog, atomic-write, multiple-subject, same-ID-different-schema, role-resolution, drift, GIN-index, and no-join query-plan fixtures.
