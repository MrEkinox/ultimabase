# 2312: Implement local password identities

- Status: completed
- Milestone: 23
- Packages: `@ultimabase/password-auth-plugin`, `@ultimabase/core`, `@ultimabase/typegen`
- Depends on: 2318, 2322
- ADR: ADR-0113, ADR-0224, ADR-0234, ADR-0235

## Goal

Create the optional local Password Auth plugin with an exact User identity and
credential boundary while granting no authorization and exposing no password
material as ordinary schema data.

## Acceptance criteria

- [x] Create a complete publishable `packages/password-auth-plugin` workspace
      exporting `passwordAuthPlugin()`.
- [x] The plugin contributes the accepted default typed User schema and only
      the extension or composition boundary approved by ADR-0235.
- [x] The accepted username identifier has deterministic normalization,
      uniqueness, lookup, and enumeration-resistant failure behavior; email is
      not an authentication identifier in v1.
- [x] Password input is accepted only by credential operations and is absent
      from ordinary User create, update, read, selection, Typegen, events,
      hooks, diagnostics, and serialization.
- [x] Credential storage is never automatically exposed through a generated
      schema route or operation binding.
- [x] Ordinary application Query and operation handles cannot read or mutate
      credential storage; only the exact Password Auth callbacks authorized by
      ADR-0234 and ADR-0235 can execute its internal persistence path.
- [x] Internal credential work uses only the approved audited authority or
      protected storage boundary and never a hidden flag, raw adapter, public
      schema name, transport secret, or policy bypass invented by this plugin.
- [x] Passwords use a maintained established password-hashing implementation,
      per-password salts, configurable bounded work, versioned encoded hashes,
      and an upgrade path; no custom cryptography is introduced.
- [x] Credential comparison and failure responses avoid identifier discovery
      and observable early-exit differences where practical.
- [x] The plugin exports nominal typed principal identity without adding a Core
      `user` authority mode.
- [x] Installing no plugin contributes no User schema, credential field,
      identity token, operation, option, Runtime behavior, or database metadata.
- [x] Access, ACL, and roles consume only neutral subject contracts and never
      import or identify this plugin.

## Tests

- [x] Schema, custom-schema, normalization, uniqueness, hashing, upgrade,
      redaction, enumeration, application isolation, type, and public-export
      tests.
- [x] PostgreSQL tests prove credential persistence through public logical
      contracts without a PostgreSQL dependency in the plugin.

## Out of scope

- Sessions, HTTP headers, login routes, password recovery, email verification,
  MFA, OAuth, HTTP Basic, Better Auth, and authorization grants.

## Verification

- The package publishes the default and custom `User` composition points, an
  owner-private credential descriptor, nominal principal typing, and the exact
  reviewed `argon2@0.45.1` dependency without exporting credential helpers.
- PostgreSQL tests cover canonical usernames, uniqueness, Argon2id persistence,
  verification, monotonic hash upgrades, private reference cascade, and the
  absence of automatic REST routes for the plugin-owned User and credentials.
- `yarn constraints`, `yarn check:issues`, `yarn format:check`, `yarn typecheck`,
  `yarn test`, `yarn lint`, `yarn build`, `yarn test:pack:built`, and
  `yarn test:e2e:built` passed. The complete suite passed 401 files and 1,934
  tests, the packed-package suite passed 23 files and 118 tests, and the built
  E2E suite passed 60 files and 233 tests. Lint retained 77 pre-existing
  centralized line-budget warnings and no errors.
