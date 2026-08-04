# 509: Compile PostgreSQL ACL constraints

- Status: planned
- Milestone: 5
- Packages: `@ultimabase/postgres-plugin`, `@ultimabase/acl-permissions-plugin`
- Depends on: 338, 411, 505, 506, 510
- ADR: ADR-0006, ADR-0007, ADR-0090, ADR-0113, ADR-0116, ADR-0122

## Goal

Compile the ACL provider's opaque Access filter into indexed JSONB containment
predicates through the generic PostgreSQL constraint registry and into the same
SQL operation as the developer query.

## Acceptance criteria

- [ ] The ACL plugin registers one namespaced, versioned PostgreSQL compiler without exposing its payload to Runtime.
- [ ] ACL uses the row-local JSONB column from issue 510 and parameterized GIN-indexable containment or JSONPath predicates without an ACL-table join.
- [ ] Resolved public, authenticated, exact-principal, and role subjects compile consistently, including multiple matching principals and roles.
- [ ] PostgreSQL receives already-resolved subject identifiers and never reads Core authority as an authenticated user identity.
- [ ] Find, count, update, delete, and bulk operations combine ACL filtering with every query predicate using logical `AND`.
- [ ] ACL filters compose with native Access filters and other provider constraints without `beforeFind` being able to inspect or remove them.
- [ ] A missing compiler, unsupported payload version, or malformed ACL payload fails closed.
- [ ] Audited master bypass adds no ACL predicate but follows the same adapter, validation, hook, transaction, and diagnostics path.
- [ ] The compiler contains no native schema-operation or field-decision behavior already enforced by Core Access.

## Tests

- [ ] ACL subject and operation matrices run against live PostgreSQL.

## Out of scope

- Native schema operation decisions, which do not compile into row predicates.
- Role graph resolution, which is owned by `@ultimabase/roles-plugin` and consumed before the adapter boundary.
- Native field input, selection, and output restrictions.
