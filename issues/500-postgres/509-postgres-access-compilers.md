# 509: Compile CLP, ACL, roles, and field access

- Status: planned
- Milestone: 5
- Packages: `@ultimabase/postgres`, permission plugins
- Depends on: 408, 411, 414, 505, 506
- ADR: ADR-0006, ADR-0007

## Goal

Compile access constraints into the same SQL operation.

## Acceptance criteria

- [ ] ACL uses per-schema tables and indexed EXISTS clauses.
- [ ] Nested roles resolve correctly.
- [ ] Counts and bulk writes enforce object filtering.
- [ ] Forbidden fields are absent from select lists.

## Tests

- [ ] Full access matrix against live PostgreSQL.
