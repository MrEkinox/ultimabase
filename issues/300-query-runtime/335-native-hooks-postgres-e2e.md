# 335: Verify native hooks against PostgreSQL

- Status: planned
- Milestone: 3
- Packages: `@ultimabase/schema`, `@ultimabase/core`, `@ultimabase/runtime`, `@ultimabase/postgres`, `@ultimabase/testing`
- Depends on: 508, 518, 331, 332, 333, 334, 337, 338
- ADR: ADR-0087, ADR-0089, ADR-0090

## Goal

Prove the complete public native hook contract, plugin contributions, and
automatic rollback behavior against a live PostgreSQL database.

## Acceptance criteria

- [ ] One schema declares schema and inline field hooks through public exports.
- [ ] One plugin targets an exact schema, an exact field path, and a field kind without replacing developer hooks.
- [ ] One fixture policy plugin contributes a deny-only guard and registers a compiler for its opaque adapter constraint without Runtime knowing the policy name.
- [ ] Create, update, delete, save, find, output, and post-commit families execute in documented order.
- [ ] A before-hook writes a related row and a later failure rolls back both the hook write and primary mutation.
- [ ] A successful mutation commits once and releases buffered post-commit work afterward.
- [ ] `beforeFind` transforms a query while monotonic adapter constraints and field restrictions remain intact and the final result remains restricted after every result transform.
- [ ] Set-based bulk operations do not load rows merely to emulate item hooks.
- [ ] Tests use public built package exports and worker-isolated Testcontainers schemas.
- [ ] Package documentation shows the verified developer-facing API.

## Tests

- [ ] Root PostgreSQL E2E covers success, rollback, plugin order, read transforms, generic policy enforcement, output resolution, and bulk behavior.
- [ ] The scenario runs through `yarn test:e2e` and the GitHub CI Docker runner.

## Out of scope

- Concrete CLP, ACL, role, or field-permission behavior.
- REST and GraphQL transport-specific assertions.
