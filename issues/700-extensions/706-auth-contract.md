# 706: Define authentication plugin contract

- Status: planned
- Milestone: 7+
- Packages: future `@ultimabase/auth-plugin`
- Depends on: 350, 617
- ADR: ADR-0113

## Goal

Define an optional authentication plugin contract that owns its user schema,
credentials, sessions, custom auth operations, and typed request identity without
adding authentication concepts to Core.

## Acceptance criteria

- [ ] Authentication and authorization remain distinct.
- [ ] Installing no authentication plugin creates no user schema, auth operation, session service, or request identity.
- [ ] The plugin contributes a default typed User schema and accepts an explicitly compatible custom schema.
- [ ] `signUp`, `login`, `logout`, and refresh behavior are plugin-owned custom operations shared by every installed transport integration.
- [ ] Validated sessions derive immutable contexts through the generic request-value boundary from issue 350.
- [ ] The plugin exposes a typed principal token and `runWithSession()` helper without adding `user` authority to Core.
- [ ] The package may expose concise `authenticated()` and current-principal native Access decisions that read only its typed request value and perform no credential validation during Access.
- [ ] Native Access helpers, ACL, roles, and community policy providers consume neutral typed identity contracts rather than importing this plugin.
- [ ] Session secrets never enter request metadata.
- [ ] Query terminals never accept raw session tokens or provider credentials.

## Tests

- [ ] Applications start and execute normally without the plugin.
- [ ] Authenticated context derivation, invalid sessions, schema contribution, and custom operation contracts are covered through public exports.
- [ ] REST and GraphQL fixtures normalize the same plugin-owned auth operations and principal context.
