# 408: Implement clpPermissionPlugin

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/clp-permissions`
- Depends on: 210, 407, 417, 418, 420
- ADR: ADR-0006, ADR-0090, ADR-0113, ADR-0116

## Goal

Provide global defaults and per-schema CLP as native Access operation
contributions.

## Acceptance criteria

- [ ] Schema rules override the matching global operation default.
- [ ] CLP imports only neutral role-reference and service-token types and never imports or identifies `rolePermissionPlugin`.
- [ ] A configured role rule requires the neutral role-resolution service and fails application setup before infrastructure starts when no provider is installed.
- [ ] CLP does not resolve or require the role service when no configured rule references a role.
- [ ] CLP registers operation policies through schema-extension or global Access targets and never installs business hooks for enforcement.
- [ ] CLP decisions compile into the shared deny-only Access plan and therefore cannot override native or plugin denial.
- [ ] Runtime receives no CLP configuration, stage name, neutral handler, or master-bypass decision.
- [ ] Authenticated and user rules resolve only through optional typed context providers and fail closed when configured identity is unavailable.

## Tests

- [ ] Anonymous, fixture-identity, role, master, native-Access composition, identity-free, role-free, missing-provider, and compatible-provider matrices.
