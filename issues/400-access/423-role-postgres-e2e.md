# 423: Verify the complete stored-role vertical

- Status: completed
- Milestone: 4
- Packages: `@ultimabase/core`, `@ultimabase/roles-plugin`, `@ultimabase/postgres-plugin`
- Depends on: 406, 518, 747
- ADR: ADR-0086, ADR-0087, ADR-0116, ADR-0118, ADR-0119

## Goal

Prove developer-defined RoleSchema declarations, model commands, relations,
hierarchy resolution, and native Access through the complete public
Runtime-to-PostgreSQL pipeline before ACL or a transport depends on roles.

## Acceptance criteria

- [x] One public-export fixture defines a custom RoleSchema with an exact member schema, additional fields, indexes, native Access, hooks, and current-member resolution.
- [x] Role drafts create ordinary persisted schema models; Query and model update/delete commands preserve custom fields, inference, selections, Access, hooks, transactions, and audit-ready events.
- [x] `addMember`, `removeMember`, `addRole`, and `removeRole` execute against live PostgreSQL with exact member and role-domain typing.
- [x] Direct member, inherited member, diamond hierarchy, duplicate paths, rename, every deletion policy, and cycle rollback behave deterministically.
- [x] `hasRole()` composes with native operation and field Access, Access filters, anonymous execution, audited master authority, and the generic decision combinators from issue 407.
- [x] `new Query(AppRole)` and `AppRole.query()` remain equivalent advanced server APIs and cannot bypass role invariants.
- [x] Multiple RoleSchema domains, multiple applications, and parallel workers remain isolated.
- [x] Role schemas are absent from generated transport metadata by default without restricting trusted server Query use.
- [x] Public hovers expose concise RoleSchema, role-reference, model-command, member, nested-role, and Access-helper types with focused English JSDoc.
- [x] Core imports no roles or PostgreSQL implementation, roles imports only public Core contracts, and packed declarations contain no deep imports or `any`.

## Tests

- [x] Targeted unit and type checks plus a Docker-backed, worker-isolated PostgreSQL E2E cover the full matrix through public package exports.

The worker-isolated E2E executes seven public-export scenarios against live
PostgreSQL. It also guards the adapter-to-hook materialization boundary by
reloading hierarchy roots inside the active transaction before cycle checks.

## Out of scope

- ACL storage or ACL-to-role composition, owned by issues 409–415 and 509–510.
- REST, GraphQL, or authentication-provider routes.
