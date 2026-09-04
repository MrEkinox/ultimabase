# 707: Implement Better Auth plugin

- Status: planned
- Milestone: 7+
- Packages: future `@ultimabase/better-auth-plugin`
- Depends on: 2304
- ADR: ADR-0113, ADR-0224

## Goal

Integrate Better Auth independently through the public HTTP, operation, schema,
and request-value capabilities without depending on the official Password Auth
plugin or introducing authentication behavior in Core.

## Acceptance criteria

- [ ] Auth tables and migrations remain plugin-owned.
- [ ] User schema, `signUp`, `login`, `logout`, and session refresh remain absent when the plugin is not installed.
- [ ] The package derives typed request context and never grants an operation or field permission by itself.
- [ ] REST and GraphQL share normalized auth behavior.
- [ ] The package depends on the shared HTTP boundary rather than REST or
      GraphQL and owns its provider-specific operations and session semantics.
- [ ] Access, ACL, and roles consume only neutral subject contracts and never
      import this package.

## Out of scope

- Reusing Password Auth storage, credentials, sessions, operations, or public
  types merely to manufacture a generic authentication engine.
