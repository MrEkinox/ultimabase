# 409: Implement immutable ACL class

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/acl-permissions`
- Depends on: 401
- ADR: ADR-0005, ADR-0006, ADR-0113

## Goal

Create immutable grants for public, authenticated, user, and role subjects.

These subjects belong to the ACL domain. They do not add corresponding access
modes or user identifiers to Core.

## Acceptance criteria

- [ ] Rights are read, update, delete, and manageAcl.
- [ ] Grant and revoke methods return new instances.
- [ ] Role references accept UUID or name.
- [ ] Serialization is stable and validation is strict.

## Tests

- [ ] Branching immutability and malformed input tests.
