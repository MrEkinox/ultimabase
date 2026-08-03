# 413: Implement fieldPermissions extension

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/field-permissions`
- Depends on: 103, 401, 417, 419, 420, 421
- ADR: ADR-0002, ADR-0006, ADR-0116

## Goal

Attach provider-specific grouped read-disclosure plus create and update rules
to fields through the native Access contribution contract.

## Acceptance criteria

- [ ] Rules are field extensions.
- [ ] Rule types receive schema and context.
- [ ] Field read contributions follow the native `item`, `filter`, and `order` channels and never make filtering or ordering more permissive than the configured disclosure policy.
- [ ] Create and update receive exact input and prepared item data where available.
- [ ] Required storage does not imply readable transport output.
- [ ] The extension stores configuration only and Core knows no field-permission rule vocabulary.

## Tests

- [ ] Field-kind and context inference tests.
