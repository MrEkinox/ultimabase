# 409: Implement immutable ACL class

- Status: ready
- Milestone: 4
- Packages: `@ultimabase/acl-permissions`
- Depends on: 401, 419, 420
- ADR: ADR-0005, ADR-0006, ADR-0113, ADR-0116

## Goal

Create immutable persisted grants for public, authenticated, principal, and
role subjects. ACL is an object-level policy value consumed by native Access,
not a parallel authorization engine.

These subjects belong to the ACL domain. They do not add corresponding access
modes or user identifiers to Core.

## Acceptance criteria

- [ ] Rights are read, update, delete, and manageAcl.
- [ ] Grant and revoke methods return new instances.
- [ ] Principal and role grants retain nominal neutral subject references rather than importing authentication or roles packages.
- [ ] Role references accept UUID or name.
- [ ] Serialization is stable and validation is strict.
- [ ] Constructing or modifying an ACL performs no persistence or subject resolution.

## Tests

- [ ] Branching immutability and malformed input tests.
