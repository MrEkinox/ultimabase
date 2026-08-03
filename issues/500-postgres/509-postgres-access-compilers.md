# 509: Compile PostgreSQL ACL constraints

- Status: planned
- Milestone: 5
- Packages: `@ultimabase/postgres`, `@ultimabase/acl-permissions`
- Depends on: 338, 411, 505, 506, 510
- ADR: ADR-0006, ADR-0007, ADR-0090, ADR-0113, ADR-0116

## Goal

Compile the ACL provider's opaque Access filter through the generic PostgreSQL
constraint registry and into the same SQL operation as the developer query.

## Acceptance criteria

- [ ] The ACL plugin registers one namespaced, versioned PostgreSQL compiler without exposing its payload to Runtime.
- [ ] ACL uses the per-schema tables from issue 510 and parameterized indexed `EXISTS` clauses.
- [ ] Resolved public, authenticated, user, and role subjects compile consistently.
- [ ] PostgreSQL receives already-resolved subject identifiers and never reads Core authority as an authenticated user identity.
- [ ] Find, count, update, delete, and bulk operations combine ACL filtering with every query predicate using logical `AND`.
- [ ] ACL filters compose with native Access filters and other provider constraints without `beforeFind` being able to inspect or remove them.
- [ ] A missing compiler, unsupported payload version, or malformed ACL payload fails closed.
- [ ] The compiler contains no CLP or field-permission behavior.

## Tests

- [ ] ACL subject and operation matrices run against live PostgreSQL.

## Out of scope

- CLP guards, which do not compile into row predicates.
- Role graph resolution, which is owned by `@ultimabase/roles` and consumed before the adapter boundary.
- Field input, selection, and output restrictions.
