# 414: Implement fieldPermissionPlugin

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/field-permissions`
- Depends on: 210, 304, 312, 413
- ADR: ADR-0006

## Goal

Remove forbidden columns from selection and reject forbidden writes.

## Acceptance criteria

- [ ] Default selections silently omit unreadable fields.
- [ ] Explicit forbidden selection returns FIELD_PERMISSION_DENIED.
- [ ] Create and update never silently discard forbidden input.
- [ ] Master bypass is configurable.

## Tests

- [ ] Read/create/update matrices and selected-column traces.
