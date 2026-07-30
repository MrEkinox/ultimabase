# 413: Implement fieldPermissions extension

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/field-permissions`
- Depends on: 103, 401
- ADR: ADR-0002, ADR-0006

## Goal

Attach read, create, and update rules to fields without Schema knowing them.

## Acceptance criteria

- [ ] Rules are field extensions.
- [ ] Rule types receive schema and context.
- [ ] Required storage does not imply readable transport output.

## Tests

- [ ] Field-kind and context inference tests.
