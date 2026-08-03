# 406: Implement rolePermissionPlugin

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/roles`
- Depends on: 204, 207, 405, 420
- ADR: ADR-0003, ADR-0006, ADR-0116

## Goal

Let `rolePermissionPlugin` provide the neutral role-resolution capability from
issue 420 together with optional transport metadata.

## Acceptance criteria

- [ ] `rolePermissionPlugin` provides the neutral service without requiring consumers to import its factory, plugin definition, or implementation types.
- [ ] CLP and ACL consume only the neutral types and service token and never import or identify `rolePermissionPlugin` directly.
- [ ] Role APIs are hidden unless exposure is enabled.
- [ ] Plugin instances are application-isolated.

## Tests

- [ ] Service-contract tests prove the official provider satisfies issue 420's public contract.
- [ ] Missing/installed optional-role integration fixtures prove that absence alone is valid until a role-aware policy requires the service.
