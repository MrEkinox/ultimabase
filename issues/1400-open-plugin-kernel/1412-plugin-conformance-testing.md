# 1412: Add plugin conformance testing utilities

- Status: planned
- Milestone: 14
- Packages: `@ultimabase/testing`, `@ultimabase/core`, `@ultimabase/typegen`, `@ultimabase/plugin-kit`
- Depends on: 1411
- ADR: ADR-0186, ADR-0187, ADR-0188, ADR-0190, ADR-0191, ADR-0192, ADR-0193

## Goal

Give plugin authors one reusable test harness for the kernel invariants official
and community packages must satisfy.

## Acceptance criteria

- [ ] `@ultimabase/testing` exposes a documented plugin conformance suite and focused fixture builders without imposing PostgreSQL on logical-only plugins.
- [ ] The suite can verify manifests, instance identities, privilege denials, environmental claims, capability lifetimes and requirements, deterministic static declarations, provenance, lifecycle cleanup, and application isolation.
- [ ] Optional modules verify generic Typegen output, JavaScript operation without Typegen, custom operations, schema and model handles, transport bindings, middleware, persistence rewrites, codecs, upgrades, orphaned removal, and adapter capability failures.
- [ ] Tests can run against source and packed public exports and report the exact failed conformance contract.
- [ ] The harness never reads private Core registries or grants privileges that the tested plugin did not declare.
- [ ] Official plugin packages adopt the applicable public conformance suites.

## Tests

- [ ] Self-tests prove passing, failing, cleanup, deterministic, packed, Typegen, and no-Typegen plugin fixtures.
- [ ] Language-service tests document concise setup and exact fixture inference.

## Out of scope

- Replacing focused package-specific behavioral tests.
- A remote certification or marketplace publication service.
