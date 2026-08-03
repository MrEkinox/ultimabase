# 707: Implement Better Auth plugin

- Status: planned
- Milestone: 7+
- Packages: future auth-better-auth package
- Depends on: 706
- ADR: ADR-0113

## Goal

Implement the optional authentication contract through Better Auth, including
the contributed User schema and auth operations, and expose a role-compatible
typed principal identity.

## Acceptance criteria

- [ ] Auth tables and migrations remain plugin-owned.
- [ ] User schema, `signUp`, `login`, `logout`, and session refresh remain absent when the plugin is not installed.
- [ ] REST and GraphQL share normalized auth behavior.
