# 410: Implement aclPermissions schema extension

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/acl-permissions`
- Depends on: 103, 409
- ADR: ADR-0002, ADR-0006

## Goal

Configure ACL enablement, defaults, and create-input policy.

## Acceptance criteria

- [ ] Create policy supports `default-only`, `client`, and `master-only`.
- [ ] Default ACL factories are synchronous and context-aware.
- [ ] ACL may be enabled globally and overridden per schema.

## Tests

- [ ] Type and configuration normalization tests.
