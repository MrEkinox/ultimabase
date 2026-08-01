# 406: Implement rolePermissionPlugin

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/access`, `@ultimabase/roles`
- Depends on: 204, 207, 405
- ADR: ADR-0003, ADR-0006

## Goal

Define the neutral typed role-resolution capability and let
`rolePermissionPlugin` provide it together with optional transport metadata.

## Acceptance criteria

- [ ] `@ultimabase/access` exports the role-reference types and nominal typed role-resolution service token without importing `@ultimabase/roles`.
- [ ] `rolePermissionPlugin` provides the neutral service without requiring consumers to import its factory, plugin definition, or implementation types.
- [ ] CLP and ACL consume only the neutral types and service token and never import or identify `rolePermissionPlugin` directly.
- [ ] Role APIs are hidden unless exposure is enabled.
- [ ] Plugin instances are application-isolated.

## Tests

- [ ] Service-contract tests accept the official provider and a compatible fixture provider.
- [ ] Missing/installed optional-role integration fixtures prove that absence alone is valid until a role-aware policy requires the service.
