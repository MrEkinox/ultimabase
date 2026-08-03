# 420: Define optional Access subject capabilities

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/core`
- Depends on: 350, 417
- ADR: ADR-0043, ADR-0113, ADR-0116

## Goal

Let permission providers consume optional authenticated-principal and role
resolution capabilities without importing a concrete authentication or role
plugin.

## Acceptance criteria

- [ ] Core exports nominal generic subject-value and subject-resolution contracts rather than a native User schema, user authority mode, or session type.
- [ ] A provider can declare a typed principal token or resolver service required by one Access contribution.
- [ ] Role reference types and the neutral role-resolution service contract do not expose the official `rolePermissionPlugin` definition or implementation identity.
- [ ] CLP and ACL packages may consume only these neutral contracts and never import or identify the authentication or role plugin factories.
- [ ] Installing no provider remains valid until a configured Access contribution references its subject kind.
- [ ] Missing dynamically required context data fails closed at execution; missing statically required services fail application setup before infrastructure starts.
- [ ] Compatible community providers satisfy the same identity-based token or service contract.

## Tests

- [ ] Public type tests cover exact principal and resolved-subject inference without introducing native user authority.
- [ ] Setup fixtures cover absent, unused, missing-required, official-compatible, community-compatible, duplicate, and cross-application providers.

## Out of scope

- User schemas, credentials, sessions, login operations, role persistence, or membership graphs.
