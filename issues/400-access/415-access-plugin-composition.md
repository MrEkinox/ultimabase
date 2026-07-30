# 415: Verify independent permission-plugin composition

- Status: planned
- Milestone: 4
- Packages: access plugins
- Depends on: 406, 408, 411, 414
- ADR: ADR-0003, ADR-0006

## Goal

Prove each permission plugin works independently and composes through nested plugin configuration.

## Acceptance criteria

- [ ] CLP works without roles when no role rule exists.
- [ ] ACL works without roles when no role subject exists.
- [ ] Field permissions work without ACL.
- [ ] Missing required role services fail setup only when role features are used.

## Tests

- [ ] Configuration matrix covers top-level and nested declarations.
