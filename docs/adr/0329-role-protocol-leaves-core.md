# ADR-0329: The role resolver protocol leaves Core

- Status: accepted
- Date: 2026-10-13
- Refines: the microkernel rule of AGENTS.md ("Core never knows a plugin"), ADR-0304 (Core
  principal), ADR-0311 and ADR-0316 (plugin-author entry and `definePlugin`), ADR-0321 (ACL),
  ADR-0322 (Roles); applies ADR-0288
- Approval: listed as a Core leak in the pre-release simplification mandate
  (`docs/handoff/simplification.md`, "Fuites de Core à corriger") and scheduled in migration step
  6.8b by the user on 2026-10-13; record accepted by the user on 2026-10-13

## Context

Core exports a role protocol: `requestRoleResolverCapability`, the `RequestRoleResolver` contract,
`requireCurrentRequestRoleResolver` and `resolveRequestRoleReference`. Only ACL (role entries,
reference cleanup) and Roles (the provider) use them. Core therefore names a plugin concept,
"role", although it never evaluates roles itself; it only hosts the capability so that ACL and
Roles meet without importing each other. Generic subject references (`RequestSubjectReference`,
`defineRequestSubjectReferenceCleanup`, the cleanup capability) are not role-specific and also
describe principals.

## Decision

1. **The role contract moves to `@ultimabase/plugin-kit`**: the capability, the
   `RequestRoleResolver` contract and the helpers that resolve a role reference for the current
   request. Roles provides it, ACL consumes it, and neither imports the other. Core's public API
   loses the four role names (main and plugin entries) and keeps no role wording.
2. **Generic subject references stay in Core** (`RequestSubjectReference` and the reference
   cleanup capability): they describe any stored subject (a principal, a role, a future group)
   and Core's private storage cleans them.
3. Whatever the helpers needed from Core internals (application attribution of the contributing
   plugin, capability lookup for the active request) is reached through the existing public
   plugin-author entry; if a piece is missing, it is added there generically, named without
   "role", with one current consumer.

## Consequences

- ACL and Roles import the contract from plugin-kit; error messages and hints keep naming Roles
  as the provider to install.
- Tests: Roles and ACL together and apart, role entries and reference cleanup unchanged, Core's
  public export list without role names, `yarn constraints` (dependency direction), DX audit.
- Documentation impact: internal engineering documentation and the plugin-kit and Core READMEs
  (the website does not document this contract).

## Out of scope

Role permissions (`hasPermission`), group subjects, multi-tenant role scoping.
