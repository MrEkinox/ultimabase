# 509: Compile PostgreSQL ACL constraints

- Status: planned
- Milestone: 5
- Packages: `@ultimabase/postgres`, `@ultimabase/acl-permissions`
- Depends on: 338, 411, 505, 506, 510
- ADR: ADR-0006, ADR-0007, ADR-0090

## Goal

Compile the ACL plugin's opaque constraint through the generic PostgreSQL
constraint registry and into the same SQL operation as the developer query.

## Acceptance criteria

- [ ] The ACL plugin registers one namespaced, versioned PostgreSQL compiler without exposing its payload to Runtime.
- [ ] ACL uses the per-schema tables from issue 510 and parameterized indexed `EXISTS` clauses.
- [ ] Resolved public, authenticated, user, and role subjects compile consistently.
- [ ] Find, count, update, delete, and bulk operations combine ACL filtering with every query predicate using logical `AND`.
- [ ] A missing compiler, unsupported payload version, or malformed ACL payload fails closed.
- [ ] The compiler contains no CLP or field-permission behavior.

## Tests

- [ ] ACL subject and operation matrices run against live PostgreSQL.

## Out of scope

- CLP guards, which do not compile into row predicates.
- Role graph resolution, which is owned by `@ultimabase/roles` and consumed before the adapter boundary.
- Field input, selection, and output restrictions.
