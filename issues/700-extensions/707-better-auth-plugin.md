# 707: Implement Better Auth plugin

- Status: planned
- Milestone: 7+
- Packages: future auth-better-auth package
- Depends on: 706
- ADR: none

## Goal

Implement the authentication contract through Better Auth and expose role-compatible user identity.

## Acceptance criteria

- [ ] Auth tables and migrations remain plugin-owned.
- [ ] REST and GraphQL share normalized auth behavior.
