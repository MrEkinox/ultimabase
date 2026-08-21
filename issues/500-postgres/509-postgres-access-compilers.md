# 509: Compile PostgreSQL ACL constraints

- Status: completed
- Milestone: 5
- Packages: `@ultimabase/acl-postgres-plugin`, `@ultimabase/postgres-plugin`, `@ultimabase/acl-permissions-plugin`
- Depends on: 338, 411, 505, 506, 510
- ADR: ADR-0006, ADR-0007, ADR-0090, ADR-0103, ADR-0113, ADR-0116, ADR-0122, ADR-0125

## Goal

Compile the ACL provider's opaque Access filter into indexed JSONB containment
predicates through the generic PostgreSQL constraint registry and into the same
SQL operation as the developer query.

## Acceptance criteria

- [x] The dedicated ACL/PostgreSQL integration registers one namespaced, versioned compiler without exposing its payload to Runtime.
- [x] ACL uses the row-local JSONB column from issue 510 and parameterized GIN-indexable containment predicates without an ACL-table join.
- [x] Resolved public, authenticated, exact-principal, and role subjects compile consistently, including multiple matching principals and roles.
- [x] PostgreSQL receives already-resolved subject identifiers and never reads Core authority as an authenticated user identity.
- [x] Find, count, update, delete, and bulk operations combine ACL filtering with every query predicate using logical `AND`.
- [x] ACL filters compose with native Access filters and other provider constraints without `beforeFind` being able to inspect or remove them.
- [x] A missing compiler, unsupported payload version, or malformed ACL payload fails closed.
- [x] Audited master bypass adds no ACL predicate but follows the same adapter, validation, hook, transaction, and diagnostics path.
- [x] The compiler contains no native schema-operation or field-decision behavior already enforced by Core Access.

## Tests

- [x] ACL subject and operation matrices run against live PostgreSQL through the root Testcontainers project.

## Out of scope

- Native schema operation decisions, which do not compile into row predicates.
- Role graph resolution, which is owned by `@ultimabase/roles-plugin` and consumed before the adapter boundary.
- Native field input, selection, and output restrictions.
