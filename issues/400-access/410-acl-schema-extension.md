# 410: Implement aclPermissions schema extension

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/acl-permissions`
- Depends on: 103, 409, 417, 420
- ADR: ADR-0002, ADR-0006, ADR-0116

## Goal

Configure ACL storage, defaults, and create-input policy for the persisted ACL
provider. Native schema and field Access remain available without this
extension.

## Acceptance criteria

- [ ] Create policy supports `default-only`, `client`, and `master-only`.
- [ ] Default ACL factories are synchronous and context-aware.
- [ ] ACL may be enabled globally and overridden per schema.
- [ ] The extension contains no executable hook and identifies only the ACL Access provider that owns it.
- [ ] Installing no ACL extension adds no field, table, Access contribution, transport input, or runtime stage.

## Tests

- [ ] Type and configuration normalization tests.
