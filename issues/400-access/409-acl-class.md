# 409: Implement immutable ACL class

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/acl-permissions`
- Depends on: 401
- ADR: ADR-0005, ADR-0006

## Goal

Create immutable grants for public, authenticated, user, and role subjects.

## Acceptance criteria

- [ ] Rights are read, update, delete, and manageAcl.
- [ ] Grant and revoke methods return new instances.
- [ ] Role references accept UUID or name.
- [ ] Serialization is stable and validation is strict.

## Tests

- [ ] Branching immutability and malformed input tests.
