# 406: Implement rolePermissionPlugin

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/roles`
- Depends on: 204, 207, 405
- ADR: ADR-0003, ADR-0006

## Goal

Register role resolution services and optional transport metadata as a plugin.

## Acceptance criteria

- [ ] CLP and ACL can discover role services without hard dependency.
- [ ] Role APIs are hidden unless exposure is enabled.
- [ ] Plugin instances are application-isolated.

## Tests

- [ ] Missing/installed optional-role integration fixtures.
