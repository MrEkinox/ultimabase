# 427: Verify the complete ACL PostgreSQL vertical

- Status: completed
- Milestone: 4
- Packages: `@ultimabase/acl-permissions-plugin`, `@ultimabase/core`, `@ultimabase/postgres-plugin`, `@ultimabase/testing`
- Depends on: 412, 415, 426, 428, 509, 510, 518
- ADR: ADR-0116, ADR-0117, ADR-0122, ADR-0128

## Goal

Prove the complete public ACL developer experience through packed exports and a
live worker-isolated PostgreSQL database.

## Acceptance criteria

- [x] One schema default derives an ACL from the field-resolved create candidate and the optional current principal.
- [x] Public, authenticated, multiple exact-principal, and multiple role grants enforce read, update, and delete correctly while ACL management remains master-only.
- [x] Principals from different schemas with the same ID remain distinct.
- [x] Native schema and field Access, developer Query filters, beforeFind transforms, and ACL constraints combine through logical `AND` in SQL.
- [x] Singular, count, exists, cursor, bulk, pointer, and relation paths cannot observe inaccessible rows or bypass ACL field restrictions.
- [x] An ACL-protected RoleSchema enforces role-row updates, member and nested-role commands, and deletion without recursive authorization while ACL management remains master-only.
- [x] JSON round-trip, explicit ACL input, shared create/update input resolution, limits, role UUID persistence, and reference cleanup work through public package exports.
- [x] Master bypasses ACL authorization while validation, default generation, hooks, transactions, database constraints, and post-commit audit behavior still execute.
- [x] Applications without auth or roles retain public/master ACL behavior; compatible fixture providers satisfy principal and role contracts without official package-name checks.
- [x] Rollback emits no committed ACL state or post-commit event, and multiple applications remain isolated under parallel workers.
- [x] Core imports no ACL, authentication, or roles implementation and no public type contains `any`.

## Tests

- [x] Docker-backed public-export E2E fixtures cover the complete matrix, assert indexed JSONB plans without ACL joins, and run in the ordinary root E2E command.

## Verification map

- `acl-access-postgres` covers public, authenticated, multiple principal and
  role subjects, all three rights, singular and bulk mutation filtering,
  count, exists, and master-only ACL management.
- `acl-composition-postgres` covers field-resolved defaults, exact current
  principals, schema-qualified identity, native and field Access, developer
  filters, `beforeFind`, cursor mode, and ACL constraints in one SQL path.
- `acl-relationships-postgres` covers inaccessible pointer targets, inclusion,
  relation traversal, relation mutation, count, exists, cursor mode, and ACL
  field projection without existence disclosure.
- `acl-role-schema-postgres` covers UUID-backed role grants, recursion-free
  membership resolution, role updates, member and nested-role commands,
  deletion, and master-only ACL replacement on the role schema itself.
- `acl-storage-postgres`, `acl-reference-cleanup-postgres`, and
  `acl-events-postgres` cover canonical JSONB round-trip, explicit input,
  limits, indexed no-join plans, cleanup, rollback, application isolation, and
  committed audit delivery.
- `access-provider-composition` proves optional and community providers compose
  through neutral service tokens without plugin-name checks.
