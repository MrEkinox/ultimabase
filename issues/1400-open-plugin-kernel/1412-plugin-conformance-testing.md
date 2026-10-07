# 1412: Add plugin conformance testing utilities

- Status: completed
- Milestone: 14
- Packages: `@ultimabase/testing`, `@ultimabase/core`, `@ultimabase/typegen`, `@ultimabase/plugin-kit`
- Depends on: 1411
- ADR: ADR-0186, ADR-0187, ADR-0188, ADR-0190, ADR-0191, ADR-0192, ADR-0193

## Goal

Give plugin authors one reusable test harness for the kernel invariants official
and community packages must satisfy.

## Acceptance criteria

- [x] `@ultimabase/testing` exposes a documented plugin conformance suite and focused fixture builders without imposing PostgreSQL on logical-only plugins.
- [x] The suite can verify manifests, instance identities, privilege denials, environmental claims, capability lifetimes and requirements, deterministic static declarations, provenance, lifecycle cleanup, and application isolation.
- [x] Optional modules verify generic Typegen output, JavaScript operation without Typegen, custom operations, schema and model handles, transport bindings, middleware, persistence rewrites, codecs, upgrades, orphaned removal, and adapter capability failures.
- [x] Tests can run against source and packed public exports and report the exact failed conformance contract.
- [x] The harness never reads private Core registries or grants privileges that the tested plugin did not declare.
- [x] Official plugin packages adopt the applicable public conformance suites.

## Tests

- [x] Self-tests prove passing, failing, cleanup, deterministic, packed, Typegen, and no-Typegen plugin fixtures.
- [x] Language-service tests document concise setup and exact fixture inference.

## Out of scope

- Replacing focused package-specific behavioral tests.
- A remote certification or marketplace publication service.

## Community-author review outcome

- Logical plugins omit both `schemas` and `supportPlugins`; the fixture infers
  exact empty tuples without PostgreSQL or another infrastructure dependency.
- One immutable suite covers the common kernel and adds only explicit named
  domain checks. Test frameworks remain an application choice.
- Fresh `FrameworkApplication` and `UltimaBase` fixtures preserve exact subject,
  dependency, and schema types and are disposed automatically after success or
  failure.
- Typegen is one implemented optional module. JavaScript operation checks use
  the same packed root exports without importing or generating Typegen output.
- No extra owner, privilege, registry, adapter, or certification abstraction was
  introduced.

## Validation

- `yarn typecheck`
- `yarn test` — 350 files and 2,021 tests passed.
- `yarn lint` — passed with only the repository's tracked size warnings.
- `yarn constraints`
- `yarn format:check`
- `yarn build` — package builds, `attw`, and `publint` passed.
- `yarn test:pack:built` — 11 files and 56 tests passed, including the
  JavaScript no-Typegen conformance fixture.
