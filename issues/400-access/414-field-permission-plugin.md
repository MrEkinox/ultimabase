# 414: Implement fieldPermissionPlugin

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/field-permissions`
- Depends on: 210, 304, 328, 331, 337, 413
- ADR: ADR-0006, ADR-0089, ADR-0090

## Goal

Remove forbidden columns from selection and reject forbidden writes.

## Acceptance criteria

- [ ] Default selections silently omit unreadable fields.
- [ ] Explicit forbidden selection returns FIELD_PERMISSION_DENIED.
- [ ] Create and update never silently discard forbidden input.
- [ ] Master bypass is configurable.
- [ ] Field output hooks cannot restore unreadable fields or run for values removed by field permissions.
- [ ] Field permissions attach through field-extension hooks and only narrow input, selection, and output field sets.
- [ ] Runtime receives no field-permission configuration, stage name, neutral handler, or bypass decision.

## Tests

- [ ] Read/create/update matrices and selected-column traces.
