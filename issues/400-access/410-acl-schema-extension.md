# 410: Implement aclPermissions schema extension

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/acl-permissions`
- Depends on: 103, 409, 417, 420
- ADR: ADR-0002, ADR-0006, ADR-0116

## Goal

Configure ACL enablement, defaults, and create-input policy as a provider for
the native Access lifecycle.

## Acceptance criteria

- [ ] Create policy supports `default-only`, `client`, and `master-only`.
- [ ] Default ACL factories are synchronous and context-aware.
- [ ] ACL may be enabled globally and overridden per schema.
- [ ] The extension contains no executable hook and identifies only the ACL Access provider that owns it.

## Tests

- [ ] Type and configuration normalization tests.
