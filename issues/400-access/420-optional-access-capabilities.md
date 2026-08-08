# 420: Define optional Access subject capabilities

- Status: done
- Milestone: 4
- Packages: `@ultimabase/core`
- Depends on: 350, 417
- ADR: ADR-0043, ADR-0113, ADR-0116, ADR-0117

## Goal

Let Access policy providers consume optional authenticated-principal and role
resolution capabilities without importing a concrete authentication or role
plugin.

## Acceptance criteria

- [x] Core exports nominal generic subject-value and subject-resolution contracts rather than a native User schema, user authority mode, or session type.
- [x] A provider can declare a typed principal token or resolver service required by one Access contribution.
- [x] Role reference types and the neutral role-resolution service contract do not expose the official `rolesPlugin` definition or implementation identity.
- [x] ACL and community policy packages may consume only these neutral contracts and never import or identify authentication or role plugin factories.
- [x] Installing no provider remains valid until a configured Access contribution references its subject kind.
- [x] Missing dynamically required context data fails closed at execution; missing statically required services fail application setup before infrastructure starts.
- [x] Compatible community providers satisfy the same identity-based token or service contract.

## Tests

- [x] Public type tests cover exact principal and resolved-subject inference without introducing native user authority.
- [x] Setup fixtures cover absent, unused, missing-required, official-compatible, community-compatible, duplicate, and cross-application providers.

## Out of scope

- User schemas, credentials, sessions, login operations, role persistence, or membership graphs.
