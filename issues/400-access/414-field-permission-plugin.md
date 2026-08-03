# 414: Implement fieldPermissionPlugin

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/field-permissions`
- Depends on: 210, 304, 413, 417, 418
- ADR: ADR-0006, ADR-0090, ADR-0116

## Goal

Provide native Access field policies that remove forbidden columns and reject
forbidden field use.

## Acceptance criteria

- [ ] Default selections silently omit unreadable fields.
- [ ] Explicit forbidden selection returns FIELD_PERMISSION_DENIED.
- [ ] Explicit forbidden filtering or ordering returns FIELD_PERMISSION_DENIED before adapter execution.
- [ ] Create and update never silently discard forbidden input.
- [ ] Master bypass is configurable.
- [ ] Field output hooks cannot restore unreadable fields or run for values removed by field permissions.
- [ ] Field permissions register grouped field-read Access contributions and only narrow input, item output, filter, order, and final output capabilities.
- [ ] The plugin installs no business hook for enforcement.
- [ ] Runtime receives no field-permission configuration, stage name, neutral handler, or bypass decision.

## Tests

- [ ] Grouped item/filter/order read plus create/update matrices, native-Access composition, and selected-column traces.
