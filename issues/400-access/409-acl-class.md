# 409: Implement immutable ACL class

- Status: ready
- Milestone: 4
- Packages: `@ultimabase/acl-permissions-plugin`
- Depends on: 401, 402, 419, 420
- ADR: ADR-0005, ADR-0006, ADR-0113, ADR-0116, ADR-0122

## Goal

Create the immutable public value used to grant object rights to public,
authenticated, exact-principal, and role subjects. ACL is an object-level
policy value consumed by native Access, not a parallel authorization engine.

These subjects belong to the ACL domain. They do not add corresponding access
modes or user identifiers to Core.

## Acceptance criteria

- [ ] Rights are read, update, delete, and manageAcl.
- [ ] Symmetric `grant*`, `revoke*`, and `set*Permissions` methods cover public, authenticated, exact-principal, and role subjects and return new instances.
- [ ] `grant*` unions rights, `revoke*` removes only selected rights, `set*Permissions` replaces one subject's complete rights, and removing the final right removes the subject entry.
- [ ] One ACL retains any number of principals and roles without collisions or order-dependent behavior.
- [ ] Principal grants accept exact Core Pointers and compare schema class name plus object ID, including principals from multiple schemas.
- [ ] Role grants and inspection accept schema-qualified UUID or name references plus persisted role models exposing the neutral reference capability, without importing the concrete RoleSchema or roles plugin.
- [ ] Targeted `permissionsFor*` and `has*Permission` inspection returns detached readonly values with compact hover types.
- [ ] Equivalent repeated grants and revocations are deterministic and idempotent.
- [ ] No master subject, `grantMaster`, mutable entry collection, or generic string-subject escape hatch is exposed.
- [ ] Constructing or modifying an ACL performs no persistence or subject resolution.

## Tests

- [ ] Runtime tests cover every subject and right, multiple principals and roles, branching immutability, idempotency, replacement, and final-entry removal.
- [ ] Compile-time and language-service tests protect exact Pointer inputs, role-reference compatibility, autocomplete, JSDoc, and concise public hovers.

## Out of scope

- JSON parsing and serialization, owned by issue 424.
- Schema configuration, Access execution, adapters, or subject resolution.
