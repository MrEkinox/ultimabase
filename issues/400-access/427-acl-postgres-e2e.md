# 427: Verify the complete ACL PostgreSQL vertical

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/acl-permissions-plugin`, `@ultimabase/core`, `@ultimabase/postgres-plugin`, `@ultimabase/testing`
- Depends on: 412, 415, 426, 428, 509, 510, 518
- ADR: ADR-0116, ADR-0117, ADR-0122

## Goal

Prove the complete public ACL developer experience through packed exports and a
live worker-isolated PostgreSQL database.

## Acceptance criteria

- [ ] One schema default derives an ACL from the field-resolved create candidate and the optional current principal.
- [ ] Public, authenticated, multiple exact-principal, and multiple role grants enforce read, update, delete, and manageAcl correctly.
- [ ] Principals from different schemas with the same ID remain distinct.
- [ ] Native schema and field Access, developer Query filters, beforeFind transforms, and ACL constraints combine through logical `AND` in SQL.
- [ ] Singular, count, exists, cursor, bulk, pointer, and relation paths cannot observe inaccessible rows or bypass ACL field restrictions.
- [ ] An ACL-protected RoleSchema enforces role-row updates, member and nested-role commands, deletion, and manageAcl without recursive authorization.
- [ ] JSON round-trip, explicit ACL input, shared create/update input resolution, limits, role UUID persistence, and reference cleanup work through public package exports.
- [ ] Master bypasses ACL authorization while validation, default generation, hooks, transactions, database constraints, and post-commit audit behavior still execute.
- [ ] Applications without auth or roles retain public/master ACL behavior; compatible fixture providers satisfy principal and role contracts without official package-name checks.
- [ ] Rollback emits no committed ACL state or post-commit event, and multiple applications remain isolated under parallel workers.
- [ ] Core imports no ACL, authentication, or roles implementation and no public type contains `any`.

## Tests

- [ ] Docker-backed public-export E2E fixtures cover the complete matrix, assert indexed JSONB plans without ACL joins, and run in the ordinary root E2E command.
