# 2312: Implement local password identities

- Status: planned
- Milestone: 23
- Packages: `@ultimabase/password-auth-plugin`, `@ultimabase/core`, `@ultimabase/typegen`
- Depends on: 2318, 2322
- ADR: ADR-0113, ADR-0224, ADR-0234, ADR-0235

## Goal

Create the optional local Password Auth plugin with an exact User identity and
credential boundary while granting no authorization and exposing no password
material as ordinary schema data.

## Acceptance criteria

- [ ] Create a complete publishable `packages/password-auth-plugin` workspace
      exporting `passwordAuthPlugin()`.
- [ ] The plugin contributes the accepted default typed User schema and only
      the extension or composition boundary approved by ADR-0235.
- [ ] The accepted username identifier has deterministic normalization,
      uniqueness, lookup, and enumeration-resistant failure behavior; email is
      not an authentication identifier in v1.
- [ ] Password input is accepted only by credential operations and is absent
      from ordinary User create, update, read, selection, Typegen, events,
      hooks, diagnostics, and serialization.
- [ ] Credential storage is never automatically exposed through a generated
      schema route or operation binding.
- [ ] Ordinary application Query and operation handles cannot read or mutate
      credential storage; only the exact Password Auth callbacks authorized by
      ADR-0234 and ADR-0235 can execute its internal persistence path.
- [ ] Internal credential work uses only the approved audited authority or
      protected storage boundary and never a hidden flag, raw adapter, public
      schema name, transport secret, or policy bypass invented by this plugin.
- [ ] Passwords use a maintained established password-hashing implementation,
      per-password salts, configurable bounded work, versioned encoded hashes,
      and an upgrade path; no custom cryptography is introduced.
- [ ] Credential comparison and failure responses avoid identifier discovery
      and observable early-exit differences where practical.
- [ ] The plugin exports nominal typed principal identity without adding a Core
      `user` authority mode.
- [ ] Installing no plugin contributes no User schema, credential field,
      identity token, operation, option, Runtime behavior, or database metadata.
- [ ] Access, ACL, and roles consume only neutral subject contracts and never
      import or identify this plugin.

## Tests

- [ ] Schema, custom-schema, normalization, uniqueness, hashing, upgrade,
      redaction, enumeration, application isolation, type, and public-export
      tests.
- [ ] PostgreSQL tests prove credential persistence through public logical
      contracts without a PostgreSQL dependency in the plugin.

## Out of scope

- Sessions, HTTP headers, login routes, password recovery, email verification,
  MFA, OAuth, HTTP Basic, Better Auth, and authorization grants.
