# 415: Verify independent permission-plugin composition

- Status: planned
- Milestone: 4
- Packages: access plugins
- Depends on: 408, 411, 414, 419, 420
- ADR: ADR-0003, ADR-0006, ADR-0090, ADR-0116

## Goal

Prove each permission provider works independently and composes with native
Access through top-level or nested plugin configuration.

## Acceptance criteria

- [ ] CLP works without roles when no role rule exists.
- [ ] ACL works without roles when no role subject exists.
- [ ] CLP and ACL work independently and neither plugin imports, installs, or requires the other.
- [ ] When both are installed, effective authorization is the logical `AND` of their independent decisions and neither can override a denial.
- [ ] Native schema and field Access declarations compose with every installed provider through the same `AccessPlan`.
- [ ] Field permissions work without ACL.
- [ ] Installing CLP or ACL without a role provider succeeds when its complete normalized configuration contains no role reference.
- [ ] A CLP role rule or ACL role subject without a role-resolution provider fails setup before connect, migration, or transport startup.
- [ ] CLP and ACL consume the neutral role-resolution capability without inspecting the provider's plugin name or implementation; a compatible fixture provider is sufficient.

## Tests

- [ ] Configuration matrix covers native-only, CLP-only, ACL-only, field-only, combined, role-free, missing-provider, compatible-provider, top-level, and nested declarations.
