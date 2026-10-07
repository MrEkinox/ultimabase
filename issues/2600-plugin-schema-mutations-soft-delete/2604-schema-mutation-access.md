# 2604: Extend official Access for plugin-owned schema mutations

- Status: completed
- Milestone: 26
- Packages: `@ultimabase/access-plugin`, `@ultimabase/core`, `@ultimabase/typegen`
- Depends on: 2603
- ADR: [ADR-0245](../../docs/adr/0245-plugin-schema-mutations-and-soft-delete.md)

## Goal

Let the optional official Access engine authorize each declared schema mutation
under its own generated operation key without making Core depend on Access.

## Acceptance criteria

- [x] The compiled mutation surface augments exact schema Access options and
      plugin defaults with typed operation keys such as `softDelete` only for
      schemas that declare them.
- [x] An explicit mutation policy is independent from native update and delete
      policy; neither can silently grant the other.
- [x] Initial operation, item, target-filter, value-dependent, and final output
      restrictions run at the accepted Runtime boundaries and compose by denial
      or logical AND.
- [x] Omitted operation declarations follow one documented fail-closed default
      rule without changing the existing built-in defaults.
- [x] Compatible official providers may narrow a custom mutation through the
      public contribution capability, exact owner attribution, and ordinary
      peer compatibility.
- [x] Trusted Master bypasses the complete official Access policy while Core
      validation, protected integrity constraints, Hooks, transactions, and
      persistence remain active.
- [x] Omitting `accessPlugin()` installs no policy stage and does not prevent a
      structurally valid plugin mutation from executing.
- [x] Typegen, autocomplete, hover documentation, JavaScript validation, and
      packed exports agree on the application-specific operation vocabulary.

## Tests

- [x] Policy matrices cover allow, deny, omitted defaults, item filters,
      compatible providers, no engine, Master, two applications, and coexistence
      with native update and delete rules.
- [x] Compile-time tests prove exact keys and reject unknown or stale mutation
      declarations.

## Completion evidence

- Core exposes the final callback-free mutation vocabulary through the
  application-local `applicationSchemaMutationSurfaceCapability`. Its canonical
  provider is installed only for declared consumers and cannot be provided,
  replaced, or decorated by plugins.
- Access compiles exact request-authority mutation branches from that catalog.
  Developer rules own the base allow decision, compatible providers can only
  narrow it, target filters compose by logical `AND`, and item rules observe the
  locked original plus the owner-resolved candidate without replaying native
  update or delete policy.
- Omitted custom rules deny by default. A boolean plugin default applies to
  native and custom operations, while granular `schemaMutations` remains
  independently fail-closed. Master-only commands never enter request Access,
  and audited Master bypasses the complete official policy.
- Typegen format 17 retains exact mutation authority, effect, returning mode,
  dependency selection, payload, and error types. Language-service tests prove
  exact completion, hover types, callback payloads, and rejection of stale or
  Master-only keys; JavaScript repeats final graph validation before setup.
- Focused tests passed 15 tests across Core, Access, and Typegen. Packed public
  API and generated-type tests passed 26 tests. `yarn typecheck`, `yarn test`,
  `yarn lint`, `yarn build`, `yarn constraints`, `yarn check:issues`,
  `yarn format:check`, and `git diff --check` passed. The full suite passed
  2,264 tests in 478 files; lint reported only existing line-budget warnings.

## Out of scope

- Making the soft-delete plugin depend on or install the official Access engine.
