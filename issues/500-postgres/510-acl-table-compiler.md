# 510: Generate per-schema ACL tables

- Status: planned
- Milestone: 5
- Packages: `@ultimabase/postgres`, `@ultimabase/acl-permissions`
- Depends on: 410, 503
- ADR: ADR-0006, ADR-0007, ADR-0113

## Goal

Create normalized ACL tables with object foreign keys and efficient subject indexes.

## Acceptance criteria

- [ ] Object deletion cascades ACL rows.
- [ ] Public, authenticated, user, and role subjects serialize consistently.
- [ ] Subject rows do not depend on a native Core user mode or user schema.
- [ ] Role references store UUIDs.

## Tests

- [ ] Catalog, cascade, and query-plan fixtures.
